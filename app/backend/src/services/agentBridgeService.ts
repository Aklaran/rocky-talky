/**
 * Agent Bridge Service — wraps the Pi SDK to provide AI agent sessions for Rocky Talky.
 *
 * Design:
 * - Each Rocky Talky session can have an associated Pi agent session
 * - Uses in-memory session manager (we persist to Postgres separately)
 * - Injects Annapurna skill on session creation via DefaultResourceLoader
 * - Streams responses via subscribe() + prompt()
 * - Tracks tool calls and detects subagent spawning
 *
 * Note: Pi SDK is ESM-only. We use dynamic import() to load it from CJS.
 */

import logger from '@shared/util/logger'
import * as subagentRepo from '../repositories/subagentRepository'

// =============================================================================
// Types
// =============================================================================

export interface AgentEventText {
  type: 'text'
  content: string
}

export interface AgentEventToolStart {
  type: 'tool_start'
  toolCallId: string
  toolName: string
  args: unknown
}

export interface AgentEventToolEnd {
  type: 'tool_end'
  toolCallId: string
  toolName: string
  isError: boolean
}

export interface AgentEventCompletion {
  type: 'completion'
  fullText: string
}

export interface AgentEventError {
  type: 'error'
  error: string
}

export interface AgentEventAgentStart {
  type: 'agent_start'
}

export interface AgentEventAgentEnd {
  type: 'agent_end'
}

export interface AgentEventCompactionStart {
  type: 'compaction_start'
  reason: string
}

export interface AgentEventCompactionEnd {
  type: 'compaction_end'
  aborted: boolean
  error?: string
}

export interface AgentEventSubagentSpawn {
  type: 'subagent_spawn'
  toolCallId: string
  description: string
  tier: string
  prompt: string
}

export interface AgentEventSubagentResult {
  type: 'subagent_result'
  toolCallId: string
  taskId: string | null
  status: string
}

export interface AgentEventSubagentOutput {
  type: 'subagent_output'
  lines: string[]
}

export interface AgentEventSubagentComplete {
  type: 'subagent_complete'
  taskId: string
  description: string
  success: boolean
}

export type AgentEvent =
  | AgentEventText
  | AgentEventToolStart
  | AgentEventToolEnd
  | AgentEventCompletion
  | AgentEventError
  | AgentEventAgentStart
  | AgentEventAgentEnd
  | AgentEventCompactionStart
  | AgentEventCompactionEnd
  | AgentEventSubagentSpawn
  | AgentEventSubagentResult
  | AgentEventSubagentOutput
  | AgentEventSubagentComplete

// We store the Pi session as `any` since the type comes from a dynamic import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AgentSessionInfo {
  sessionId: string
  piSession: any // AgentSession from Pi SDK
  createdAt: Date
  eventEmitter: ((event: AgentEvent) => void) | null
}

// =============================================================================
// SDK Lazy Loading (injectable for testing)
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sdkOverride: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _aiOverride: any = null

/** Override SDK modules for testing. Call with null to reset. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function _setSDKForTesting(sdk: any, ai: any) {
  _sdkOverride = sdk
  _aiOverride = ai
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sdkPromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _aiPromise: Promise<any> | null = null

async function getSDK() {
  if (_sdkOverride) return _sdkOverride
  if (!_sdkPromise) {
    // Use Function constructor to prevent TypeScript from converting import() to require()
    // Pi SDK is ESM-only and cannot be loaded via require()
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<any>
    _sdkPromise = dynamicImport('@mariozechner/pi-coding-agent')
  }
  return _sdkPromise
}

async function getAI() {
  if (_aiOverride) return _aiOverride
  if (!_aiPromise) {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<any>
    _aiPromise = dynamicImport('@mariozechner/pi-ai')
  }
  return _aiPromise
}

// =============================================================================
// Session Management
// =============================================================================

/** Map of Rocky Talky session ID → Pi agent session */
const activeSessions = new Map<string, AgentSessionInfo>()

/**
 * Create a new Pi agent session linked to a Rocky Talky session ID.
 *
 * Uses the Pi SDK's createAgentSession() with:
 * - Model: claude-opus-4-6 with low thinking
 * - In-memory session (we persist to our own Postgres)
 * - Annapurna skill injected via DefaultResourceLoader
 * - Extensions auto-loaded from ~/.pi/agent/extensions/
 *
 * In test mode (AGENT_MODE=mock), uses a mock SDK that simulates realistic event formats.
 */
