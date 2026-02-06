import { describe, it, expect } from 'vitest'
import { registerSchema, loginSchema } from '@shared/schemas/auth'

describe('Auth schemas', () => {
  describe('registerSchema', () => {
    it('accepts valid email and password', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'strongpassword',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('user@example.com')
      }
    })

    it('normalizes email to lowercase and trims', () => {
      const result = registerSchema.safeParse({
        email: '  USER@Example.COM  ',
        password: 'password123',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('user@example.com')
      }
    })

    it('rejects invalid email', () => {
      const result = registerSchema.safeParse({
        email: 'not-email',
        password: 'password123',
      })
      expect(result.success).toBe(false)
    })

    it('rejects password shorter than 8 chars', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'short',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('8 characters')
      }
    })

    it('rejects password longer than 128 chars', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'a'.repeat(129),
      })
      expect(result.success).toBe(false)
    })

    it('rejects email longer than 255 chars', () => {
      const result = registerSchema.safeParse({
        email: 'a'.repeat(250) + '@b.com',
        password: 'password123',
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing email', () => {
      const result = registerSchema.safeParse({
        password: 'password123',
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing password', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('loginSchema', () => {
    it('accepts valid email and password', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'anypassword',
      })
      expect(result.success).toBe(true)
    })

    it('normalizes email to lowercase', () => {
      const result = loginSchema.safeParse({
        email: 'USER@Example.COM',
        password: 'password',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('user@example.com')
      }
    })

    it('rejects empty password', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: '',
      })
      expect(result.success).toBe(false)
    })
  })
})
