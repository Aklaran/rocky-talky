import dotenv from 'dotenv'
import path from 'path'
import { envSchema, Env } from '@shared/schemas/env'

// Load .env from project root (two levels up from app/backend/src/lib/)
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

let _env: Env | null = null

/**
 * Validate and return environment variables.
 * Throws on first call if validation fails — fail fast at startup.
 * Caches the result for subsequent calls.
 */
export function getEnv(): Env {
  if (_env) return _env

  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`❌ Environment validation failed:\n${formatted}`)
  }

  _env = result.data
  return _env
}