export async function createSession(sessionId: string): Promise<AgentSessionInfo> {
  if (activeSessions.has(sessionId)) {
    throw new Error(`Agent session already exists for session ${sessionId}`)
  }

  logger.info({ sessionId }, 'Creating Pi agent session')

  // Check for mock mode (E2E testing)
  if (process.env.AGENT_MODE === 'mock') {
    return createMockSession(sessionId)
  }

  try {
    const sdk = await getSDK()
    const ai = await getAI()

    const auth = new sdk.AuthStorage()
    const modelRegistry = new sdk.ModelRegistry(auth)
    const model = ai.getModel('anthropic', 'claude-opus-4-6')

    if (!model) {
      throw new Error('Model claude-opus-4-6 not found')
    }

    // Use DefaultResourceLoader to get skills, extensions, etc.
    // This picks up Annapurna from ~/.pi/agent/skills/ and Sirdar from ~/.pi/agent/extensions/
    const loader = new sdk.DefaultResourceLoader({
      cwd: process.cwd(),
    })
    await loader.reload()

    const { session } = await sdk.createAgentSession({
      model,
      thinkingLevel: 'low',
      sessionManager: sdk.SessionManager.inMemory(),
      authStorage: auth,
      modelRegistry,
      resourceLoader: loader,
    })

    // Bind extensions to fire session_start event — required for extensions
    // like Sirdar (orchestrator) that initialize internal state (e.g. agent pool)
    // in their session_start handler.
    await session.bindExtensions({
      uiContext: {
        notify: (msg: string, _level?: string) => {
          logger.info({ sessionId, msg }, 'notify() callback fired')
          // Parse Sirdar agent completion notifications
          // Format: "Agent task-xyz completed: description" or "Agent task-xyz failed: description"
          // Sirdar format: "✅ Agent completed: task-xyz\nDescription"
          //            or: "❌ Agent failed: task-xyz\nDescription"
          const completedMatch = msg.match(/Agent completed:\s*(task-[^\s\n]+)(?:\n(.+))?/) ||
                                 msg.match(/Agent (task-[^\s]+) completed:\s*(.+)/)
          const failedMatch = msg.match(/Agent failed:\s*(task-[^\s\n]+)(?:\n(.+))?/) ||
                              msg.match(/Agent (task-[^\s]+) failed:\s*(.+)/)
          
          if (completedMatch) {
            const taskId = completedMatch[1]
            const description = completedMatch[2]
            
            // Emit event to stream (if connected)
            if (info.eventEmitter) {
              info.eventEmitter({
                type: 'subagent_complete',
                taskId,
                description,
                success: true,
              })
            }
            
            // CRITICAL: Persist to DB directly (SSE stream may be closed)
            // The notify() callback fires AFTER the main agent stream ends,
            // so the event queue may not be consumed.
            subagentRepo.getSubagentByTaskId(taskId)
              .then(subagent => {
                if (subagent) {
                  return subagentRepo.updateSubagentStatus(subagent.id, 'completed')
                }
                return undefined
              })
              .catch(err => {
                logger.error({ err, taskId }, 'Failed to persist subagent completion in notify()')
              })
          } else if (failedMatch) {
            const taskId = failedMatch[1]
            const description = failedMatch[2]
            
            // Emit event to stream (if connected)
            if (info.eventEmitter) {
              info.eventEmitter({
                type: 'subagent_complete',
                taskId,
                description,
                success: false,
              })
            }
            
            // CRITICAL: Persist to DB directly (SSE stream may be closed)
            subagentRepo.getSubagentByTaskId(taskId)
              .then(subagent => {
                if (subagent) {
                  return subagentRepo.updateSubagentStatus(subagent.id, 'failed')
                }
                return undefined
              })
              .catch(err => {
                logger.error({ err, taskId }, 'Failed to persist subagent failure in notify()')
              })
          }
        },
        setStatus: (_key: string, _value: string | undefined) => {},
        setWidget: (key: string, value: string[] | undefined) => {
          // Capture subagent output widgets from Sirdar
          if (key && value && info.eventEmitter) {
            info.eventEmitter({
              type: 'subagent_output',
              lines: value,
            })
          }
        },
        setFooter: (_key: string, _value: string | undefined) => {},
        setHeader: (_key: string, _value: string | undefined) => {},
        setTitle: (_value: string) => {},
        setWorkingMessage: (_msg: string) => {},
        select: async (_title: string, _options: string[]) => undefined,
        confirm: async (_title: string) => false,
        input: async (_title: string) => undefined,
        custom: async () => undefined as never,
        setEditorText: (_text: string) => {},
        getEditorText: () => '',
        editor: async () => undefined,
        setEditorComponent: () => {},
        get theme(): any { return {}; },
        getAllThemes: () => [],
        getTheme: () => undefined,
        setTheme: () => ({ success: false, error: 'UI not available' }),
        getToolsExpanded: () => false,
        setToolsExpanded: () => {},
      },
    })

    const info: AgentSessionInfo = {
      sessionId,
      piSession: session,
      createdAt: new Date(),
      eventEmitter: null,
    }

    activeSessions.set(sessionId, info)
    logger.info({ sessionId }, 'Pi agent session created successfully')

    return info
  } catch (err) {
    logger.error({ err, sessionId }, 'Failed to create Pi agent session')
    throw new Error(`Failed to create agent session: ${(err as Error).message}`)
  }
}

