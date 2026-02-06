import * as trpcExpress from '@trpc/server/adapters/express'
import { getUserById } from '../../services/authService'

/**
 * tRPC context — created for each request.
 *
 * Extracts userId from session and hydrates the full user object.
 * If session has a userId but user doesn't exist (deleted), user is null.
 */
export async function createContext({
  req,
}: trpcExpress.CreateExpressContextOptions) {
  let user: Awaited<ReturnType<typeof getUserById>> = null

  if (req.session?.userId) {
    user = await getUserById(req.session.userId)
  }

  return {
    sessionId: req.sessionID || null,
    user,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
