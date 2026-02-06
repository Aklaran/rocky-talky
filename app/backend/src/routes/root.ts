import { router } from '../lib/clients/trpc'
import { healthRouter } from './health'

const appRouter = router({
  health: healthRouter,
})

export default appRouter
export type AppRouter = typeof appRouter
