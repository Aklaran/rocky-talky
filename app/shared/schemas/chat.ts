import { z } from 'zod'

/**
 * Chat validation schemas — shared between frontend and backend.
 *
 * These define the shape of data flowing through tRPC procedures.
 * Zod handles both runtime validation and TypeScript type inference.
 */

// =============================================================================
// Enums
// =============================================================================

export const MessageRole = z.enum(['system', 'user', 'assistant'])
export type MessageRole = z.infer<typeof MessageRole>

// =============================================================================
// Input Schemas (what clients send)
// =============================================================================

export const createConversationSchema = z.object({
  title: z.string().trim().max(255).optional(),
})

export const getConversationSchema = z.object({
  id: z.string().cuid(),
})

export const deleteConversationSchema = z.object({
  id: z.string().cuid(),
})

export const sendMessageSchema = z.object({
  conversationId: z.string().cuid(),
  content: z.string().trim().min(1, 'Message cannot be empty').max(32000, 'Message too long'),
})

// =============================================================================
// Output Types (what the API returns)
// =============================================================================

export interface MessageOutput {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: string
}

export interface ConversationListItem {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
  /** Preview: the last message content (truncated), if any */
  lastMessage: string | null
  messageCount: number
}

export interface ConversationDetail {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
  messages: MessageOutput[]
}

// =============================================================================
// Inferred input types
// =============================================================================

export type CreateConversationInput = z.infer<typeof createConversationSchema>
export type GetConversationInput = z.infer<typeof getConversationSchema>
export type DeleteConversationInput = z.infer<typeof deleteConversationSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
