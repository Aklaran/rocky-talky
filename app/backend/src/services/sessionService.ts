import { TRPCError } from '@trpc/server'
import * as sessionRepo from '../repositories/sessionRepository'
import logger from '@shared/util/logger'
import type {
  SessionListItem,
  SessionDetail,
  MessageOutput,
  CreateSessionInput,
  UpdateSessionInput,
  SendMessageInput,
  ListSessionsInput,
} from '@shared/schemas/session'

/**
 * Session service — business logic for sessions and messages.
 *
 * Responsibilities:
 * - Data shaping (Prisma types → API output types)
 * - Orchestration (e.g., auto-generating session titles)
 * - Error handling
 *
 * NOTE (Rocky Talky): No ownership checks — single-user app.
 * All sessions belong to the user who can reach this over Tailscale.
 */

// =============================================================================
// Sessions
// =============================================================================

/**
 * List all sessions with optional filters.
 */
export async function listSessions(filters?: ListSessionsInput): Promise<SessionListItem[]> {
  const sessions = await sessionRepo.listSessions(filters)

  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    tags: s.tags,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    lastMessage: s.messages[0]?.content?.slice(0, 100) ?? null,
    messageCount: s._count.messages,
  }))
}

/**
 * Get a session with all messages.
 */
export async function getSession(sessionId: string): Promise<SessionDetail> {
  const session = await sessionRepo.getSession(sessionId)

  if (!session) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
  }

  return {
    id: session.id,
    title: session.title,
    tags: session.tags,
    status: session.status,
    modelUsed: session.modelUsed,
    tokensUsed: session.tokensUsed,
    compactionCount: session.compactionCount,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messages: session.messages.map(toMessageOutput),
  }
}

/**
 * Create a new session.
 */
export async function createSession(input: CreateSessionInput): Promise<SessionDetail> {
  const session = await sessionRepo.createSession({
    title: input.title,
    tags: input.tags,
  })

  logger.info({ sessionId: session.id }, 'Session created')

  return {
    id: session.id,
    title: session.title,
    tags: session.tags,
    status: session.status,
    modelUsed: session.modelUsed,
    tokensUsed: session.tokensUsed,
    compactionCount: session.compactionCount,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messages: [],
  }
}

/**
 * Update a session's title, tags, or status.
 */
export async function updateSession(
  sessionId: string,
  input: UpdateSessionInput,
): Promise<SessionDetail> {
  // Verify session exists first
  const existing = await sessionRepo.getSession(sessionId)

  if (!existing) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
  }

  // Update
  await sessionRepo.updateSession(sessionId, {
    title: input.title,
    tags: input.tags,
    status: input.status,
  })

  logger.info({ sessionId, updates: input }, 'Session updated')

  // Fetch with messages to return full detail
  return getSession(sessionId)
}

/**
 * Delete a session.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  // Verify session exists first
  const session = await sessionRepo.getSession(sessionId)

  if (!session) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
  }

  await sessionRepo.deleteSession(sessionId)

  logger.info({ sessionId }, 'Session deleted')
}

/**
 * Send a message to a session. Returns the stored message.
 * Role defaults to 'user' if not specified.
 */
export async function sendMessage(input: SendMessageInput): Promise<MessageOutput> {
  // Verify session exists
  const session = await sessionRepo.getSession(input.sessionId)

  if (!session) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
  }

  const role = input.role || 'user'

  // Store the message
  const message = await sessionRepo.addMessage(input.sessionId, role, input.content)

  // Auto-generate title from first user message if session has no title
  if (!session.title && session.messages.length === 0 && role === 'user') {
    const autoTitle = input.content.slice(0, 80) + (input.content.length > 80 ? '…' : '')
    await sessionRepo.updateSession(input.sessionId, { title: autoTitle })
  }

  logger.debug({ sessionId: input.sessionId, messageId: message.id, role }, 'Message sent')

  return toMessageOutput(message)
}

/**
 * Get the most recent user message content for a session.
 * Returns null if no user messages exist.
 */
export async function getLastUserMessage(sessionId: string): Promise<string | null> {
  const message = await sessionRepo.getLastUserMessage(sessionId)
  return message?.content || null
}

// =============================================================================
// Helpers
// =============================================================================

function toMessageOutput(m: {
  id: string
  sessionId: string
  role: string
  content: string
  createdAt: Date
}): MessageOutput {
  return {
    id: m.id,
    sessionId: m.sessionId,
    role: m.role as MessageOutput['role'],
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }
}
