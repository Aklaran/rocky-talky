import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { app } from '@backend/app'
import { resetDb, disconnectDb, prisma } from '../setup/db'
import { createAuthenticatedCaller } from '../setup/trpc'
import * as aiService from '@backend/services/aiService'

/**
 * AI streaming integration tests.
 *
 * Tests the full flow:
 * - Send user message via tRPC
 * - Stream AI response via SSE endpoint
 * - Verify assistant message saved to DB
 *
 * Uses the mock provider (AI_PROVIDER=mock in .env.test)
 * so no real API calls are made.
 *
 * Key behaviors tested:
 * - SSE endpoint authentication
 * - Streaming produces valid SSE events
 * - Complete assistant message saved to DB
 * - Ownership isolation (can't stream for other user's conversation)
 * - Graceful handling when AI provider unavailable
 */

// =============================================================================
// Helpers
// =============================================================================

async function createUserAndCaller(email: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: 'test-hash-not-real' },
    select: { id: true, email: true, createdAt: true },
  })
  return { user, caller: createAuthenticatedCaller(user) }
}

/**
 * Create a user with a session cookie for HTTP requests.
 * Registers through the API to get a real session.
 */
async function createUserWithSession(email: string, password: string = 'TestPassword123!') {
  const agent = supertest.agent(app)
  await agent
    .post('/api/auth/register')
    .send({ email, password })
    .expect(201)
  return agent
}

/**
 * Parse SSE response body into events.
 */
function parseSSEEvents(body: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = []
  const blocks = body.split('\n\n')

  for (const block of blocks) {
    if (!block.trim()) continue

    let eventType = ''
    let data = ''

    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) eventType = line.slice(7)
      else if (line.startsWith('data: ')) data = line.slice(6)
    }

    if (eventType && data) {
      try {
        events.push({ event: eventType, data: JSON.parse(data) })
      } catch {
        // skip malformed
      }
    }
  }

  return events
}

// =============================================================================
// Tests
// =============================================================================

describe('AI Streaming (/api/chat/generate)', () => {
  beforeEach(async () => {
    await resetDb()
    aiService.resetProvider()
  })

  afterAll(async () => {
    await disconnectDb()
  })

  // ===========================================================================
  // Auth
  // ===========================================================================

  describe('Authentication', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await supertest(app)
        .post('/api/chat/generate')
        .send({ conversationId: 'test-id' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Not authenticated')
    })
  })

  // ===========================================================================
  // Streaming
  // ===========================================================================

  describe('Streaming', () => {
    it('streams AI response and saves assistant message', async () => {
      // Create user via tRPC caller (for conversation setup)
      // and via HTTP (for session cookie on the SSE endpoint)
      const agent = await createUserWithSession('streamer@test.com')

      // Get the user we just created so we can make a tRPC caller
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'streamer@test.com' },
        select: { id: true, email: true, createdAt: true },
      })
      const caller = createAuthenticatedCaller(user)

      // Create conversation and send a message via tRPC (direct call)
      const convo = await caller.chat.create({})
      await caller.chat.sendMessage({
        conversationId: convo.id,
        content: 'Hello AI!',
      })

      // Now stream the AI response via SSE (HTTP with session cookie)
      const streamRes = await agent
        .post('/api/chat/generate')
        .send({ conversationId: convo.id })

      expect(streamRes.status).toBe(200)
      expect(streamRes.headers['content-type']).toBe('text/event-stream')

      // Parse SSE events
      const events = parseSSEEvents(streamRes.text)

      // Should have at least one chunk and a done event
      const chunks = events.filter((e) => e.event === 'chunk')
      const doneEvents = events.filter((e) => e.event === 'done')

      expect(chunks.length).toBeGreaterThan(0)
      expect(doneEvents).toHaveLength(1)

      // Chunks should have content
      for (const chunk of chunks) {
        expect((chunk.data as { content: string }).content).toBeDefined()
      }

      // Done event should have the saved message
      const doneData = doneEvents[0].data as {
        message: { id: string; role: string; content: string }
      }
      expect(doneData.message.id).toBeDefined()
      expect(doneData.message.role).toBe('assistant')
      expect(doneData.message.content).toContain('Hello AI!')

      // Verify the message was saved to DB
      const savedMsg = await prisma.message.findUnique({
        where: { id: doneData.message.id },
      })
      expect(savedMsg).not.toBeNull()
      expect(savedMsg?.role).toBe('assistant')
    })

    it('returns error for non-existent conversation', async () => {
      const agent = await createUserWithSession('alice@test.com')

      const res = await agent
        .post('/api/chat/generate')
        .send({ conversationId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' })

      const events = parseSSEEvents(res.text)
      const errors = events.filter((e) => e.event === 'error')
      expect(errors).toHaveLength(1)
      expect((errors[0].data as { error: string }).error).toBe('Conversation not found')
    })

    it('rejects streaming for another user\'s conversation', async () => {
      // Create a conversation as user A
      const { caller: alice } = await createUserAndCaller('alice@test.com')
      const convo = await alice.chat.create({})
      await alice.chat.sendMessage({ conversationId: convo.id, content: 'Secret message' })

      // Try to stream as user B (different HTTP session)
      const bobAgent = await createUserWithSession('bob@test.com')
      const res = await bobAgent
        .post('/api/chat/generate')
        .send({ conversationId: convo.id })

      const events = parseSSEEvents(res.text)
      const errors = events.filter((e) => e.event === 'error')
      expect(errors).toHaveLength(1)
      expect((errors[0].data as { error: string }).error).toBe('Conversation not found')
    })

    it('validates request body', async () => {
      const agent = await createUserWithSession('alice@test.com')

      const res = await agent
        .post('/api/chat/generate')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
    })
  })

  // ===========================================================================
  // AI Provider fallback
  // ===========================================================================

  describe('Provider fallback', () => {
    it('returns fallback message when no AI provider configured', async () => {
      // Reset and mock getEnv to simulate no provider
      aiService.resetProvider()
      vi.spyOn(await import('@backend/lib/env'), 'getEnv').mockReturnValue({
        NODE_ENV: 'test',
        PORT: 3000,
        DATABASE_URL: process.env.DATABASE_URL!,
        SESSION_SECRET: process.env.SESSION_SECRET!,
        COOKIE_SECURE: false,
        LOG_LEVEL: undefined,
        AI_PROVIDER: undefined,
        AI_MODEL: undefined,
        OPENAI_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined,
        AI_SYSTEM_PROMPT: undefined,
      })

      const agent = await createUserWithSession('fallback@test.com')

      // Get the user for tRPC caller
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'fallback@test.com' },
        select: { id: true, email: true, createdAt: true },
      })
      const caller = createAuthenticatedCaller(user)

      // Create conversation and send message
      const convo = await caller.chat.create({})
      await caller.chat.sendMessage({ conversationId: convo.id, content: 'Hello?' })

      // Stream — should get fallback message
      const streamRes = await agent
        .post('/api/chat/generate')
        .send({ conversationId: convo.id })

      const events = parseSSEEvents(streamRes.text)
      const doneEvents = events.filter((e) => e.event === 'done')

      expect(doneEvents).toHaveLength(1)
      const message = (doneEvents[0].data as { message: { content: string } }).message
      expect(message.content).toContain('AI is not configured')

      vi.restoreAllMocks()
    })
  })
})
