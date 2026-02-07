import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@backend/lib/clients/prisma'
import { createTestCaller } from '../setup/trpc'
import * as subagentRepo from '@backend/repositories/subagentRepository'
import * as sessionService from '@backend/services/sessionService'

/**
 * Session Subagents Endpoint Test
 *
 * Tests the new tRPC procedure: session.subagents
 * Returns all subagents for a session, allowing frontend to poll for completion status.
 */

describe('session.subagents tRPC endpoint', () => {
  let sessionId: string

  beforeEach(async () => {
    // Clean up test data
    await prisma.subagent.deleteMany()
    await prisma.message.deleteMany()
    await prisma.session.deleteMany()

    // Create test session using service (generates proper CUID)
    const session = await sessionService.createSession({
      title: 'Test Session',
    })
    sessionId = session.id
  })

  afterEach(async () => {
    await prisma.subagent.deleteMany()
    await prisma.message.deleteMany()
    await prisma.session.deleteMany()
  })

  it('should return empty array when session has no subagents', async () => {
    const caller = createTestCaller()
    const result = await caller.session.subagents({ sessionId })

    expect(result).toEqual([])
  })

  it('should return all subagents for a session ordered by creation time', async () => {
    // Create multiple subagents
    await subagentRepo.createSubagent({
      sessionId,
      taskId: 'task-1',
      description: 'First task',
      tier: 'light',
      status: 'completed',
    })

    await new Promise(resolve => setTimeout(resolve, 10)) // Ensure different timestamps

    await subagentRepo.createSubagent({
      sessionId,
      taskId: 'task-2',
      description: 'Second task',
      tier: 'standard',
      status: 'running',
    })

    await new Promise(resolve => setTimeout(resolve, 10))

    await subagentRepo.createSubagent({
      sessionId,
      taskId: 'task-3',
      description: 'Third task',
      tier: 'complex',
      status: 'failed',
    })

    const caller = createTestCaller()
    const result = await caller.session.subagents({ sessionId })

    expect(result).toHaveLength(3)
    expect(result[0].taskId).toBe('task-1')
    expect(result[1].taskId).toBe('task-2')
    expect(result[2].taskId).toBe('task-3')
  })

  it('should return subagent with all expected fields', async () => {
    const subagent = await subagentRepo.createSubagent({
      sessionId,
      taskId: 'task-fields',
      description: 'Test all fields',
      tier: 'light',
      status: 'running',
    })

    const caller = createTestCaller()
    const result = await caller.session.subagents({ sessionId })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: subagent.id,
      sessionId,
      taskId: 'task-fields',
      description: 'Test all fields',
      tier: 'light',
      status: 'running',
      output: null,
      completedAt: null,
    })
    expect(result[0].createdAt).toBeDefined()
  })

  it('should include completedAt when subagent is completed', async () => {
    const subagent = await subagentRepo.createSubagent({
      sessionId,
      taskId: 'task-completed',
      description: 'Completed task',
      tier: 'standard',
      status: 'running',
    })

    // Update to completed
    await subagentRepo.updateSubagentStatus(subagent.id, 'completed')

    const caller = createTestCaller()
    const result = await caller.session.subagents({ sessionId })

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('completed')
    expect(result[0].completedAt).not.toBeNull()
  })

  it('should not return subagents from other sessions', async () => {
    // Create another session using service
    const otherSession = await sessionService.createSession({
      title: 'Other Session',
    })

    // Create subagent in original session
    await subagentRepo.createSubagent({
      sessionId,
      taskId: 'task-original',
      description: 'Original task',
      tier: 'light',
      status: 'running',
    })

    // Create subagent in other session
    await subagentRepo.createSubagent({
      sessionId: otherSession.id,
      taskId: 'task-other',
      description: 'Other task',
      tier: 'standard',
      status: 'running',
    })

    const caller = createTestCaller()
    const result = await caller.session.subagents({ sessionId })

    expect(result).toHaveLength(1)
    expect(result[0].taskId).toBe('task-original')
  })

  it('should validate sessionId format', async () => {
    const caller = createTestCaller()
    
    await expect(
      caller.session.subagents({ sessionId: 'invalid-id' })
    ).rejects.toThrow()
  })
})
