import { z } from 'zod'

/**
 * Session validation schemas — shared between frontend and backend.
 *
 * These define the shape of data flowing through tRPC procedures.
 * Zod handles both runtime validation and TypeScript type inference.
 */

// =============================================================================
// Enums
// =============================================================================

export const SessionStatus = z.enum(['active', 'completed', 'abandoned'])
export type SessionStatus = z.infer<typeof SessionStatus>

export const SubagentStatus = z.enum(['running', 'completed', 'failed'])
export type SubagentStatus = z.infer<typeof SubagentStatus>

export const MessageRole = z.enum(['system', 'user', 'assistant', 'tool'])
export type MessageRole = z.infer<typeof MessageRole>

// =============================================================================
// Input Schemas (what clients send)
// =============================================================================

export const createSessionSchema = z.object({
  title: z.string().trim().max(255).optional(),
  tags: z.array(z.string().trim().max(50)).max(10).optional(),
})

export const getSessionSchema = z.object({
  id: z.string().cuid(),
})

export const deleteSessionSchema = z.object({
  id: z.string().cuid(),
})

export const updateSessionSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().max(255).optional(),
  tags: z.array(z.string().trim().max(50)).max(10).optional(),
  status: SessionStatus.optional(),
})

export const sendMessageSchema = z.object({
  sessionId: z.string().cuid(),
  content: z.string().trim().min(1, 'Message cannot be empty').max(32000, 'Message too long'),
  role: MessageRole.optional().default('user'),
})

export const listSessionsSchema = z.object({
  tag: z.string().trim().max(50).optional(),
  status: SessionStatus.optional(),
})

// =============================================================================
// Output Types (what the API returns)
// =============================================================================

export interface MessageOutput {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  createdAt: string
}

export interface SessionListItem {
  id: string
  title: string | null
  tags: string[]
  status: SessionStatus
  createdAt: string
  updatedAt: string
  /** Preview: the last message content (truncated), if any */
  lastMessage: string | null
  messageCount: number
}

export interface SubagentOutput {
  id: string
  sessionId: string
  taskId: string | null
  description: string
  status: SubagentStatus
  tier: string | null
  output: string | null
  createdAt: string
  completedAt: string | null
}

export interface SessionDetail {
  id: string
  title: string | null
  tags: string[]
  status: SessionStatus
  modelUsed: string
  tokensUsed: number
  compactionCount: number
  createdAt: string
  updatedAt: string
  messages: MessageOutput[]
  subagents: SubagentOutput[]
}

// =============================================================================
// Inferred input types
// =============================================================================

export type CreateSessionInput = z.infer<typeof createSessionSchema>
export type GetSessionInput = z.infer<typeof getSessionSchema>
export type DeleteSessionInput = z.infer<typeof deleteSessionSchema>
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type ListSessionsInput = z.infer<typeof listSessionsSchema>
