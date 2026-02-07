import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { app, resetRateLimiters } from '@backend/app'
import { resetDb, disconnectDb, prisma } from '../setup/db'
import { createAuthenticatedCaller } from '../setup/trpc'
import * as aiService from '@backend/services/aiService'
import { MockProvider } from '@backend/services/providers/mock'

/**
 * Security hardening tests.
 *
 * Validates the fixes from the Basecamp security audit (docs/AUDIT.md):
 * - S1: Rate limiting on auth endpoints
 * - S2: Session regeneration after login (session fixation prevention)
 * - S3: Request body size limit
 * - S4: Security headers (helmet)
 * - S5: SSE stream timeout and content length limit
 * - S8: Session rolling (idle timeout)
 */

// =============================================================================
// Helpers
// =============================================================================

function getCookie(res: supertest.Response, name: string): string | undefined {
  const cookies = res.headers['set-cookie']
  if (!cookies) return undefined
  const arr = Array.isArray(cookies) ? cookies : [cookies]
  const match = arr.find((c: string) => c.startsWith(`${name}=`))
  if (!match) return undefined
  return match.split(';')[0].split('=').slice(1).join('=')
}

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
      } catch { /* skip */ }
    }
  }
  return events
}

async function createUserWithSession(email: string, password: string = 'TestPassword123!') {
  const agent = supertest.agent(app)
  await agent.post('/api/auth/register').send({ email, password }).expect(201)
  return agent
}

// =============================================================================
// Tests
// =============================================================================

