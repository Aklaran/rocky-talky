/**
 * tRPC test caller — call procedures directly without HTTP.
 * Use this for integration tests.
 */
import appRouter from '@backend/routes/root'
import { createContext } from '@backend/lib/middleware/context'

// Create a caller that uses a mock context
export function createTestCaller(contextOverrides = {}) {
  const caller = appRouter.createCaller({
    sessionId: 'test-session-id',
    user: null,
    ...contextOverrides,
  } as Awaited<ReturnType<typeof createContext>>)

  return caller
}
