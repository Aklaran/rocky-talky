import { router } from '../lib/clients/trpc'
import { healthRouter } from './health'
import { chatRouter } from './chat'
import { sessionRouter } from './session'
import { agentRouter } from './agent'

const appRouter = router({
  health: healthRouter,
  chat: chatRouter,
  session: sessionRouter,
  agent: agentRouter,
})

export default appRouter
export type AppRouter = typeof appRouter
