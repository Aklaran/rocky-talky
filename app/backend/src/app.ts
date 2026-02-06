import express, { Express } from 'express'
import * as trpcExpress from '@trpc/server/adapters/express'
import httpLogger from 'pino-http'
import logger from '@shared/util/logger'
import { getEnv } from './lib/env'
import { createContext } from './lib/middleware/context'
import { createSessionMiddleware } from './lib/clients/session'
import appRouter from './routes/root'
import authRouter from './routes/auth'

// Validate environment — fail fast
getEnv()

const app: Express = express()

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
app.set('trust proxy', 1)

// Parse JSON request bodies
app.use(express.json())

// Session middleware — Postgres-backed via connect-pg-simple
app.use(createSessionMiddleware())

// Auth routes (REST — not tRPC)
app.use('/api/auth', authRouter)

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
