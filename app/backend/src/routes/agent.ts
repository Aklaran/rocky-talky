import { router, protectedProcedure } from '../lib/clients/trpc'
import { z } from 'zod'
import * as agentBridge from '../services/agentBridgeService'
import { observable } from '@trpc/server/observable'
import logger from '@shared/util/logger'

/**
 * Agent router — Pi SDK agent bridge for Rocky Talky.
 *
 * All procedures require authentication.
 * Agent sessions are linked to Rocky Talky session IDs.
 *
 * Flow:
 * 1. Client calls startSession to create a Pi agent session
 * 2. Client calls sendMessage to send user messages
 * 3. Client subscribes to streamEvents to receive responses in real-time
 * 4. Client calls stopSession to clean up when done
 */

const startSessionSchema = z.object({
  sessionId: z.string().min(1),
})

const sendMessageSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
})

const streamEventsSchema = z.object({
  sessionId: z.string().min(1),
})

const stopSessionSchema = z.object({
  sessionId: z.string().min(1),
})

export const agentRouter = router({
  /**
   * Start a new Pi agent session.
   *
   * Creates an agent session linked to the given Rocky Talky session ID.
   * The session will have the Annapurna skill loaded.
   *
   * Returns the session info.
   * Throws if session already exists.
   */
  startSession: protectedProcedure
    .input(startSessionSchema)
    .mutation(async ({ input }) => {
      logger.info({ sessionId: input.sessionId }, 'Starting agent session')

      const sessionInfo = await agentBridge.createSession(input.sessionId)

      return {
        sessionId: sessionInfo.sessionId,
        createdAt: sessionInfo.createdAt,
      }
    }),

  /**
   * Send a message to an agent session.
   *
   * Triggers message processing. The response is streamed via the streamEvents subscription.
   * This mutation returns immediately; the client should subscribe to events separately.
   *
   * Returns success status.
   * Throws if session not found.
   */
  sendMessage: protectedProcedure
    .input(sendMessageSchema)
    .mutation(async ({ input }) => {
      logger.info(
        { sessionId: input.sessionId, messageLength: input.message.length },
        'Queuing agent message',
      )

      // Verify session exists
      const sessionInfo = agentBridge.getSession(input.sessionId)
      if (!sessionInfo) {
        throw new Error(`No agent session found for session ${input.sessionId}`)
      }

      // Start message processing in background
      // The streamEvents subscription will pick up the events
      processMessageInBackground(input.sessionId, input.message)

      return {
        success: true,
        sessionId: input.sessionId,
      }
    }),

  /**
   * Stream agent events for a session.
   *
   * Returns a subscription that emits events as the agent processes messages.
   *
   * Event types:
   * - text: text chunk from the agent
   * - tool_call: agent is calling a tool
   * - tool_result: tool execution result
   * - completion: message fully processed
   * - error: error occurred
   *
   * Note: This is a subscription (SSE/WebSocket). The client should establish
   * the subscription before calling sendMessage.
   */
  streamEvents: protectedProcedure
    .input(streamEventsSchema)
    .subscription(({ input }) => {
      return observable<agentBridge.AgentEvent>((emit) => {
        logger.info({ sessionId: input.sessionId }, 'Client subscribed to agent events')

        // Store event emitter for this session
        const emitter = getOrCreateEmitter(input.sessionId)

        // Forward events to the subscription
        const listener = (event: agentBridge.AgentEvent) => {
          emit.next(event)
        }

        emitter.on('event', listener)

        // Cleanup on unsubscribe
        return () => {
          logger.info({ sessionId: input.sessionId }, 'Client unsubscribed from agent events')
          emitter.off('event', listener)
        }
      })
    }),

  /**
   * Stop and dispose an agent session.
   *
   * Cleans up resources and removes the session from memory.
   *
   * Returns success status.
   */
  stopSession: protectedProcedure
    .input(stopSessionSchema)
    .mutation(async ({ input }) => {
      logger.info({ sessionId: input.sessionId }, 'Stopping agent session')

      const disposed = await agentBridge.disposeSession(input.sessionId)

      // Clean up event emitter
      sessionEmitters.delete(input.sessionId)

      return {
        success: disposed,
        sessionId: input.sessionId,
      }
    }),

  /**
   * Get info about the current agent session.
   *
   * Returns session info or null if no session exists.
   */
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ input }) => {
      const sessionInfo = agentBridge.getSession(input.sessionId)
      if (!sessionInfo) {
        return null
      }

      return {
        sessionId: sessionInfo.sessionId,
        createdAt: sessionInfo.createdAt,
      }
    }),

  /**
   * Get count of active agent sessions.
   */
  getActiveSessionCount: protectedProcedure.query(() => {
    return {
      count: agentBridge.getActiveSessionCount(),
    }
  }),
})

// =============================================================================
// Event Emitter Management
// =============================================================================

import { EventEmitter } from 'events'

/** Map of session ID → event emitter */
const sessionEmitters = new Map<string, EventEmitter>()

/**
 * Get or create an event emitter for a session.
 */
function getOrCreateEmitter(sessionId: string): EventEmitter {
  let emitter = sessionEmitters.get(sessionId)
  if (!emitter) {
    emitter = new EventEmitter()
    emitter.setMaxListeners(50) // Allow multiple subscriptions
    sessionEmitters.set(sessionId, emitter)
  }
  return emitter
}

/**
 * Process a message in the background and emit events.
 */
async function processMessageInBackground(sessionId: string, message: string): Promise<void> {
  const emitter = getOrCreateEmitter(sessionId)

  try {
    for await (const event of agentBridge.sendMessage(sessionId, message)) {
      emitter.emit('event', event)
    }
  } catch (err) {
    logger.error({ err, sessionId }, 'Error processing agent message')
    emitter.emit('event', {
      type: 'error',
      error: (err as Error).message,
    } as agentBridge.AgentEventError)
  }
}
