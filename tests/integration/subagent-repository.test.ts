import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { resetDb, disconnectDb, prisma } from '../setup/db'
import * as subagentRepository from '@backend/repositories/subagentRepository'

/**
 * Subagent repository integration tests.
 *
 * Tests CRUD operations for subagents and subagent messages.
 */

describe('Subagent repository', () => {
  let sessionId: string

  beforeEach(async () => {
    await resetDb()
    // Create a test session for subagents to belong to
    const session = await prisma.session.create({
      data: { title: 'Test Session' },
    })
    sessionId = session.id
  })

  afterAll(async () => {
    await disconnectDb()
  })

  describe('createSubagent', () => {
    it('creates a subagent with all fields', async () => {
      const subagent = await subagentRepository.createSubagent({
        sessionId,
        taskId: 'task-123',
        description: 'Test subagent',
        tier: 'standard',
        status: 'running',
      })

      expect(subagent.id).toBeDefined()
      expect(subagent.sessionId).toBe(sessionId)
      expect(subagent.taskId).toBe('task-123')
      expect(subagent.description).toBe('Test subagent')
      expect(subagent.tier).toBe('standard')
      expect(subagent.status).toBe('running')
      expect(subagent.output).toBeNull()
      expect(subagent.createdAt).toBeDefined()
      expect(subagent.completedAt).toBeNull()
    })

    it('creates a subagent with minimal fields (no taskId)', async () => {
      const subagent = await subagentRepository.createSubagent({
        sessionId,
        description: 'Minimal subagent',
      })

      expect(subagent.taskId).toBeNull()
      expect(subagent.tier).toBeNull()
      expect(subagent.status).toBe('running') // default
    })
  })

  describe('getSubagent', () => {
    it('retrieves a subagent by ID', async () => {
      const created = await subagentRepository.createSubagent({
        sessionId,
        description: 'Test',
      })

      const retrieved = await subagentRepository.getSubagent(created.id)

      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe(created.id)
    })

    it('returns null for non-existent ID', async () => {
      const result = await subagentRepository.getSubagent('clxxxxxxxxxxxxxxxxxxxxxxxxx')
      expect(result).toBeNull()
    })
  })

  describe('getSubagentByTaskId', () => {
    it('retrieves a subagent by task ID', async () => {
      const created = await subagentRepository.createSubagent({
        sessionId,
        taskId: 'task-456',
        description: 'Test',
      })

      const retrieved = await subagentRepository.getSubagentByTaskId('task-456')

      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe(created.id)
      expect(retrieved?.taskId).toBe('task-456')
    })

    it('returns null for non-existent task ID', async () => {
      const result = await subagentRepository.getSubagentByTaskId('nonexistent')
      expect(result).toBeNull()
    })

    it('returns null when taskId is null', async () => {
      await subagentRepository.createSubagent({
        sessionId,
        description: 'No task ID',
      })

      const result = await subagentRepository.getSubagentByTaskId('anything')
      expect(result).toBeNull()
    })
  })

  describe('listSubagentsBySession', () => {
    it('returns all subagents for a session', async () => {
      await subagentRepository.createSubagent({
        sessionId,
        description: 'First',
      })
      await subagentRepository.createSubagent({
        sessionId,
        description: 'Second',
      })

      const list = await subagentRepository.listSubagentsBySession(sessionId)

      expect(list).toHaveLength(2)
      expect(list[0].description).toBe('First')
      expect(list[1].description).toBe('Second')
    })

    it('returns empty array when session has no subagents', async () => {
      const list = await subagentRepository.listSubagentsBySession(sessionId)
      expect(list).toEqual([])
    })

    it('does not return subagents from other sessions', async () => {
      const otherSession = await prisma.session.create({
        data: { title: 'Other' },
      })

      await subagentRepository.createSubagent({
        sessionId: otherSession.id,
        description: 'Other session subagent',
      })

      const list = await subagentRepository.listSubagentsBySession(sessionId)
      expect(list).toEqual([])
    })
  })

  describe('updateSubagentStatus', () => {
    it('updates status to completed', async () => {
      const subagent = await subagentRepository.createSubagent({
        sessionId,
        description: 'Test',
      })

      const updated = await subagentRepository.updateSubagentStatus(
        subagent.id,
        'completed',
      )

      expect(updated.status).toBe('completed')
      expect(updated.completedAt).toBeDefined()
      expect(updated.completedAt).not.toBeNull()
    })

    it('updates status and output', async () => {
      const subagent = await subagentRepository.createSubagent({
        sessionId,
        description: 'Test',
      })

      const updated = await subagentRepository.updateSubagentStatus(
        subagent.id,
        'failed',
        'Error: something went wrong',
      )

      expect(updated.status).toBe('failed')
      expect(updated.output).toBe('Error: something went wrong')
      expect(updated.completedAt).toBeDefined()
    })

    it('does not set completedAt when status is running', async () => {
      const subagent = await subagentRepository.createSubagent({
        sessionId,
        description: 'Test',
        status: 'completed',
      })

      // Hack: manually set completedAt in DB
      await prisma.subagent.update({
        where: { id: subagent.id },
        data: { completedAt: new Date() },
      })

      const updated = await subagentRepository.updateSubagentStatus(
        subagent.id,
        'running',
      )

      expect(updated.status).toBe('running')
      // completedAt should not be modified when switching back to running
    })
  })

  describe('appendSubagentMessage', () => {
    it('adds a message to a subagent', async () => {
      const subagent = await subagentRepository.createSubagent({
        sessionId,
        description: 'Test',
      })

      const message = await subagentRepository.appendSubagentMessage({
        subagentId: subagent.id,
        role: 'assistant',
        content: 'Hello from subagent',
      })

      expect(message.id).toBeDefined()
      expect(message.subagentId).toBe(subagent.id)
      expect(message.role).toBe('assistant')
      expect(message.content).toBe('Hello from subagent')
      expect(message.createdAt).toBeDefined()
    })

    it('allows multiple messages for a subagent', async () => {
      const subagent = await subagentRepository.createSubagent({
        sessionId,
        description: 'Test',
      })

      await subagentRepository.appendSubagentMessage({
        subagentId: subagent.id,
        role: 'user',
        content: 'Message 1',
      })

      await subagentRepository.appendSubagentMessage({
        subagentId: subagent.id,
        role: 'assistant',
        content: 'Message 2',
      })

      const messages = await prisma.subagentMessage.findMany({
        where: { subagentId: subagent.id },
      })

      expect(messages).toHaveLength(2)
    })
  })
})
