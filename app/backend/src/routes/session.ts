import { router, publicProcedure } from '../lib/clients/trpc'
import {
  createSessionSchema,
  getSessionSchema,
  deleteSessionSchema,
  updateSessionSchema,
  sendMessageSchema,
  listSessionsSchema,
} from '@shared/schemas/session'
import * as sessionService from '../services/sessionService'

/**
 * Session router — all procedures use publicProcedure.
 *
 * NOTE (Rocky Talky): No auth checks — single-user app.
 * If you can reach this over Tailscale, you're authenticated.
 */
export const sessionRouter = router({
  /**
   * List all sessions with optional filters.
   * Returns newest-first with a message preview and count.
   */
  list: publicProcedure.input(listSessionsSchema.optional()).query(async ({ input }) => {
    return sessionService.listSessions(input)
  }),

  /**
   * Get a single session with all messages.
   * Returns NOT_FOUND if it doesn't exist.
   */
  get: publicProcedure.input(getSessionSchema).query(async ({ input }) => {
    return sessionService.getSession(input.id)
  }),

  /**
   * Create a new session.
   * Title and tags are optional.
   */
  create: publicProcedure.input(createSessionSchema).mutation(async ({ input }) => {
    return sessionService.createSession(input)
  }),

  /**
   * Update a session's title, tags, or status.
   * Returns NOT_FOUND if it doesn't exist.
   */
  update: publicProcedure.input(updateSessionSchema).mutation(async ({ input }) => {
    return sessionService.updateSession(input.id, input)
  }),

  /**
   * Delete a session and all its messages.
   * Returns NOT_FOUND if it doesn't exist.
   */
  delete: publicProcedure.input(deleteSessionSchema).mutation(async ({ input }) => {
    await sessionService.deleteSession(input.id)
    return { success: true }
  }),

  /**
   * Send a message in a session.
   * Returns the stored user message.
   *
   * AI response is triggered separately via the SSE streaming endpoint.
   */
  sendMessage: publicProcedure.input(sendMessageSchema).mutation(async ({ input }) => {
    return sessionService.sendMessage(input)
  }),
})
