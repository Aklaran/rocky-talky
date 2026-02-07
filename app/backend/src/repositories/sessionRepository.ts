import { prisma } from '../lib/clients/prisma'
import type { MessageRole, SessionStatus } from '@shared/schemas/session'

/**
 * Session repository — data access layer for sessions and messages.
 *
 * Rules:
 * - Only Prisma queries here. No business logic.
 * - Receives specific params, not full request context.
 * - Returns Prisma types — the service layer shapes them for output.
 */

// =============================================================================
// Sessions
// =============================================================================

/**
 * List all sessions, ordered newest first.
 * Includes message count and a preview of the last message.
 * Optional filters by tag and status.
 */
export async function listSessions(filters?: { tag?: string; status?: SessionStatus }) {
  const where: any = {}

  if (filters?.tag) {
    where.tags = {
      has: filters.tag,
    }
  }

  if (filters?.status) {
    where.status = filters.status
  }

  return prisma.session.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true },
      },
      _count: {
        select: { messages: true },
      },
    },
  })
}

/**
 * Get a single session with all its messages, ordered chronologically.
 */
export async function getSession(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

/**
 * Create a new session.
 */
export async function createSession(data: { title?: string; tags?: string[] }) {
  return prisma.session.create({
    data: {
      title: data.title || null,
      tags: data.tags || [],
    },
  })
}

/**
 * Update a session's title, tags, or status.
 */
export async function updateSession(
  id: string,
  data: { title?: string; tags?: string[]; status?: SessionStatus },
) {
  return prisma.session.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title || null }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.status !== undefined && { status: data.status }),
    },
  })
}

/**
 * Delete a session (messages cascade via DB foreign key).
 */
export async function deleteSession(id: string) {
  return prisma.session.delete({
    where: { id },
  })
}

// =============================================================================
// Messages
// =============================================================================

/**
 * Add a message to a session.
 * Also touches the session's updatedAt so it sorts to top of list.
 */
export async function addMessage(sessionId: string, role: MessageRole, content: string) {
  // Use a transaction to atomically add the message and bump updatedAt
  const [message] = await prisma.$transaction([
    prisma.sessionMessage.create({
      data: {
        sessionId,
        role,
        content,
      },
    }),
    prisma.session.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    }),
  ])

  return message
}

/**
 * Update an existing message's content.
 * Used for incremental saves during streaming.
 */
export async function updateMessageContent(messageId: string, content: string) {
  return prisma.sessionMessage.update({
    where: { id: messageId },
    data: { content },
  })
}

/**
 * Get all messages for a session, ordered chronologically.
 */
export async function getMessages(sessionId: string) {
  return prisma.sessionMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Get the most recent user message for a session.
 * Returns null if no user messages exist.
 */
export async function getLastUserMessage(sessionId: string) {
  return prisma.sessionMessage.findFirst({
    where: { 
      sessionId,
      role: 'user',
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Increment the compaction count for a session.
 * Used when Pi SDK auto-compaction occurs.
 */
export async function incrementCompactionCount(sessionId: string) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { compactionCount: { increment: 1 } },
  })
}
