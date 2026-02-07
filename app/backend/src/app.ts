import express, { Express } from 'express'
import * as trpcExpress from '@trpc/server/adapters/express'
import helmet from 'helmet'
import rateLimit, { MemoryStore } from 'express-rate-limit'
import httpLogger from 'pino-http'
import logger from '@shared/util/logger'
import { getEnv } from './lib/env'
import { createContext } from './lib/middleware/context'
import { createSessionMiddleware } from './lib/clients/session'
import appRouter from './routes/root'
import authRouter from './routes/auth'
import streamRouter from './routes/stream'

// Validate environment — fail fast
const env = getEnv()

const app: Express = express()

// Security headers (X-Frame-Options, X-Content-Type-Options, CSP, etc.)
// Disable upgrade-insecure-requests — Tailscale deployment runs on plain HTTP.
// Re-enable if serving behind TLS termination.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'upgrade-insecure-requests': [],
      },
    },
  }),
)

// HTTP request logging
app.use(
  httpLogger({
    logger,
    customReceivedMessage: (req) => `${req.method} ${decodeURIComponent(req.url || '')}`,
    customSuccessMessage: (req, res) => `${req.method} ${res.statusCode}`,
    customSuccessObject: (_req, _res, val) => ({ responseTime: val.responseTime }),
    customErrorMessage: (req, res) => `${req.method} ${res.statusCode}`,
    customErrorObject: (_req, _res, _error, val) => ({ responseTime: val.responseTime }),
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: decodeURIComponent(req.url),
        }
      },
    },
  }),
)

// Trust reverse proxy (nginx/caddy in production)
// Only enable when behind a proxy — not for direct Tailscale exposure.
if (env.TRUST_PROXY) {
  app.set('trust proxy', env.TRUST_PROXY)
}

// Parse JSON request bodies (explicit 100kb limit)
app.use(express.json({ limit: '100kb' }))

// Session middleware — Postgres-backed via connect-pg-simple
app.use(createSessionMiddleware())

// Rate limiting — explicit stores so we can reset them in tests
const authLimiterStore = new MemoryStore()
const apiLimiterStore = new MemoryStore()

// Rate limiting — auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 15, // 15 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  store: authLimiterStore,
  message: { error: 'Too many attempts, please try again later' },
})
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)

// Rate limiting — general API (DoS protection)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1-minute window
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  store: apiLimiterStore,
  message: { error: 'Too many requests, please slow down' },
})
app.use('/api/', apiLimiter)

/**
 * Reset all rate limiter counters — used in tests to isolate test runs.
 */
export function resetRateLimiters(): void {
  authLimiterStore.resetAll()
  apiLimiterStore.resetAll()
}

// Auth routes (REST — not tRPC)
app.use('/api/auth', authRouter)

// AI streaming route (REST SSE — not tRPC)
app.use('/api/chat', streamRouter)

// tRPC API
app.use(
  '/api/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
    onError: ({ error, path: tPath, type }) => {
      logger.error({
        error: {
          message: error.message,
          code: error.code,
          stack: error.stack,
        },
        path: tPath,
        type,
      })
    },
  }),
)

export { app }
