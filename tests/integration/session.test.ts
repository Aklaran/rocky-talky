import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createTestCaller } from '../setup/trpc'
import { resetDb, disconnectDb, prisma } from '../setup/db'

/**
 * Session integration tests.
 *
 * Uses tRPC's createCallerFactory for direct procedure invocation —
 * no HTTP encoding, no supertest. Tests the full stack:
 * router → middleware → service → repository → DB.
 *
 * Key behaviors tested:
 * - CRUD operations on sessions and messages
 * - Tag filtering
 * - Status filtering
 * - Cascade deletes (session deletion removes messages)
 * - Auto-title generation from first message
 * - Empty states
 * - updatedAt ordering (messages bump sessions to top of list)
 *
 * NOTE (Rocky Talky): No auth checks — single-user app.
 * All routes use publicProcedure.
 */

// =============================================================================
// Tests
// =============================================================================

describe('Session routes', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await disconnectDb()
  })

  // ===========================================================================
  // Session CRUD
  // ===========================================================================

  describe('Session CRUD', () => {
    it('returns empty list for a new user', async () => {
      const caller = createTestCaller()
      const result = await caller.session.list()
      expect(result).toEqual([])
    })

    it('creates a session with title and tags', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({
        title: 'My Session',
        tags: ['work', 'important'],
      })

      expect(session.id).toBeDefined()
      expect(session.title).toBe('My Session')
      expect(session.tags).toEqual(['work', 'important'])
      expect(session.status).toBe('active')
      expect(session.messages).toEqual([])
      expect(session.createdAt).toBeDefined()
      expect(session.updatedAt).toBeDefined()
      expect(session.modelUsed).toBe('claude-opus-4-20250609')
      expect(session.tokensUsed).toBe(0)
      expect(session.compactionCount).toBe(0)
    })

    it('creates a session without title or tags', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({})
      expect(session.title).toBeNull()
      expect(session.tags).toEqual([])
    })

    it('lists sessions ordered by updatedAt descending', async () => {
      const caller = createTestCaller()

      await caller.session.create({ title: 'First' })
      await caller.session.create({ title: 'Second' })
      await caller.session.create({ title: 'Third' })

      const list = await caller.session.list()

      expect(list).toHaveLength(3)
      expect(list[0].title).toBe('Third')
      expect(list[1].title).toBe('Second')
      expect(list[2].title).toBe('First')
    })

    it('gets a specific session with messages', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({ title: 'Test' })

      await caller.session.sendMessage({ sessionId: session.id, content: 'Hello!' })

      const result = await caller.session.get({ id: session.id })

      expect(result.id).toBe(session.id)
      expect(result.title).toBe('Test')
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].content).toBe('Hello!')
      expect(result.messages[0].role).toBe('user')
    })

    it('updates a session title', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({ title: 'Old Title' })

      const updated = await caller.session.update({
        id: session.id,
        title: 'New Title',
      })

      expect(updated.title).toBe('New Title')
    })

    it('updates session tags', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({ tags: ['old'] })

      const updated = await caller.session.update({
        id: session.id,
        tags: ['new', 'tags'],
      })

      expect(updated.tags).toEqual(['new', 'tags'])
    })

    it('updates session status', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({})

      const updated = await caller.session.update({
        id: session.id,
        status: 'completed',
      })

      expect(updated.status).toBe('completed')
    })

    it('deletes a session', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({ title: 'Doomed' })

      const result = await caller.session.delete({ id: session.id })
      expect(result).toMatchObject({ success: true })

      const list = await caller.session.list()
      expect(list).toHaveLength(0)
    })

    it('returns NOT_FOUND when getting a deleted session', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({})

      await caller.session.delete({ id: session.id })

      await expect(caller.session.get({ id: session.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('returns NOT_FOUND when getting a non-existent session', async () => {
      const caller = createTestCaller()

      await expect(
        caller.session.get({ id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('returns NOT_FOUND when updating a non-existent session', async () => {
      const caller = createTestCaller()

      await expect(
        caller.session.update({
          id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
          title: 'Nope',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('returns NOT_FOUND when deleting a non-existent session', async () => {
      const caller = createTestCaller()

      await expect(
        caller.session.delete({ id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  // ===========================================================================
  // Messages
  // ===========================================================================

  describe('Messages', () => {
    it('sends a message and returns it', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({})

      const msg = await caller.session.sendMessage({
        sessionId: session.id,
        content: 'Hello world',
      })

      expect(msg.id).toBeDefined()
      expect(msg.sessionId).toBe(session.id)
      expect(msg.role).toBe('user')
      expect(msg.content).toBe('Hello world')
      expect(msg.createdAt).toBeDefined()
    })

    it('messages are ordered chronologically', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({})

      await caller.session.sendMessage({ sessionId: session.id, content: 'First' })
      await caller.session.sendMessage({ sessionId: session.id, content: 'Second' })
      await caller.session.sendMessage({ sessionId: session.id, content: 'Third' })

      const result = await caller.session.get({ id: session.id })

      expect(result.messages).toHaveLength(3)
      expect(result.messages[0].content).toBe('First')
      expect(result.messages[1].content).toBe('Second')
      expect(result.messages[2].content).toBe('Third')

      // Verify timestamps are non-decreasing
      const times = result.messages.map((m) => new Date(m.createdAt).getTime())
      expect(times[0]).toBeLessThanOrEqual(times[1])
      expect(times[1]).toBeLessThanOrEqual(times[2])
    })

    it('auto-generates title from first message when no title set', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({})

      await caller.session.sendMessage({
        sessionId: session.id,
        content: 'What is the meaning of life?',
      })

      const result = await caller.session.get({ id: session.id })
      expect(result.title).toBe('What is the meaning of life?')
    })

    it('truncates auto-generated title at 80 chars', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({})

      const longMessage = 'A'.repeat(100)
      await caller.session.sendMessage({
        sessionId: session.id,
        content: longMessage,
      })

      const result = await caller.session.get({ id: session.id })
      expect(result.title).toBe('A'.repeat(80) + '…')
    })

    it('does not overwrite existing title on first message', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({ title: 'My Title' })

      await caller.session.sendMessage({
        sessionId: session.id,
        content: 'This should not become the title',
      })

      const result = await caller.session.get({ id: session.id })
      expect(result.title).toBe('My Title')
    })

    it('rejects empty message content', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({})

      await expect(
        caller.session.sendMessage({ sessionId: session.id, content: '' }),
      ).rejects.toThrow()
    })

    it('rejects whitespace-only message content', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({})

      await expect(
        caller.session.sendMessage({ sessionId: session.id, content: '   ' }),
      ).rejects.toThrow()
    })

    it('rejects message to non-existent session', async () => {
      const caller = createTestCaller()

      await expect(
        caller.session.sendMessage({
          sessionId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
          content: 'Hello',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('session list shows message count and preview', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({ title: 'Chat' })

      await caller.session.sendMessage({ sessionId: session.id, content: 'Hello!' })
      await caller.session.sendMessage({ sessionId: session.id, content: 'How are you?' })

      const list = await caller.session.list()

      expect(list).toHaveLength(1)
      expect(list[0].messageCount).toBe(2)
      expect(list[0].lastMessage).toBe('How are you?')
    })
  })

  // ===========================================================================
  // Filtering
  // ===========================================================================

  describe('Filtering', () => {
    it('filters sessions by tag', async () => {
      const caller = createTestCaller()

      await caller.session.create({ title: 'Work 1', tags: ['work'] })
      await caller.session.create({ title: 'Work 2', tags: ['work', 'urgent'] })
      await caller.session.create({ title: 'Personal', tags: ['personal'] })

      const workSessions = await caller.session.list({ tag: 'work' })
      expect(workSessions).toHaveLength(2)
      expect(workSessions.map((s) => s.title).sort()).toEqual(['Work 1', 'Work 2'])

      const urgentSessions = await caller.session.list({ tag: 'urgent' })
      expect(urgentSessions).toHaveLength(1)
      expect(urgentSessions[0].title).toBe('Work 2')

      const personalSessions = await caller.session.list({ tag: 'personal' })
      expect(personalSessions).toHaveLength(1)
      expect(personalSessions[0].title).toBe('Personal')
    })

    it('filters sessions by status', async () => {
      const caller = createTestCaller()

      const active1 = await caller.session.create({ title: 'Active 1' })
      const active2 = await caller.session.create({ title: 'Active 2' })
      const completed = await caller.session.create({ title: 'Completed' })

      await caller.session.update({ id: completed.id, status: 'completed' })

      const activeSessions = await caller.session.list({ status: 'active' })
      expect(activeSessions).toHaveLength(2)
      expect(activeSessions.map((s) => s.title).sort()).toEqual(['Active 1', 'Active 2'])

      const completedSessions = await caller.session.list({ status: 'completed' })
      expect(completedSessions).toHaveLength(1)
      expect(completedSessions[0].title).toBe('Completed')
    })

    it('filters by both tag and status', async () => {
      const caller = createTestCaller()

      const session1 = await caller.session.create({
        title: 'Active Work',
        tags: ['work'],
      })
      const session2 = await caller.session.create({
        title: 'Completed Work',
        tags: ['work'],
      })
      await caller.session.update({ id: session2.id, status: 'completed' })

      await caller.session.create({
        title: 'Active Personal',
        tags: ['personal'],
      })

      const filtered = await caller.session.list({ tag: 'work', status: 'active' })
      expect(filtered).toHaveLength(1)
      expect(filtered[0].title).toBe('Active Work')
    })

    it('returns empty list when no sessions match filters', async () => {
      const caller = createTestCaller()

      await caller.session.create({ title: 'Test', tags: ['work'] })

      const result = await caller.session.list({ tag: 'nonexistent' })
      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // Cascade deletes
  // ===========================================================================

  describe('Cascade deletes', () => {
    it('deleting a session removes all its messages from DB', async () => {
      const caller = createTestCaller()
      const session = await caller.session.create({})

      await caller.session.sendMessage({ sessionId: session.id, content: 'Message 1' })
      await caller.session.sendMessage({ sessionId: session.id, content: 'Message 2' })

      // Verify messages exist
      const msgCount = await prisma.sessionMessage.count({
        where: { sessionId: session.id },
      })
      expect(msgCount).toBe(2)

      // Delete
      await caller.session.delete({ id: session.id })

      // Messages should be gone
      const remaining = await prisma.sessionMessage.count({
        where: { sessionId: session.id },
      })
      expect(remaining).toBe(0)
    })
  })

  // ===========================================================================
  // Updated ordering
  // ===========================================================================

  describe('Updated ordering', () => {
    it('sending a message bumps session to top of list', async () => {
      const caller = createTestCaller()

      const old = await caller.session.create({ title: 'Old' })

      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 50))

      await caller.session.create({ title: 'New' })

      // "New" should be first
      let list = await caller.session.list()
      expect(list[0].title).toBe('New')

      // Send message to "Old" — it should jump to top
      await caller.session.sendMessage({ sessionId: old.id, content: 'Bump!' })

      list = await caller.session.list()
      expect(list[0].title).toBe('Old')
    })
  })
})
