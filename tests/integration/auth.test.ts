import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app, resetRateLimiters } from '@backend/app'
import { resetDb, disconnectDb, prisma } from '../setup/db'

describe('Auth routes', () => {
  beforeEach(async () => {
    await resetDb()
    resetRateLimiters()
  })

  afterAll(async () => {
    await disconnectDb()
  })

  // ===========================================================================
  // Registration
  // ===========================================================================

  describe('POST /api/auth/register', () => {
    it('creates a user and returns 201 with user data', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })

      expect(res.status).toBe(201)
      expect(res.body.user).toBeDefined()
      expect(res.body.user.email).toBe('test@example.com')
      expect(res.body.user.id).toBeDefined()
      expect(res.body.user.createdAt).toBeDefined()
      // Must NOT return password hash
      expect(res.body.user.passwordHash).toBeUndefined()
    })

    it('sets a session cookie on successful registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })

      expect(res.status).toBe(201)
      const cookies = res.headers['set-cookie']
      expect(cookies).toBeDefined()
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies
      expect(cookieStr).toMatch(/basecamp\.sid/)
    })

    it('stores password as a hash, not plaintext', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })

      const user = await prisma.user.findUnique({
        where: { email: 'test@example.com' },
      })
      expect(user).toBeDefined()
      expect(user!.passwordHash).not.toBe('password123')
      expect(user!.passwordHash).toMatch(/^\$argon2/) // argon2 hash prefix
    })

    it('normalizes email to lowercase', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'Test@EXAMPLE.com', password: 'password123' })

      expect(res.status).toBe(201)
      expect(res.body.user.email).toBe('test@example.com')
    })

    it('rejects duplicate email with 409', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'different456' })

      expect(res.status).toBe(409)
      expect(res.body.error).toContain('already exists')
      expect(res.body.code).toBe('EMAIL_EXISTS')
    })

    it('rejects invalid email with 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
      expect(res.body.issues).toBeDefined()
    })

    it('rejects short password with 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'short' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
    })

    it('rejects missing fields with 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({})

      expect(res.status).toBe(400)
    })
  })

  // ===========================================================================
  // Login
  // ===========================================================================

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a user to log in with
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })
    })

    it('returns 200 with user data on valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })

      expect(res.status).toBe(200)
      expect(res.body.user).toBeDefined()
      expect(res.body.user.email).toBe('test@example.com')
      expect(res.body.user.passwordHash).toBeUndefined()
    })

    it('sets a session cookie on successful login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })

      expect(res.status).toBe(200)
      const cookies = res.headers['set-cookie']
      expect(cookies).toBeDefined()
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies
      expect(cookieStr).toMatch(/basecamp\.sid/)
    })

    it('rejects wrong password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' })

      expect(res.status).toBe(401)
      expect(res.body.error).toContain('Invalid')
    })

    it('rejects non-existent email with 401 (no email enumeration)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'noone@example.com', password: 'password123' })

      expect(res.status).toBe(401)
      // Same error message as wrong password — prevents email enumeration
      expect(res.body.error).toContain('Invalid')
    })

    it('handles case-insensitive email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'TEST@example.com', password: 'password123' })

      expect(res.status).toBe(200)
      expect(res.body.user.email).toBe('test@example.com')
    })
  })

  // ===========================================================================
  // Logout
  // ===========================================================================

  describe('POST /api/auth/logout', () => {
    it('returns 200 and clears session cookie', async () => {
      // Register to get a session
      const agent = request.agent(app)
      await agent
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })

      const res = await agent.post('/api/auth/logout')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('after logout, /me returns null user', async () => {
      const agent = request.agent(app)
      await agent
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })

      await agent.post('/api/auth/logout')

      const meRes = await agent.get('/api/auth/me')
      expect(meRes.body.user).toBeNull()
    })
  })

  // ===========================================================================
  // Session persistence (/me endpoint)
  // ===========================================================================

  describe('GET /api/auth/me', () => {
    it('returns null user when not authenticated', async () => {
      const res = await request(app).get('/api/auth/me')

      expect(res.status).toBe(200)
      expect(res.body.user).toBeNull()
    })

    it('returns user data when authenticated', async () => {
      const agent = request.agent(app)
      await agent
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })

      const res = await agent.get('/api/auth/me')

      expect(res.status).toBe(200)
      expect(res.body.user).toBeDefined()
      expect(res.body.user.email).toBe('test@example.com')
    })

    it('session persists across multiple requests', async () => {
      const agent = request.agent(app)
      await agent
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })

      // Multiple /me calls should all return the user
      const res1 = await agent.get('/api/auth/me')
      const res2 = await agent.get('/api/auth/me')

      expect(res1.body.user.email).toBe('test@example.com')
      expect(res2.body.user.email).toBe('test@example.com')
    })
  })

  // ===========================================================================
  // Protected tRPC routes
  // ===========================================================================

  describe('Protected tRPC procedures', () => {
    it('health check works without auth (public procedure)', async () => {
      const res = await request(app).get('/api/trpc/health.check')

      expect(res.status).toBe(200)
    })
  })
})
