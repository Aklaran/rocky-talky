import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getUserById } from '../services/authService'
import * as chatService from '../services/chatService'
import logger from '@shared/util/logger'

/**
 * SSE streaming route for AI responses.
 *
 * Why SSE instead of tRPC subscriptions?
 * - Simpler to implement and test
 * - No additional client link configuration
 * - Works with any frontend (fetch + ReadableStream)
 * - tRPC handles all CRUD; SSE handles just streaming
 *
 * Flow:
 * 1. Client sends POST with conversationId
 * 2. Server authenticates via session cookie
 * 3. Server streams AI response as SSE events
 * 4. On completion, saves assistant message to DB
 * 5. Sends final "done" event with saved message
 *
 * Event types:
 *   event: chunk     — { content: "..." }
 *   event: done      — { message: MessageOutput }
 *   event: error     — { error: "..." }
 */

const streamRouter: Router = Router()

const generateRequestSchema = z.object({
  conversationId: z.string().min(1),
})

/**
 * POST /api/chat/generate
 * Stream an AI response for a conversation.
 *
 * Requires authentication (session cookie).
 * The conversation must belong to the authenticated user.
 * The last message in the conversation should be from the user.
 */
streamRouter.post('/generate', async (req: Request, res: Response): Promise<void> => {
  // --- Auth check ---
  if (!req.session?.userId) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  const user = await getUserById(req.session.userId)
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  // --- Input validation ---
  const parsed = generateRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      issues: parsed.error.issues,
    })
    return
  }

  const { conversationId } = parsed.data

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

  try {
    const stream = chatService.generateResponseStream(conversationId, user.id)

    let result = await stream.next()

    while (!result.done) {
      if (aborted) {
        logger.debug({ conversationId }, 'Client disconnected during stream')
        // Still try to finish reading the stream so the message gets saved
        // But don't write to the response
        break
      }

      // Send chunk event
      sendSSE(res, 'chunk', { content: result.value })
      result = await stream.next()
    }

    // result.done is true — result.value is the saved message
    if (result.done && result.value && !aborted) {
      sendSSE(res, 'done', { message: result.value })
    }
  } catch (err: unknown) {
    const errorCode = (err as { code?: string })?.code

    // Don't leak internal errors to client
    if (errorCode === 'NOT_FOUND') {
      sendSSE(res, 'error', { error: 'Conversation not found' })
    } else {
      logger.error({ err, conversationId }, 'AI stream error')
      sendSSE(res, 'error', { error: 'Failed to generate response' })
    }
  } finally {
    if (!aborted) {
      res.end()
    }
  }
})

/**
 * Send an SSE event.
 */
function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export default streamRouter