/**
 * Get an existing Pi agent session.
 */
export function getSession(sessionId: string): AgentSessionInfo | null {
  return activeSessions.get(sessionId) || null
}

/**
 * Send a message to a Pi agent session and stream the response.
 *
 * Uses the Pi SDK's subscribe() for events + prompt() to send.
 * Returns an async generator that yields AgentEvent objects.
 */
export async function* sendMessage(
  sessionId: string,
  message: string,
): AsyncGenerator<AgentEvent> {
  const sessionInfo = activeSessions.get(sessionId)
  if (!sessionInfo) {
    throw new Error(`No agent session found for session ${sessionId}`)
  }

  logger.info({ sessionId, messageLength: message.length }, 'Sending message to Pi agent')

  const { piSession } = sessionInfo

  // Collect events via a queue pattern (subscribe pushes, generator pulls)
  const eventQueue: AgentEvent[] = []
  let resolve: (() => void) | null = null
  let done = false

  function pushEvent(event: AgentEvent) {
    eventQueue.push(event)
    if (resolve) {
      resolve()
      resolve = null
    }
  }

  // Set the event emitter so UI context callbacks can push events
  sessionInfo.eventEmitter = pushEvent

  let fullText = ''

  const unsub = piSession.subscribe((event: any) => {
    switch (event.type) {
      case 'agent_start':
        pushEvent({ type: 'agent_start' })
        break

      case 'message_update':
        if (event.assistantMessageEvent?.type === 'text_delta') {
          const delta = event.assistantMessageEvent.delta
          fullText += delta
          pushEvent({ type: 'text', content: delta })
        }
        break

      case 'tool_execution_start':
        pushEvent({
          type: 'tool_start',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        })
        // Detect subagent spawning
        if (event.toolName === 'spawn_agent') {
          logger.info({ sessionId, args: event.args }, 'Detected subagent spawn')
          const args = event.args as any
          pushEvent({
            type: 'subagent_spawn',
            toolCallId: event.toolCallId,
            description: args.description || '',
            tier: args.tier || 'standard',
            prompt: args.prompt || '',
          })
        }
        break

      case 'tool_execution_end':
        pushEvent({
          type: 'tool_end',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError || false,
        })
        // Parse subagent result
        if (event.toolName === 'spawn_agent' && !event.isError) {
          // event.result may be an object with content[].text or a string
          const resultRaw = event.result
          let resultText = ''
          if (typeof resultRaw === 'string') {
            resultText = resultRaw
          } else if (resultRaw && typeof resultRaw === 'object') {
            // MCP tool result: { content: [{ type: "text", text: "..." }] }
            const content = (resultRaw as any).content
            if (Array.isArray(content)) {
              resultText = content.map((c: any) => c.text || '').join('\n')
            } else {
              resultText = JSON.stringify(resultRaw)
            }
          }
          logger.info({ sessionId, resultText }, 'spawn_agent tool result')
          // Sirdar format: "Agent spawned: task-xyz — description (...)\nStatus: running"
          const taskIdMatch = resultText.match(/Agent spawned:\s*(task-[^\s]+)/) ||
                              resultText.match(/Task ID:\s*([^\s\n]+)/)
          const statusMatch = resultText.match(/Status:\s*([^\s\n]+)/)
          
          pushEvent({
            type: 'subagent_result',
            toolCallId: event.toolCallId,
            taskId: taskIdMatch ? taskIdMatch[1] : null,
            status: statusMatch ? statusMatch[1] : 'unknown',
          })
        }
        break

      case 'agent_end':
        pushEvent({ type: 'completion', fullText })
        pushEvent({ type: 'agent_end' })
        done = true
        if (resolve) {
          resolve()
          resolve = null
        }
        break

      case 'auto_compaction_start':
        pushEvent({
          type: 'compaction_start',
          reason: event.reason || 'unknown',
        })
        break

      case 'auto_compaction_end':
        pushEvent({
          type: 'compaction_end',
          aborted: event.aborted || false,
          error: event.errorMessage,
        })
        break
    }
  })

  // Send the message (non-blocking — events come via subscribe)
  const promptPromise = piSession.prompt(message).catch((err: Error) => {
    pushEvent({ type: 'error', error: err.message })
    done = true
    if (resolve) {
      resolve()
      resolve = null
    }
  })

  try {
    // Yield events as they come in
    while (!done || eventQueue.length > 0) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!
      } else if (!done) {
        // Wait for next event
        await new Promise<void>((r) => {
          resolve = r
        })
      }
    }
  } finally {
    unsub()
    await promptPromise
    // Clear the event emitter
    sessionInfo.eventEmitter = null
  }

  logger.info(
    { sessionId, responseLength: fullText.length },
    'Message completed',
  )
}

