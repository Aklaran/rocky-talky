import { describe, it, expect } from 'vitest'
import { envSchema } from '@shared/schemas/env'

describe('Environment validation', () => {
  it('accepts valid env vars', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      SESSION_SECRET: 'a'.repeat(32),
      PORT: '3000',
      NODE_ENV: 'development',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing DATABASE_URL', () => {
    const result = envSchema.safeParse({
      SESSION_SECRET: 'a'.repeat(32),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('DATABASE_URL'))).toBe(true)
    }
  })

  it('rejects short SESSION_SECRET', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      SESSION_SECRET: 'too-short',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('SESSION_SECRET'))).toBe(true)
    }
  })

  it('applies defaults for NODE_ENV and PORT', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      SESSION_SECRET: 'a'.repeat(32),
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development')
      expect(result.data.PORT).toBe(3000)
    }
  })

  it('coerces PORT from string to number', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      SESSION_SECRET: 'a'.repeat(32),
      PORT: '8080',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.PORT).toBe(8080)
    }
  })
})
