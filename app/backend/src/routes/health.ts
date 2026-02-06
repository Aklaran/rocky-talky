import { prisma } from '../lib/clients/prisma'
import { publicProcedure, router } from '../lib/clients/trpc'

export const healthRouter = router({
  check: publicProcedure.query(async () => {
    // Actually ping the database — not just a static response
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const dbLatency = Date.now() - start

    return {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: {
        status: 'connected' as const,
        latencyMs: dbLatency,
      },
    }
  }),
})
