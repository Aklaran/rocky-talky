import { TRPCError } from '@trpc/server'
import * as chatRepo from '../repositories/chatRepository'
import * as aiService from './aiService'
import { getEnv } from '../lib/env'
import type {
  ConversationListItem,
  ConversationDetail,
  MessageOutput,
  CreateConversationInput,
  SendMessageInput,
} from '@shared/schemas/chat'
import type { AIMessage } from '@shared/schemas/ai'
import logger from '@shared/util/logger'

/**
 * Chat service — business logic for conversations and messages.
 *
 * Responsibilities:
 * - Ownership checks (users can only access their own conversations)
 * - Data shaping (Prisma types → API output types)
 * - Orchestration (e.g., auto-generating conversation titles)
 * - AI response generation (Phase 4)
 */

// =============================================================================
// Conversations
// =============================================================================

/**
 * List all conversations for a user.
 */
export async function listConversations(userId: string): Promise<ConversationListItem[]> {
  const conversations = await chatRepo.listConversations(userId)

  return conversations.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    lastMessage: c.messages[0]?.content?.slice(0, 100) ?? null,
    messageCount: c._count.messages,
  }))
}

/**
 * Get a conversation with all messages.
 * Throws UNAUTHORIZED if the conversation doesn't belong to the user.
 */
export async function getConversation(
  conversationId: string,
  userId: string,
): Promise<ConversationDetail> {
  const conversation = await chatRepo.getConversation(conversationId)

  if (!conversation) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
  }

  if (conversation.userId !== userId) {
    // Don't reveal that the conversation exists — return NOT_FOUND
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
  }

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messages: conversation.messages.map(toMessageOutput),
  }
}

/**
 * Create a new conversation.
 */
export async function createConversation(
  userId: string,
  input: CreateConversationInput,
): Promise<ConversationDetail> {
  const conversation = await chatRepo.createConversation(userId, input.title)

  logger.info({ conversationId: conversation.id, userId }, 'Conversation created')

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messages: [],
  }
}

/**
 * Delete a conversation.
 * Throws if not found or not owned by user.
 */
export async function deleteConversation(
  conversationId: string,
  userId: string,
): Promise<void> {
  // Verify ownership first
  const conversation = await chatRepo.getConversation(conversationId)

  if (!conversation) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
  }

  if (conversation.userId !== userId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
  }

  await chatRepo.deleteConversation(conversationId)

  logger.info({ conversationId, userId }, 'Conversation deleted')
}

/**
 * Send a user message to a conversation. Returns the stored user message.
 * Does NOT trigger AI response — that's handled by generateResponse().
 */
export async function sendMessage(
  userId: string,
  input: SendMessageInput,
): Promise<MessageOutput> {
  // Verify ownership
  const conversation = await chatRepo.getConversation(input.conversationId)

  if (!conversation) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
  }

  if (conversation.userId !== userId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
  }

  // Store the user's message
  const message = await chatRepo.addMessage(
    input.conversationId,
    'user',
    input.content,
  )

  // Auto-generate title from first message if conversation has no title
  if (!conversation.title && conversation.messages.length === 0) {
    const autoTitle = input.content.slice(0, 80) + (input.content.length > 80 ? '…' : '')
    await chatRepo.updateConversationTitle(input.conversationId, autoTitle)
  }

  logger.debug({ conversationId: input.conversationId, messageId: message.id }, 'Message sent')

  return toMessageOutput(message)
}

// =============================================================================
// AI Response Generation
// =============================================================================

/**
 * Verify a user owns a conversation. Returns the conversation or throws.
 */
export async function verifyConversationOwnership(
  conversationId: string,
  userId: string,
) {
  const conversation = await chatRepo.getConversation(conversationId)

  if (!conversation) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
  }

  if (conversation.userId !== userId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' })
  }

  return conversation
}

/**
 * Build the message history for an AI request from a conversation.
 * Includes the system prompt if configured.
 */
export function buildAIMessages(
  conversationMessages: { role: string; content: string }[],
): AIMessage[] {
  const env = getEnv()
  const messages: AIMessage[] = []

  // Prepend system prompt if configured
  const systemPrompt = env.AI_SYSTEM_PROMPT
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }

  // Add conversation history
  for (const msg of conversationMessages) {
    messages.push({
      role: msg.role as AIMessage['role'],
      content: msg.content,
    })
  }

  return messages
}

/**
 * Stream an AI response for a conversation.
 *
 * Yields text chunks as they arrive from the AI provider.
 * Saves the complete assistant message to DB when done.
 *
 * Returns the final saved message.
 */
export async function* generateResponseStream(
  conversationId: string,
  userId: string,
): AsyncGenerator<string, MessageOutput> {
  const conversation = await verifyConversationOwnership(conversationId, userId)
  const aiMessages = buildAIMessages(conversation.messages)

  logger.debug(
    { conversationId, messageCount: aiMessages.length },
    'Starting AI response generation',
  )

  let fullContent = ''

  for await (const chunk of aiService.chatStream(aiMessages)) {
    fullContent += chunk
    yield chunk
  }

  // Save the complete assistant message
  const savedMessage = await chatRepo.addMessage(conversationId, 'assistant', fullContent)

  logger.info(
    { conversationId, messageId: savedMessage.id, length: fullContent.length },
    'AI response saved',
  )

  return toMessageOutput(savedMessage)
}

/**
 * Generate a non-streaming AI response.
 * Used for structured outputs or when streaming isn't needed.
 */
export async function generateResponse(
  conversationId: string,
  userId: string,
): Promise<MessageOutput> {
  const conversation = await verifyConversationOwnership(conversationId, userId)
  const aiMessages = buildAIMessages(conversation.messages)

  const content = await aiService.chat(aiMessages)
  const savedMessage = await chatRepo.addMessage(conversationId, 'assistant', content)

  logger.info(
    { conversationId, messageId: savedMessage.id, length: content.length },
    'AI response saved',
  )

  return toMessageOutput(savedMessage)
}

// =============================================================================
// Helpers
// =============================================================================

function toMessageOutput(m: {
  id: string
  conversationId: string
  role: string
  content: string
  createdAt: Date
}): MessageOutput {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role as MessageOutput['role'],
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }
}
