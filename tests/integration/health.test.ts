import { describe, it, expect } from 'vitest'
import { createTestCaller } from '../setup/trpc'

describe('Health check', () => {
  it('returns ok status with DB connection info', async () => {
    const caller = createTestCaller()
    const result = await caller.health.check()

    expect(result.status).toBe('ok')
    expect(result.timestamp).toBeDefined()
    expect(result.uptime).toBeGreaterThan(0)
    expect(result.db.status).toBe('connected')
    expect(result.db.latencyMs).toBeGreaterThanOrEqual(0)
  })
})
