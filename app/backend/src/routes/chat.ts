import { router, protectedProcedure } from '../lib/clients/trpc'
import {
  createConversationSchema,
  getConversationSchema,
  deleteConversationSchema,
  sendMessageSchema,
} from '@shared/schemas/chat'
import * as chatService from '../services/chatService'

/**
 * Chat router — all procedures require authentication.
 *
 * protectedProcedure guarantees ctx.user is non-null.
 * Ownership checks happen in the service layer.
 */
export const chatRouter = router({
  /**
   * List the current user's conversations.
   * Returns newest-first with a message preview and count.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return chatService.listConversations(ctx.user.id)
  }),

  /**
   * Get a single conversation with all messages.
   * Returns NOT_FOUND if it doesn't exist or belongs to another user.
   */
  get: protectedProcedure
    .input(getConversationSchema)
    .query(async ({ ctx, input }) => {
      return chatService.getConversation(input.id, ctx.user.id)
    }),

  /**
   * Create a new conversation.
   * Title is optional — will be auto-generated from the first message.
   */
  create: protectedProcedure
    .input(createConversationSchema)
    .mutation(async ({ ctx, input }) => {
      return chatService.createConversation(ctx.user.id, input)
    }),

  /**
   * Delete a conversation and all its messages.
   * Returns NOT_FOUND if it doesn't exist or belongs to another user.
   */
  delete: protectedProcedure
    .input(deleteConversationSchema)
    .mutation(async ({ ctx, input }) => {
      await chatService.deleteConversation(input.id, ctx.user.id)
      return { success: true }
    }),

  /**
   * Send a message in a conversation.
   * Returns the stored user message.
   *
   * AI response is triggered separately via the SSE streaming endpoint.
   */
  sendMessage: protectedProcedure
    .input(sendMessageSchema)
    .mutation(async ({ ctx, input }) => {
      return chatService.sendMessage(ctx.user.id, input)
    }),
})
