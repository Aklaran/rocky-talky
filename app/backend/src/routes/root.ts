import { router } from '../lib/clients/trpc'
import { healthRouter } from './health'
import { chatRouter } from './chat'

const appRouter = router({
  health: healthRouter,
  chat: chatRouter,
})

export default appRouter
export type AppRouter = typeof appRouter
