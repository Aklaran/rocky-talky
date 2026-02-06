import session from 'express-session'
import { RequestHandler } from 'express'
import connectPgSimple from 'connect-pg-simple'
import { getEnv } from '../env'

const PgSession = connectPgSimple(session)

/**
 * Express session middleware with Postgres-backed store.
 *
 * Session table is auto-created by connect-pg-simple on first use.
 * No Prisma migration needed — it manages its own DDL.
 */
export function createSessionMiddleware(): RequestHandler {
  const env = getEnv()

  return session({
    store: new PgSession({
      conString: env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Don't create session until something is stored
    name: 'basecamp.sid',
    cookie: {
      secure: env.NODE_ENV === 'production', // HTTPS only in prod
      httpOnly: true, // Not accessible via JS
      sameSite: 'lax', // CSRF protection — blocks cross-origin POST
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
}

// Extend express-session types so req.session.userId is typed
declare module 'express-session' {
  interface SessionData {
    userId: string
  }
}
