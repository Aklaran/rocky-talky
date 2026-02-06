import { TRPCError } from '@trpc/server'
import * as chatRepo from '../repositories/chatRepository'
import type {
  ConversationListItem,
  ConversationDetail,
  MessageOutput,
  CreateConversationInput,
  SendMessageInput,
} from '@shared/schemas/chat'
import logger from '@shared/util/logger'

/**
 * Chat service — business logic for conversations and messages.
 *
 * Responsibilities:
 * - Ownership checks (users can only access their own conversations)
 * - Data shaping (Prisma types → API output types)
 * - Orchestration (e.g., auto-generating conversation titles)
 *
 * Phase 4 will add: calling aiService for assistant responses.
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
 * Send a user message to a conversation.
 *
 * Phase 3: stores the message, returns it. No AI response.
 * Phase 4: will also call aiService and stream back an assistant response.
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

  // Phase 4: call aiService here and return/stream the assistant response

  return toMessageOutput(message)
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
