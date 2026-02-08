import { Router, Request, Response } from 'express'
import { z } from 'zod'
import * as agentBridgeService from '../services/agentBridgeService'
import * as sessionService from '../services/sessionService'
import * as sessionRepo from '../repositories/sessionRepository'
import * as subagentRepo from '../repositories/subagentRepository'
import logger from '@shared/util/logger'

/**
 * SSE streaming route for AI responses powered by the Pi SDK agent bridge.
 *
 * Why SSE instead of tRPC subscriptions?
 * - Simpler to implement and test
 * - No additional client link configuration
 * - Works with any frontend (fetch + ReadableStream)
 * - tRPC handles all CRUD; SSE handles just streaming
 *
 * Flow:
 * 1. Client sends POST with sessionId
 * 2. Server gets or creates a Pi agent session for this session
 * 3. Server gets the latest user message from the session
 * 4. Server sends message to Pi agent via agentBridgeService
 * 5. Server streams AI response as SSE events
 * 6. **Incrementally saves** assistant message to DB during streaming
 * 7. Sends final "done" event with saved message
 * 8. Auto-titles session after first AI response if untitled
 *
 * Incremental save strategy:
 * - Create the assistant message in DB on first text chunk
 * - Update it periodically (every ~500ms or on completion)
 * - On crash/restart, partial response is preserved in DB
 *
 * Event types:
 *   event: text       — { content: "delta text" }
 *   event: tool_start — { toolCallId, toolName, args }
 *   event: tool_end   — { toolCallId, toolName, isError }
 *   event: done       — { message: MessageOutput }
 *   event: error      — { error: string }
 *
 * NOTE (Rocky Talky): No auth checks — Tailscale is the auth layer.
 */

const streamRouter: Router = Router()

const generateRequestSchema = z.object({
  sessionId: z.string().cuid(),
})

/** Maximum time (ms) before a stream is forcibly terminated */
const STREAM_TIMEOUT_MS = 300_000 // 5 minutes (Pi agents can run longer)

/** Maximum accumulated response length (characters) before cutting off */
const MAX_RESPONSE_LENGTH = 100_000 // ~100k chars

/** How often to flush accumulated text to the database (ms) */
const DB_FLUSH_INTERVAL_MS = 500

/**
 * POST /api/stream/generate
 * Stream an AI response for a session using the Pi SDK agent bridge.
 *
 * Safety limits:
 * - 5-minute timeout (prevents hung connections)
 * - 100k character cap (prevents unbounded token usage)
 */
