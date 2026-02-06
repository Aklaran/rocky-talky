import { z } from 'zod'

/**
 * AI-related schemas — shared between frontend and backend.
 *
 * Defines the interface for AI provider interactions:
 * - Message format for chat completions
 * - Streaming event shapes
 * - Structured output validation
 */

// =============================================================================
// Chat Messages (input to AI providers)
// =============================================================================

export const aiMessageRoleSchema = z.enum(['system', 'user', 'assistant'])
export type AIMessageRole = z.infer<typeof aiMessageRoleSchema>

export const aiMessageSchema = z.object({
  role: aiMessageRoleSchema,
  content: z.string(),
})
export type AIMessage = z.infer<typeof aiMessageSchema>

// =============================================================================
// Chat Options
// =============================================================================

export const chatOptionsSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  systemPrompt: z.string().optional(),
})
export type ChatOptions = z.infer<typeof chatOptionsSchema>

// =============================================================================
// Streaming Events (SSE payload shapes)
// =============================================================================

/** A chunk of streamed text content */
export const streamChunkEventSchema = z.object({
  type: z.literal('chunk'),
  content: z.string(),
})

/** Stream completed — includes the saved message */
export const streamDoneEventSchema = z.object({
  type: z.literal('done'),
  message: z.object({
    id: z.string(),
    conversationId: z.string(),
    role: z.literal('assistant'),
    content: z.string(),
    createdAt: z.string(),
  }),
})

/** Stream error */
export const streamErrorEventSchema = z.object({
  type: z.literal('error'),
  error: z.string(),
})

export const streamEventSchema = z.discriminatedUnion('type', [
  streamChunkEventSchema,
  streamDoneEventSchema,
  streamErrorEventSchema,
])

export type StreamChunkEvent = z.infer<typeof streamChunkEventSchema>
export type StreamDoneEvent = z.infer<typeof streamDoneEventSchema>
export type StreamErrorEvent = z.infer<typeof streamErrorEventSchema>
export type StreamEvent = z.infer<typeof streamEventSchema>

// =============================================================================
// Structured Output Example
// =============================================================================

/**
 * Example structured output schema — demonstrates Zod validation of AI responses.
 * Used in evals to verify the AI can produce valid structured data.
 */
export const conversationSummarySchema = z.object({
  title: z.string().max(80).describe('A short title for the conversation'),
  topics: z.array(z.string()).describe('Key topics discussed'),
  sentiment: z.enum(['positive', 'neutral', 'negative']).describe('Overall sentiment'),
})
export type ConversationSummary = z.infer<typeof conversationSummarySchema>
