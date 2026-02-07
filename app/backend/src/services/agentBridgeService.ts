import {
  createAgentSession,
  SessionManager,
  AuthStorage,
  DefaultResourceLoader,
  type AgentSession,
  type Skill,
} from '@mariozechner/pi-coding-agent'
import { getModel } from '@mariozechner/pi-ai'
import logger from '@shared/util/logger'
import * as fs from 'fs'

/**
 * Agent Bridge Service — wraps the Pi SDK to provide AI agent sessions for Rocky Talky.
 *
 * Design:
 * - Each Rocky Talky session can have an associated Pi agent session
 * - Uses in-memory session manager (we persist to Postgres separately)
 * - Injects Annapurna skill on session creation
 * - Streams responses via event emitters
 * - Tracks tool calls and detects subagent spawning
 *
 * Configuration:
 * - Model: claude-opus-4-6 (from anthropic provider)
 * - Thinking level: "low"
 * - Auth: reads from ~/.pi/agent/auth.json
 * - Skills: injects Annapurna from ~/.pi/agent/skills/annapurna/SKILL.md
 * - Extensions: loaded from default paths (picks up orchestrator)
 */

// =============================================================================
// Types
// =============================================================================

export interface AgentEventChunk {
  type: 'text'
  content: string
}

export interface AgentEventToolCall {
  type: 'tool_call'
  toolName: string
  toolInput: unknown
}

export interface AgentEventToolResult {
  type: 'tool_result'
  toolName: string
  result: unknown
}

export interface AgentEventCompletion {
  type: 'completion'
  fullText: string
}

export interface AgentEventError {
  type: 'error'
  error: string
}

export type AgentEvent =
  | AgentEventChunk
  | AgentEventToolCall
  | AgentEventToolResult
  | AgentEventCompletion
  | AgentEventError

export interface AgentSessionInfo {
  sessionId: string
  piSession: AgentSession
  createdAt: Date
}

// =============================================================================
// Session Management
// =============================================================================

/** Map of Rocky Talky session ID → Pi agent session */
const activeSessions = new Map<string, AgentSessionInfo>()

/**
 * Create a new Pi agent session linked to a Rocky Talky session ID.
 *
 * @param sessionId - Rocky Talky session ID
 * @returns Agent session info
 * @throws Error if session already exists or configuration is invalid
 */
export async function createSession(sessionId: string): Promise<AgentSessionInfo> {
  if (activeSessions.has(sessionId)) {
    throw new Error(`Agent session already exists for session ${sessionId}`)
  }

  logger.info({ sessionId }, 'Creating Pi agent session')

  try {
    // Load Annapurna skill
    const annapurnaSkill = await loadAnnapurnaSkill()

    // Get the model
    const model = getModel('anthropic', 'claude-opus-4-6')

    // Create session with configuration
    const piSession = await createAgentSession({
      model,
      thinkingLevel: 'low',
      sessionManager: SessionManager.inMemory(),
      authStorage: AuthStorage(),
      skills: annapurnaSkill ? [annapurnaSkill] : [],
      resourceLoader: DefaultResourceLoader(),
      // Extensions are loaded from default paths (~/.pi/agent/extensions/)
      // System prompt uses default (don't override)
      // Auto-compaction is enabled by default
    })

    const info: AgentSessionInfo = {
      sessionId,
      piSession,
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
 *
 * @param sessionId - Rocky Talky session ID
 * @returns Agent session info or null if not found
 */
export function getSession(sessionId: string): AgentSessionInfo | null {
  return activeSessions.get(sessionId) || null
}

/**
 * Send a message to a Pi agent session and stream the response.
 *
 * @param sessionId - Rocky Talky session ID
 * @param message - User message to send
 * @yields AgentEvent objects (text chunks, tool calls, completion)
 * @throws Error if session not found
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

  try {
    const { piSession } = sessionInfo
    let fullText = ''
    let toolCallCount = 0

    // The Pi SDK's chat method streams events via an async generator
    for await (const event of piSession.chat(message)) {
      // Handle different event types from the SDK
      if (event.type === 'text') {
        fullText += event.content
        yield {
          type: 'text',
          content: event.content,
        }
      } else if (event.type === 'tool_use') {
        toolCallCount++
        logger.debug(
          { sessionId, toolName: event.name, toolCallCount },
          'Agent tool call',
        )

        yield {
          type: 'tool_call',
          toolName: event.name,
          toolInput: event.input,
        }

        // Detect subagent spawning
        if (event.name === 'spawn_agent') {
          logger.info({ sessionId, input: event.input }, 'Detected subagent spawn')
        }
      } else if (event.type === 'tool_result') {
        yield {
          type: 'tool_result',
          toolName: event.toolName || 'unknown',
          result: event.content,
        }
      }
    }

    logger.info(
      { sessionId, responseLength: fullText.length, toolCallCount },
      'Message completed',
    )

    // Send completion event with full accumulated text
    yield {
      type: 'completion',
      fullText,
    }
  } catch (err) {
    logger.error({ err, sessionId }, 'Error during agent message')
    yield {
      type: 'error',
      error: (err as Error).message,
    }
    throw err
  }
}

/**
 * Dispose a Pi agent session and clean up resources.
 *
 * @param sessionId - Rocky Talky session ID
 * @returns true if session was disposed, false if not found
 */
export async function disposeSession(sessionId: string): Promise<boolean> {
  const sessionInfo = activeSessions.get(sessionId)
  if (!sessionInfo) {
    logger.warn({ sessionId }, 'Attempted to dispose non-existent session')
    return false
  }

  logger.info({ sessionId }, 'Disposing Pi agent session')

  try {
    // The Pi SDK session doesn't have an explicit dispose method in the current API,
    // so we just remove it from our map. The SDK will handle cleanup.
    activeSessions.delete(sessionId)
    logger.info({ sessionId }, 'Pi agent session disposed')
    return true
  } catch (err) {
    logger.error({ err, sessionId }, 'Error disposing agent session')
    throw err
  }
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
// Skill Loading
// =============================================================================

/**
 * Load the Annapurna skill from the filesystem.
 *
 * @returns Skill object or null if file not found
 */
async function loadAnnapurnaSkill(): Promise<Skill | null> {
  const skillPath = '/home/annapurna/.pi/agent/skills/annapurna/SKILL.md'

  try {
    if (!fs.existsSync(skillPath)) {
      logger.warn({ skillPath }, 'Annapurna skill file not found')
      return null
    }

    const content = fs.readFileSync(skillPath, 'utf-8')
    logger.info({ skillPath }, 'Loaded Annapurna skill')

    return {
      name: 'annapurna',
      description: 'Load the Annapurna identity and memory system',
      content,
    }
  } catch (err) {
    logger.error({ err, skillPath }, 'Failed to load Annapurna skill')
    return null
  }
}
