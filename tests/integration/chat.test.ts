import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createTestCaller, createAuthenticatedCaller } from '../setup/trpc'
import { resetDb, disconnectDb, prisma } from '../setup/db'

/**
 * Chat integration tests.
 *
 * Uses tRPC's createCallerFactory for direct procedure invocation —
 * no HTTP encoding, no supertest. Tests the full stack:
 * router → middleware → service → repository → DB.
 *
 * Key behaviors tested:
 * - Auth requirement (all chat routes reject unauthenticated callers)
 * - CRUD operations on conversations and messages
 * - Ownership isolation (users can only access their own data)
 * - Message ordering (chronological)
 * - Cascade deletes (conversation deletion removes messages)
 * - Auto-title generation from first message
 * - Empty states
 * - updatedAt ordering (messages bump conversations to top of list)
 */

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a real user in the DB and return a tRPC caller authenticated as them.
 * Uses a dummy password hash — we're testing chat logic, not auth.
 */
async function createUserAndCaller(email: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: 'test-hash-not-real' },
    select: { id: true, email: true, createdAt: true },
  })
  return { user, caller: createAuthenticatedCaller(user) }
}

// =============================================================================
// Tests
// =============================================================================

describe('Chat routes', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await disconnectDb()
  })

  // ===========================================================================
  // Auth requirement
  // ===========================================================================

  describe('Auth requirement', () => {
    it('rejects unauthenticated requests to chat.list', async () => {
      const caller = createTestCaller()
      await expect(caller.chat.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('rejects unauthenticated requests to chat.create', async () => {
      const caller = createTestCaller()
      await expect(caller.chat.create({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('rejects unauthenticated requests to chat.sendMessage', async () => {
      const caller = createTestCaller()
      await expect(
        caller.chat.sendMessage({ conversationId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx', content: 'hi' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('rejects unauthenticated requests to chat.get', async () => {
      const caller = createTestCaller()
      await expect(
        caller.chat.get({ id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('rejects unauthenticated requests to chat.delete', async () => {
      const caller = createTestCaller()
      await expect(
        caller.chat.delete({ id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })
  })

  // ===========================================================================
  // Conversation CRUD
  // ===========================================================================

  describe('Conversation CRUD', () => {
    it('returns empty list for a new user', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const result = await caller.chat.list()
      expect(result).toEqual([])
    })

    it('creates a conversation with a title', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({ title: 'My Chat' })

      expect(convo.id).toBeDefined()
      expect(convo.title).toBe('My Chat')
      expect(convo.messages).toEqual([])
      expect(convo.createdAt).toBeDefined()
      expect(convo.updatedAt).toBeDefined()
    })

    it('creates a conversation without a title', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({})
      expect(convo.title).toBeNull()
    })

    it('lists conversations ordered by updatedAt descending', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')

      await caller.chat.create({ title: 'First' })
      await caller.chat.create({ title: 'Second' })
      await caller.chat.create({ title: 'Third' })

      const list = await caller.chat.list()

      expect(list).toHaveLength(3)
      expect(list[0].title).toBe('Third')
      expect(list[1].title).toBe('Second')
      expect(list[2].title).toBe('First')
    })

    it('gets a specific conversation with messages', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({ title: 'Test' })

      await caller.chat.sendMessage({ conversationId: convo.id, content: 'Hello!' })

      const result = await caller.chat.get({ id: convo.id })

      expect(result.id).toBe(convo.id)
      expect(result.title).toBe('Test')
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].content).toBe('Hello!')
      expect(result.messages[0].role).toBe('user')
    })

    it('deletes a conversation', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({ title: 'Doomed' })

      const result = await caller.chat.delete({ id: convo.id })
      expect(result).toMatchObject({ success: true })

      const list = await caller.chat.list()
      expect(list).toHaveLength(0)
    })

    it('returns NOT_FOUND when getting a deleted conversation', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({})

      await caller.chat.delete({ id: convo.id })

      await expect(caller.chat.get({ id: convo.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('returns NOT_FOUND when getting a non-existent conversation', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')

      await expect(
        caller.chat.get({ id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('returns NOT_FOUND when deleting a non-existent conversation', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')

      await expect(
        caller.chat.delete({ id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  // ===========================================================================
  // Messages
  // ===========================================================================

  describe('Messages', () => {
    it('sends a message and returns it', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({})

      const msg = await caller.chat.sendMessage({
        conversationId: convo.id,
        content: 'Hello world',
      })

      expect(msg.id).toBeDefined()
      expect(msg.conversationId).toBe(convo.id)
      expect(msg.role).toBe('user')
      expect(msg.content).toBe('Hello world')
      expect(msg.createdAt).toBeDefined()
    })

    it('messages are ordered chronologically', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({})

      await caller.chat.sendMessage({ conversationId: convo.id, content: 'First' })
      await caller.chat.sendMessage({ conversationId: convo.id, content: 'Second' })
      await caller.chat.sendMessage({ conversationId: convo.id, content: 'Third' })

      const result = await caller.chat.get({ id: convo.id })

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
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({})

      await caller.chat.sendMessage({
        conversationId: convo.id,
        content: 'What is the meaning of life?',
      })

      const result = await caller.chat.get({ id: convo.id })
      expect(result.title).toBe('What is the meaning of life?')
    })

    it('truncates auto-generated title at 80 chars', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({})

      const longMessage = 'A'.repeat(100)
      await caller.chat.sendMessage({
        conversationId: convo.id,
        content: longMessage,
      })

      const result = await caller.chat.get({ id: convo.id })
      expect(result.title).toBe('A'.repeat(80) + '…')
    })

    it('does not overwrite existing title on first message', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({ title: 'My Title' })

      await caller.chat.sendMessage({
        conversationId: convo.id,
        content: 'This should not become the title',
      })

      const result = await caller.chat.get({ id: convo.id })
      expect(result.title).toBe('My Title')
    })

    it('rejects empty message content', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({})

      await expect(
        caller.chat.sendMessage({ conversationId: convo.id, content: '' }),
      ).rejects.toThrow()
    })

    it('rejects whitespace-only message content', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({})

      await expect(
        caller.chat.sendMessage({ conversationId: convo.id, content: '   ' }),
      ).rejects.toThrow()
    })

    it('rejects message to non-existent conversation', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')

      await expect(
        caller.chat.sendMessage({
          conversationId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
          content: 'Hello',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('conversation list shows message count and preview', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({ title: 'Chat' })

      await caller.chat.sendMessage({ conversationId: convo.id, content: 'Hello!' })
      await caller.chat.sendMessage({ conversationId: convo.id, content: 'How are you?' })

      const list = await caller.chat.list()

      expect(list).toHaveLength(1)
      expect(list[0].messageCount).toBe(2)
      expect(list[0].lastMessage).toBe('How are you?')
    })
  })

  // ===========================================================================
  // Cascade deletes
  // ===========================================================================

  describe('Cascade deletes', () => {
    it('deleting a conversation removes all its messages from DB', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')
      const convo = await caller.chat.create({})

      await caller.chat.sendMessage({ conversationId: convo.id, content: 'Message 1' })
      await caller.chat.sendMessage({ conversationId: convo.id, content: 'Message 2' })

      // Verify messages exist
      const msgCount = await prisma.message.count({ where: { conversationId: convo.id } })
      expect(msgCount).toBe(2)

      // Delete
      await caller.chat.delete({ id: convo.id })

      // Messages should be gone
      const remaining = await prisma.message.count({ where: { conversationId: convo.id } })
      expect(remaining).toBe(0)
    })
  })

  // ===========================================================================
  // Ownership isolation
  // ===========================================================================

  describe('Ownership isolation', () => {
    it("users cannot see each other's conversations in list", async () => {
      const { caller: alice } = await createUserAndCaller('alice@test.com')
      const { caller: bob } = await createUserAndCaller('bob@test.com')

      await alice.chat.create({ title: 'Alice Chat' })
      await bob.chat.create({ title: 'Bob Chat' })

      const aliceList = await alice.chat.list()
      const bobList = await bob.chat.list()

      expect(aliceList).toHaveLength(1)
      expect(aliceList[0].title).toBe('Alice Chat')
      expect(bobList).toHaveLength(1)
      expect(bobList[0].title).toBe('Bob Chat')
    })

    it("user cannot get another user's conversation", async () => {
      const { caller: alice } = await createUserAndCaller('alice@test.com')
      const { caller: bob } = await createUserAndCaller('bob@test.com')

      const aliceConvo = await alice.chat.create({ title: 'Private' })

      await expect(bob.chat.get({ id: aliceConvo.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it("user cannot delete another user's conversation", async () => {
      const { caller: alice } = await createUserAndCaller('alice@test.com')
      const { caller: bob } = await createUserAndCaller('bob@test.com')

      const aliceConvo = await alice.chat.create({ title: 'Private' })

      // Bob tries to delete
      await expect(bob.chat.delete({ id: aliceConvo.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })

      // Verify it still exists for Alice
      const result = await alice.chat.get({ id: aliceConvo.id })
      expect(result.title).toBe('Private')
    })

    it("user cannot send message in another user's conversation", async () => {
      const { caller: alice } = await createUserAndCaller('alice@test.com')
      const { caller: bob } = await createUserAndCaller('bob@test.com')

      const aliceConvo = await alice.chat.create({})

      await expect(
        bob.chat.sendMessage({
          conversationId: aliceConvo.id,
          content: 'Sneaky message',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  // ===========================================================================
  // Updated ordering
  // ===========================================================================

  describe('Updated ordering', () => {
    it('sending a message bumps conversation to top of list', async () => {
      const { caller } = await createUserAndCaller('alice@test.com')

      const old = await caller.chat.create({ title: 'Old' })

      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 50))

      await caller.chat.create({ title: 'New' })

      // "New" should be first
      let list = await caller.chat.list()
      expect(list[0].title).toBe('New')

      // Send message to "Old" — it should jump to top
      await caller.chat.sendMessage({ conversationId: old.id, content: 'Bump!' })

      list = await caller.chat.list()
      expect(list[0].title).toBe('Old')
    })
  })
})
