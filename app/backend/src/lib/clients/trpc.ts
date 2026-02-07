import { initTRPC, TRPCError } from '@trpc/server'
import { Context } from '../middleware/context'

const trpc = initTRPC.context<Context>().create()

/**
 * Auth middleware — rejects unauthenticated requests.
 * Used by protectedProcedure.
 *
 * NOTE (Rocky Talky): This auth middleware is kept from the template but unused.
 * Rocky Talky is single-user — if you can reach it over Tailscale, you're authenticated.
 * Session routes use publicProcedure instead.
 */
const isAuthenticated = trpc.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action',
    })
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // Narrowed: definitely not null
    },
  })
})

export const router = trpc.router
export const publicProcedure = trpc.procedure
export const protectedProcedure = trpc.procedure.use(isAuthenticated)
export const createCallerFactory = trpc.createCallerFactory
