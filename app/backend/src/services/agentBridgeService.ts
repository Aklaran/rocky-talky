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

// We store the Pi session as `any` since the type comes from a dynamic import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AgentSessionInfo {
  sessionId: string
  piSession: any // AgentSession from Pi SDK
  createdAt: Date
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
 */
export async function createSession(sessionId: string): Promise<AgentSessionInfo> {
  if (activeSessions.has(sessionId)) {
    throw new Error(`Agent session already exists for session ${sessionId}`)
  }

  logger.info({ sessionId }, 'Creating Pi agent session')

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
        ui: {
          notify: (_msg: string, _level?: string) => {},
          setStatus: (_key: string, _value: string | undefined) => {},
          setWidget: (_key: string, _value: string[] | undefined) => {},
          select: async (_title: string, _options: string[]) => undefined,
        },
      },
    })

    const info: AgentSessionInfo = {
      sessionId,
      piSession: session,
      createdAt: new Date(),
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
        }
        break

      case 'tool_execution_end':
        pushEvent({
          type: 'tool_end',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError || false,
        })
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