/**
 * Dispose a Pi agent session and clean up resources.
 */
export async function disposeSession(sessionId: string): Promise<boolean> {
  const sessionInfo = activeSessions.get(sessionId)
  if (!sessionInfo) {
    logger.warn({ sessionId }, 'Attempted to dispose non-existent session')
    return false
  }

  logger.info({ sessionId }, 'Disposing Pi agent session')

  try {
    sessionInfo.piSession.dispose()
  } catch (err) {
    logger.warn({ err, sessionId }, 'Error during Pi session dispose (non-fatal)')
  }

  activeSessions.delete(sessionId)
  logger.info({ sessionId }, 'Pi agent session disposed')
  return true
}

/**
 * Get count of active agent sessions.
 */
export function getActiveSessionCount(): number {
  return activeSessions.size
}

/**
 * Dispose all active sessions — used for testing and shutdown.
 */
export async function disposeAllSessions(): Promise<void> {
  logger.info({ count: activeSessions.size }, 'Disposing all agent sessions')
  const sessionIds = Array.from(activeSessions.keys())
  for (const sessionId of sessionIds) {
    await disposeSession(sessionId)
  }
}

// =============================================================================
// Mock Session for E2E Testing
// =============================================================================

/**
 * Create a mock Pi agent session for E2E testing.
 * Simulates realistic event formats from the real Pi SDK.
 */
