import { z } from 'zod'

/**
 * Backend environment variable schema.
 * Validated at startup — fail fast if anything is missing.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection string'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters'),
  // Override secure cookie flag. Defaults to true in production.
  // Set to 'false' for Tailscale deployments (HTTPS not needed).
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
})

export type Env = z.infer<typeof envSchema>
