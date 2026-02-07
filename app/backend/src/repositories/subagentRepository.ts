import { prisma } from '../lib/clients/prisma'
import type { MessageRole, SubagentStatus } from '@shared/schemas/session'

/**
 * Subagent repository — data access layer for subagents and their messages.
 *
 * Rules:
 * - Only Prisma queries here. No business logic.
 * - Receives specific params, not full request context.
 * - Returns Prisma types — the service layer shapes them for output.
 */

// =============================================================================
// Subagents
// =============================================================================

/**
 * Create a new subagent.
 */
export async function createSubagent(data: {
  sessionId: string
  taskId?: string | null
  description: string
  tier?: string | null
  status?: SubagentStatus
}) {
  return prisma.subagent.create({
    data: {
      sessionId: data.sessionId,
      taskId: data.taskId || null,
      description: data.description,
      tier: data.tier || null,
      status: data.status || 'running',
    },
  })
}

/**
 * Get a single subagent by ID.
 */
export async function getSubagent(id: string) {
  return prisma.subagent.findUnique({
    where: { id },
  })
}

/**
 * Get a subagent by task ID.
 */
export async function getSubagentByTaskId(taskId: string) {
  return prisma.subagent.findUnique({
    where: { taskId },
  })
}

/**
 * List all subagents for a session, ordered by creation time.
 */
export async function listSubagentsBySession(sessionId: string) {
  return prisma.subagent.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Update a subagent's status and optionally its output.
 */
export async function updateSubagentStatus(
  id: string,
  status: SubagentStatus,
  output?: string,
) {
  return prisma.subagent.update({
    where: { id },
    data: {
      status,
      ...(output !== undefined && { output }),
      ...(status !== 'running' && { completedAt: new Date() }),
    },
  })
}

/**
 * Append a message to a subagent.
 */
export async function appendSubagentMessage(data: {
  subagentId: string
  role: MessageRole
  content: string
}) {
  return prisma.subagentMessage.create({
    data: {
      subagentId: data.subagentId,
      role: data.role,
      content: data.content,
    },
  })
}