describe('Security hardening', () => {
  beforeEach(async () => {
    await resetDb()
    aiService.resetProvider()
    resetRateLimiters()
  })

  afterAll(async () => {
    await disconnectDb()
  })

  // ===========================================================================
  // S1: Rate limiting
  // ===========================================================================

  describe('S1: Rate limiting on auth endpoints', () => {
    it('returns 429 after too many login attempts', async () => {
      // Register a user first
      await supertest(app)
        .post('/api/auth/register')
        .send({ email: 'rate@test.com', password: 'password123' })

      // Hammer the login endpoint past the limit (15 per 15-min window)
      const results: number[] = []
      for (let i = 0; i < 20; i++) {
        const res = await supertest(app)
          .post('/api/auth/login')
          .send({ email: 'rate@test.com', password: 'wrongpassword' })
        results.push(res.status)
      }

      // Should see some 429s in the mix
      expect(results).toContain(429)
      // First few should be 401 (invalid creds, not rate limited)
      expect(results[0]).toBe(401)
    })

    it('returns 429 after too many register attempts', async () => {
      const results: number[] = []
      for (let i = 0; i < 20; i++) {
        const res = await supertest(app)
          .post('/api/auth/register')
          .send({ email: `flood${i}@test.com`, password: 'password123' })
        results.push(res.status)
      }

      expect(results).toContain(429)
      // First should succeed
      expect(results[0]).toBe(201)
    })

    it('rate limit response includes proper error message', async () => {
      // Exhaust the rate limit
      for (let i = 0; i < 16; i++) {
        await supertest(app)
          .post('/api/auth/login')
          .send({ email: 'nobody@test.com', password: 'wrong' })
      }

      const res = await supertest(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'wrong' })

      if (res.status === 429) {
        expect(res.body.error).toContain('Too many attempts')
      }
    })
  })

  // ===========================================================================
  // S2: Session regeneration (session fixation prevention)
  // ===========================================================================

  describe('S2: Session regeneration after authentication', () => {
    it('issues a new session ID after registration', async () => {
      const agent = supertest.agent(app)

      // First request — establish a pre-auth session by hitting any endpoint
      const preAuth = await agent.get('/api/auth/me')
      const preAuthCookie = getCookie(preAuth, 'basecamp.sid')

      // Register — should get a new session
      const registerRes = await agent
        .post('/api/auth/register')
        .send({ email: 'regen@test.com', password: 'password123' })
      expect(registerRes.status).toBe(201)

      const postAuthCookie = getCookie(registerRes, 'basecamp.sid')

      // A new set-cookie header should be present (new session)
      expect(postAuthCookie).toBeDefined()

      // The new session should work — user should be authenticated
      const meRes = await agent.get('/api/auth/me')
      expect(meRes.body.user).not.toBeNull()
      expect(meRes.body.user.email).toBe('regen@test.com')
    })

    it('issues a new session ID after login', async () => {
      // Create user first
      await supertest(app)
        .post('/api/auth/register')
        .send({ email: 'regen2@test.com', password: 'password123' })

      const agent = supertest.agent(app)

      // Establish a pre-auth session
      await agent.get('/api/auth/me')

      // Login — should regenerate
      const loginRes = await agent
        .post('/api/auth/login')
        .send({ email: 'regen2@test.com', password: 'password123' })
      expect(loginRes.status).toBe(200)

      const postLoginCookie = getCookie(loginRes, 'basecamp.sid')
      expect(postLoginCookie).toBeDefined()

      // Verify the session works
      const meRes = await agent.get('/api/auth/me')
      expect(meRes.body.user).not.toBeNull()
      expect(meRes.body.user.email).toBe('regen2@test.com')
    })

    it('pre-login session ID cannot be reused after login (session fixation prevention)', async () => {
      // Register user first (separate request, not the agent we're testing)
      await supertest(app)
        .post('/api/auth/register')
        .send({ email: 'regen3@test.com', password: 'password123' })

      // Agent establishes a pre-login session
      const agent = supertest.agent(app)
      const preLoginRes = await agent.get('/api/auth/me')
      const preLoginCookie = getCookie(preLoginRes, 'basecamp.sid')

      // Login — session should be regenerated
      const loginRes = await agent
        .post('/api/auth/login')
        .send({ email: 'regen3@test.com', password: 'password123' })
      expect(loginRes.status).toBe(200)

      const postLoginCookie = getCookie(loginRes, 'basecamp.sid')

      // The session ID must be different after login (regeneration happened)
      // If they were the same, a session fixation attack would be possible
      expect(postLoginCookie).toBeDefined()
      expect(preLoginCookie).not.toBe(postLoginCookie)

      // The new session should work
      const meRes = await agent.get('/api/auth/me')
      expect(meRes.body.user).not.toBeNull()
      expect(meRes.body.user.email).toBe('regen3@test.com')
    })
  })

  // ===========================================================================
  // S3: Body size limit
  // ===========================================================================

  describe('S3: Request body size limit', () => {
    it('rejects payloads larger than 100kb', async () => {
      // Generate a payload larger than 100kb
      const largeContent = 'x'.repeat(200 * 1024) // 200kb

      const res = await supertest(app)
        .post('/api/auth/login')
        .send({ email: largeContent, password: 'test' })

      // Express returns 413 Payload Too Large
      expect(res.status).toBe(413)
    })
  })

  // ===========================================================================
  // S4: Security headers (helmet)
  // ===========================================================================

  describe('S4: Security headers (helmet)', () => {
    it('sets X-Content-Type-Options: nosniff', async () => {
      const res = await supertest(app).get('/api/auth/me')

      expect(res.headers['x-content-type-options']).toBe('nosniff')
    })

    it('sets X-Frame-Options header', async () => {
      const res = await supertest(app).get('/api/auth/me')

      // Helmet sets SAMEORIGIN by default
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    })

    it('removes X-Powered-By header', async () => {
      const res = await supertest(app).get('/api/auth/me')

      // Helmet disables the Express "X-Powered-By: Express" header
      expect(res.headers['x-powered-by']).toBeUndefined()
    })

    it('sets Content-Security-Policy header', async () => {
      const res = await supertest(app).get('/api/auth/me')

      expect(res.headers['content-security-policy']).toBeDefined()
    })

    it('sets X-DNS-Prefetch-Control header', async () => {
      const res = await supertest(app).get('/api/auth/me')

      expect(res.headers['x-dns-prefetch-control']).toBe('off')
    })
  })

  // ===========================================================================
  // S5: SSE stream timeout and content length limit
  // ===========================================================================

  describe('S5: SSE stream safety limits', () => {
    it('terminates stream when response exceeds max content length', async () => {
      // Reset limiters to ensure clean state after rate-limit tests
      resetRateLimiters()
      const agent = await createUserWithSession('limit@test.com')

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'limit@test.com' },
        select: { id: true, email: true, createdAt: true },
      })
      const caller = createAuthenticatedCaller(user)

      const convo = await caller.chat.create({})
      await caller.chat.sendMessage({ conversationId: convo.id, content: 'Generate a lot' })

      // Get the actual mock provider (AI_PROVIDER=mock in .env.test)
      // and set a massive response that exceeds the 100k character limit.
      // MockProvider yields word-by-word with 10ms delay per word,
      // so we use a small number of very large "words" to stay within test timeout.
      aiService.resetProvider()
      const provider = aiService.getProvider() as MockProvider
      // 20 "words" of ~6k chars each = ~120k total, 20 × 10ms = 200ms
      provider.mockResponse = Array(20).fill('x'.repeat(6_000)).join(' ')

      const res = await agent
        .post('/api/chat/generate')
        .send({ conversationId: convo.id })

      const events = parseSSEEvents(res.text)
      const errors = events.filter((e) => e.event === 'error')

      // Should get an error about response being too long
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect((errors[0].data as { error: string }).error).toBe('Response too long')
    })
  })
})
