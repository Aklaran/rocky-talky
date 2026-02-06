/**
 * tRPC test caller — call procedures directly without HTTP.
 *
 * Uses createCallerFactory (tRPC v11 recommended approach).
 * The caller invokes procedures as regular async functions,
 * bypassing HTTP encoding entirely.
 *
 * Usage:
 *   const caller = createTestCaller()                    // unauthenticated
 *   const caller = createTestCaller({ user: someUser })  // authenticated
 *   const result = await caller.chat.list()
 */
import appRouter from '@backend/routes/root'
import { createCallerFactory } from '@backend/lib/clients/trpc'
import type { Context } from '@backend/lib/middleware/context'

const callerFactory = createCallerFactory(appRouter)

/**
 * Create a tRPC caller with the given context overrides.
 *
 * By default creates an unauthenticated context (user: null).
 * Pass { user: { id, email, createdAt } } to simulate an authenticated user.
 */
export function createTestCaller(contextOverrides: Partial<Context> = {}) {
  const ctx: Context = {
    sessionId: 'test-session-id',
    user: null,
    ...contextOverrides,
  }

  return callerFactory(ctx)
}

/**
 * Convenience: create a caller for a specific authenticated user.
 */
export function createAuthenticatedCaller(user: { id: string; email: string; createdAt: Date }) {
  return createTestCaller({ user })
}
