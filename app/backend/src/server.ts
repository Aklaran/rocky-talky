import { configDotenv } from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load .env in development (in Docker, env vars are injected via compose)
const envPath = path.join(__dirname, '../../../.env')
if (fs.existsSync(envPath)) {
  configDotenv({ path: envPath })
}

import express from 'express'
import logger from '@shared/util/logger'
import { getEnv } from './lib/env'
import { app } from './app'

const env = getEnv()

// Serve frontend static files in production
// In dev: __dirname = app/backend/src → ../../frontend/dist
// In prod: __dirname = app/backend/dist/backend/src → ../../../../frontend/dist
const distPath = path.join(__dirname, '../../frontend/dist')
const altDistPath = path.join(__dirname, '../../../../frontend/dist')
const staticPath = fs.existsSync(distPath) ? distPath : altDistPath
if (fs.existsSync(staticPath)) {
  logger.info(`Serving static files from ${staticPath}`)
  app.use(express.static(staticPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'))
  })
}

// Start server
app.listen(env.PORT, () => {
  logger.info(`🏔️  Basecamp running on port ${env.PORT}`)
})