async function createMockSession(sessionId: string): Promise<AgentSessionInfo> {
  logger.info({ sessionId }, 'Creating MOCK Pi agent session for E2E testing')

  // Store captured UI context so we can fire notify() later
  let capturedUiContext: any = null
  let capturedListener: any = null

  const mockSession = {
    subscribe: (listener: any) => {
      capturedListener = listener
      return () => {} // unsubscribe
    },

    prompt: async (_message: string) => {
      if (!capturedListener) {
        throw new Error('No listener subscribed')
      }

      // Simulate the event sequence
      setTimeout(() => {
        // 1. agent_start
        capturedListener({ type: 'agent_start' })

        // 2. Text response
        capturedListener({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'Spawning a test agent...' },
        })

        // 3. Tool start - spawn_agent
        capturedListener({
          type: 'tool_execution_start',
          toolCallId: 'tool-mock-1',
          toolName: 'spawn_agent',
          args: {
            description: 'Mock test task',
            tier: 'trivial-simple',
            prompt: 'Do something simple',
          },
        })

        // 4. Tool end - spawn_agent with MCP-shaped result (CRITICAL: matches real SDK)
        capturedListener({
          type: 'tool_execution_end',
          toolCallId: 'tool-mock-1',
          toolName: 'spawn_agent',
          isError: false,
          result: {
            content: [
              {
                type: 'text',
                text: 'Agent spawned: task-mock-12345 — Mock test task (model: claude-3-haiku-20240307, thinking: none)\nStatus: running',
              },
            ],
          },
        })

        // 5. More text
        capturedListener({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: ' Agent is running.' },
        })

        // 6. After a delay, call notify() via captured uiContext (simulates async completion)
        // IMPORTANT: Call notify() BEFORE agent_end so the stream is still open
        setTimeout(() => {
          if (capturedUiContext?.notify) {
            logger.info({ sessionId }, 'Mock notify() firing for completion')
            // Use Sirdar's real format (this caught production bugs!)
            capturedUiContext.notify(
              '✅ Agent completed: task-mock-12345\nMock test task',
              'info'
            )
          }

          // 7. Then fire agent_end (after notify)
          setTimeout(() => {
            capturedListener({ type: 'agent_end', messages: [] })
          }, 100)
        }, 300)
      }, 50) // Small delay to simulate async
    },

    bindExtensions: async (opts: any) => {
      // Capture uiContext so we can call notify() later
      if (opts?.uiContext) {
        capturedUiContext = opts.uiContext
        logger.debug({ sessionId }, 'Mock captured uiContext')
      }
    },

    dispose: () => {
      // no-op
    },
  }

  // Create session info and add to activeSessions FIRST
  // (so notify() can find it when it fires)
  const info: AgentSessionInfo = {
    sessionId,
    piSession: mockSession,
    createdAt: new Date(),
    eventEmitter: null,
  }

  activeSessions.set(sessionId, info)

  // Now bind extensions to capture uiContext
  await mockSession.bindExtensions({
    uiContext: {
      notify: (msg: string, _level?: string) => {
        logger.info({ sessionId, msg }, 'notify() callback fired (MOCK)')
        // Parse Sirdar agent completion notifications (same as real implementation)
        const completedMatch = msg.match(/Agent completed:\s*(task-[^\s\n]+)(?:\n(.+))?/) ||
                              msg.match(/Agent (task-[^\s]+) completed:\s*(.+)/)
        const failedMatch = msg.match(/Agent failed:\s*(task-[^\s\n]+)(?:\n(.+))?/) ||
                            msg.match(/Agent (task-[^\s]+) failed:\s*(.+)/)
        
        if (completedMatch) {
          const taskId = completedMatch[1]
          const description = completedMatch[2] || ''
          logger.info({ sessionId, taskId, description }, 'Mock parsed completion notification')
          
          // Find the session info and emit event
          const sessionInfo = activeSessions.get(sessionId)
          if (sessionInfo?.eventEmitter) {
            logger.info({ sessionId, taskId }, 'Emitting subagent_complete event')
            sessionInfo.eventEmitter({
              type: 'subagent_complete',
              taskId,
              description,
              success: true,
            })
          } else {
            logger.warn({ sessionId, taskId, hasEmitter: !!sessionInfo?.eventEmitter }, 'No event emitter for subagent completion')
          }
          
          // Persist to DB
          subagentRepo.getSubagentByTaskId(taskId)
            .then(subagent => {
              if (subagent) {
                return subagentRepo.updateSubagentStatus(subagent.id, 'completed')
              }
              return undefined
            })
            .catch(err => {
              logger.error({ err, taskId }, 'Failed to persist subagent completion in mock notify()')
            })
        } else if (failedMatch) {
          const taskId = failedMatch[1]
          const description = failedMatch[2] || ''
          
          const sessionInfo = activeSessions.get(sessionId)
          if (sessionInfo?.eventEmitter) {
            sessionInfo.eventEmitter({
              type: 'subagent_complete',
              taskId,
              description,
              success: false,
            })
          }
          
          subagentRepo.getSubagentByTaskId(taskId)
            .then(subagent => {
              if (subagent) {
                return subagentRepo.updateSubagentStatus(subagent.id, 'failed')
              }
              return undefined
            })
            .catch(err => {
              logger.error({ err, taskId }, 'Failed to persist subagent failure in mock notify()')
            })
        } else {
          logger.warn({ sessionId, msg }, 'notify() message did not match completion or failure pattern')
        }
      },
      setStatus: (_key: string, _value: string | undefined) => {},
      setWidget: (key: string, value: string[] | undefined) => {
        const sessionInfo = activeSessions.get(sessionId)
        if (key && value && sessionInfo?.eventEmitter) {
          sessionInfo.eventEmitter({
            type: 'subagent_output',
            lines: value,
          })
        }
      },
      setFooter: (_key: string, _value: string | undefined) => {},
      setHeader: (_key: string, _value: string | undefined) => {},
      setTitle: (_value: string) => {},
      setWorkingMessage: (_msg: string) => {},
      select: async (_title: string, _options: string[]) => undefined,
      confirm: async (_title: string) => false,
      input: async (_title: string) => undefined,
      custom: async () => undefined as never,
      setEditorText: (_text: string) => {},
      getEditorText: () => '',
      editor: async () => undefined,
      setEditorComponent: () => {},
      get theme(): any { return {}; },
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: false, error: 'UI not available' }),
      getToolsExpanded: () => false,
      setToolsExpanded: () => {},
    },
  })

  logger.info({ sessionId }, 'Mock Pi agent session created successfully')

  return info
}
