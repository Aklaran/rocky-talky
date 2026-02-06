import { configDotenv } from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load .env in development (in Docker, env vars are injected via compose)
const envPath = path.join(__dirname, '../../../.env')
if (fs.existsSync(envPath)) {
  configDotenv({ path: envPath })
}

import express from 'express'
import * as trpcExpress from '@trpc/server/adapters/express'
import httpLogger from 'pino-http'
import logger from '@shared/util/logger'
import { getEnv } from './lib/env'
import { createContext } from './lib/middleware/context'
import appRouter from './routes/root'

// Validate environment — fail fast
const env = getEnv()

const app = express()

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

// Serve frontend static files in production
const distPath = path.join(__dirname, '../../frontend/dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// Start server
app.listen(env.PORT, () => {
  logger.info(`🏔️  Basecamp running on port ${env.PORT}`)
})

export { app }
