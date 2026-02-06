import * as trpcExpress from '@trpc/server/adapters/express'

/**
 * tRPC context — created for each request.
 *
 * Phase 1: Just the session ID.
 * Phase 2 will add: user (from session → DB lookup)
 */
export async function createContext({
  req,
}: trpcExpress.CreateExpressContextOptions) {
  return {
    sessionId: req.sessionID || null,
    user: null as null, // Phase 2: will be User | null
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
