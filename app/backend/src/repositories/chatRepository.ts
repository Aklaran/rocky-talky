import { prisma } from '../lib/clients/prisma'
import type { MessageRole } from '@shared/schemas/chat'

/**
 * Chat repository — data access layer for conversations and messages.
 *
 * Rules:
 * - Only Prisma queries here. No business logic.
 * - Receives specific params, not full request context.
 * - Returns Prisma types — the service layer shapes them for output.
 */

// =============================================================================
// Conversations
// =============================================================================

/**
 * List conversations for a user, ordered newest first.
 * Includes message count and a preview of the last message.
 */
export async function listConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { userId },
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
 * Get a single conversation with all its messages, ordered chronologically.
 */
export async function getConversation(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

/**
 * Create a new conversation for a user.
 */
export async function createConversation(userId: string, title?: string) {
  return prisma.conversation.create({
    data: {
      userId,
      title: title || null,
    },
  })
}

/**
 * Delete a conversation (messages cascade via DB foreign key).
 */
export async function deleteConversation(id: string) {
  return prisma.conversation.delete({
    where: { id },
  })
}

/**
 * Update conversation title. Also bumps updatedAt.
 */
export async function updateConversationTitle(id: string, title: string) {
  return prisma.conversation.update({
    where: { id },
    data: { title },
  })
}

// =============================================================================
// Messages
// =============================================================================

/**
 * Add a message to a conversation.
 * Also touches the conversation's updatedAt so it sorts to top of list.
 */
export async function addMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
) {
  // Use a transaction to atomically add the message and bump updatedAt
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        role,
        content,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ])

  return message
}

/**
 * Get all messages for a conversation, ordered chronologically.
 */
export async function getMessages(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  })
}