streamRouter.post('/generate', async (req: Request, res: Response): Promise<void> => {
  // --- Input validation ---
  const parsed = generateRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      issues: parsed.error.issues,
    })
    return
  }

  const { sessionId } = parsed.data

  // --- Verify session exists ---
  let session
  try {
    session = await sessionService.getSession(sessionId)
  } catch (err) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  // --- Get the last user message ---
  const lastUserMessage = await sessionService.getLastUserMessage(sessionId)
  if (!lastUserMessage) {
    res.status(400).json({ error: 'No user message found in session' })
    return
  }

  // --- Set up SSE ---
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  })

  // Handle client disconnect
  let aborted = false
  req.on('close', () => {
    aborted = true
  })

  // Enforce a maximum stream duration
  const timeout = setTimeout(() => {
    if (!aborted) {
      logger.warn({ sessionId }, 'AI stream timed out')
      sendSSE(res, 'error', { error: 'Response timed out' })
      aborted = true
      res.end()
    }
  }, STREAM_TIMEOUT_MS)

  // Send keepalive heartbeat every 15 seconds to prevent connection timeout
  // SSE comments (lines starting with ':') are ignored by EventSource
  const keepaliveInterval = setInterval(() => {
    if (!aborted) {
      res.write(': keepalive\n\n')
    }
  }, 15000)

  let fullText = ''
  let assistantMessageId: string | null = null
  let lastFlushTime = 0
  let lastFlushedLength = 0

  /**
   * Flush accumulated text to the database.
   * Creates the message on first call, updates on subsequent calls.
   */
  async function flushToDb(): Promise<void> {
    if (!fullText) return

    try {
      if (!assistantMessageId) {
        // First flush — create the message
        const saved = await sessionService.sendMessage({
          sessionId,
          content: fullText,
          role: 'assistant',
        })
        assistantMessageId = saved.id
        lastFlushedLength = fullText.length
        logger.debug({ sessionId, messageId: assistantMessageId }, 'Created assistant message (incremental)')
      } else if (fullText.length > lastFlushedLength) {
        // Subsequent flush — update content
        await sessionRepo.updateMessageContent(assistantMessageId, fullText)
        lastFlushedLength = fullText.length
      }
      lastFlushTime = Date.now()
    } catch (err) {
      logger.error({ err, sessionId }, 'Failed to flush assistant message to DB')
    }
  }

  try {
    // --- Get or create Pi agent session ---
    let agentSession = agentBridgeService.getSession(sessionId)
    if (!agentSession) {
      logger.info({ sessionId }, 'Creating new Pi agent session')
      agentSession = await agentBridgeService.createSession(sessionId)
    }

    // --- Stream response from agent ---
    const eventStream = agentBridgeService.sendMessage(sessionId, lastUserMessage)

    for await (const event of eventStream) {
      if (aborted) {
        logger.debug({ sessionId }, 'Client disconnected during stream')
        break
      }

      switch (event.type) {
        case 'text':
          fullText += event.content
          if (fullText.length > MAX_RESPONSE_LENGTH) {
            logger.warn({ sessionId, totalLength: fullText.length }, 'AI response exceeded max length')
            sendSSE(res, 'error', { error: 'Response too long' })
            aborted = true
            break
          }
          sendSSE(res, 'text', { content: event.content })

          // Periodically flush to DB
          if (Date.now() - lastFlushTime >= DB_FLUSH_INTERVAL_MS) {
            await flushToDb()
          }
          break

        case 'tool_start':
          // Flush text before tool execution (tools can take a while)
          if (fullText.length > lastFlushedLength) {
            await flushToDb()
          }
          sendSSE(res, 'tool_start', {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
          })
          break

        case 'tool_end':
          sendSSE(res, 'tool_end', {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            isError: event.isError,
          })
          break

        case 'completion':
          fullText = event.fullText // Use the full text from completion event
          break

        case 'error':
          logger.error({ sessionId, error: event.error }, 'Agent error during streaming')
          sendSSE(res, 'error', { error: event.error })
          aborted = true
          break

        case 'compaction_start':
          sendSSE(res, 'compaction_start', { reason: event.reason })
          break

        case 'compaction_end':
          sendSSE(res, 'compaction_end', {
            aborted: event.aborted,
            ...(event.error && { error: event.error }),
          })
          // Increment compaction count in the database
          await sessionRepo.incrementCompactionCount(sessionId)
          break

        case 'subagent_spawn':
          // Create subagent record in DB
          try {
            await subagentRepo.createSubagent({
              sessionId,
              description: event.description,
              tier: event.tier,
              status: 'running',
            })
            logger.debug({ sessionId, description: event.description }, 'Created subagent record')
          } catch (err) {
            logger.error({ err, sessionId }, 'Failed to create subagent record')
          }
          // Send SSE event to client
          sendSSE(res, 'subagent_spawn', {
            toolCallId: event.toolCallId,
            description: event.description,
            tier: event.tier,
          })
          break

        case 'subagent_result':
          // Update subagent with taskId from Sirdar
          if (event.taskId) {
            try {
              // Find the most recent running subagent without a taskId
              const subagents = await subagentRepo.listSubagentsBySession(sessionId)
              const runningSubagent = subagents
                .reverse() // Most recent first
                .find(s => s.status === 'running' && !s.taskId)
              
              if (runningSubagent) {
                await subagentRepo.updateSubagentTaskId(runningSubagent.id, event.taskId)
                logger.debug({ sessionId, taskId: event.taskId }, 'Updated subagent with taskId')
              }
            } catch (err) {
              logger.error({ err, sessionId, taskId: event.taskId }, 'Failed to update subagent with taskId')
            }
          }
          sendSSE(res, 'subagent_result', {
            toolCallId: event.toolCallId,
            taskId: event.taskId,
            status: event.status,
          })
          break

        case 'subagent_output':
          // Don't persist - too noisy. Just stream to client.
          sendSSE(res, 'subagent_output', {
            lines: event.lines,
          })
          break

        case 'subagent_complete':
          // Update subagent status
          try {
            const subagent = await subagentRepo.getSubagentByTaskId(event.taskId)
            if (subagent) {
              await subagentRepo.updateSubagentStatus(
                subagent.id,
                event.success ? 'completed' : 'failed',
              )
              logger.debug({ sessionId, taskId: event.taskId }, 'Updated subagent status')
            }
          } catch (err) {
            logger.error({ err, sessionId, taskId: event.taskId }, 'Failed to update subagent status')
          }
          sendSSE(res, 'subagent_complete', {
            taskId: event.taskId,
            description: event.description,
            success: event.success,
          })
          break

        case 'agent_start':
        case 'agent_end':
          // These events are internal; don't send to client
          break
      }

      if (aborted) break
    }

    // --- Final flush — save any remaining text ---
    if (fullText) {
      await flushToDb()
    }

    // --- Send done event ---
    if (assistantMessageId && !aborted) {
      // Fetch the saved message for the done event
      const savedSession = await sessionService.getSession(sessionId)
      const savedMessage = savedSession.messages.find((m) => m.id === assistantMessageId)

      // --- Auto-title session after first AI response ---
      if (!session.title) {
        const autoTitle = lastUserMessage.slice(0, 50) + (lastUserMessage.length > 50 ? '…' : '')
        await sessionService.updateSession(sessionId, { id: sessionId, title: autoTitle })
        logger.debug({ sessionId, title: autoTitle }, 'Auto-titled session')
      }

      if (savedMessage) {
        sendSSE(res, 'done', { message: savedMessage })
      }
      logger.info({ sessionId, responseLength: fullText.length }, 'AI response completed')
    }
  } catch (err: unknown) {
    logger.error({ err, sessionId }, 'AI stream error')

    // Even on error, flush whatever we have so the partial response is preserved
    if (fullText && fullText.length > lastFlushedLength) {
      await flushToDb()
      logger.info({ sessionId, savedLength: fullText.length }, 'Saved partial response before error')
    }

    if (!aborted) {
      sendSSE(res, 'error', { error: 'Failed to generate response' })
    }
  } finally {
    clearTimeout(timeout)
    clearInterval(keepaliveInterval)

    // Final safety flush — if aborted mid-stream, save what we have
    if (fullText && fullText.length > lastFlushedLength) {
      await flushToDb()
      logger.info({ sessionId, savedLength: fullText.length }, 'Saved partial response on cleanup')
    }

    res.end()
  }
})

/**
 * Send an SSE event.
 */
function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export default streamRouter
