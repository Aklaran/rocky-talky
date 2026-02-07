import { Router, Request, Response } from 'express'
import { registerSchema, loginSchema } from '@shared/schemas/auth'
import { registerUser, loginUser, getUserById, AuthError } from '../services/authService'
import logger from '@shared/util/logger'

const authRouter: Router = Router()

/**
 * POST /api/auth/register
 * Create a new user account and log them in.
 */
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      })
      return
    }

    const user = await registerUser(parsed.data)

    // Regenerate session to prevent session fixation, then log in
    req.session.regenerate((regenerateErr) => {
      if (regenerateErr) {
        logger.error({ err: regenerateErr }, 'Session regeneration failed after register')
        res.status(500).json({ error: 'Registration succeeded but session creation failed' })
        return
      }
      req.session.userId = user.id
      req.session.save((saveErr) => {
        if (saveErr) {
          logger.error({ err: saveErr }, 'Session save failed after register')
          res.status(500).json({ error: 'Registration succeeded but session creation failed' })
          return
        }
        res.status(201).json({ user })
      })
    })
  } catch (err) {
    if (err instanceof AuthError && err.code === 'EMAIL_EXISTS') {
      res.status(409).json({ error: err.message, code: err.code })
      return
    }
    logger.error({ err }, 'Registration failed')
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/auth/login
 * Verify credentials and create a session.
 */
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      })
      return
    }

    const user = await loginUser(parsed.data)

    // Regenerate session to prevent session fixation, then log in
    req.session.regenerate((regenerateErr) => {
      if (regenerateErr) {
        logger.error({ err: regenerateErr }, 'Session regeneration failed after login')
        res.status(500).json({ error: 'Login succeeded but session creation failed' })
        return
      }
      req.session.userId = user.id
      req.session.save((saveErr) => {
        if (saveErr) {
          logger.error({ err: saveErr }, 'Session save failed after login')
          res.status(500).json({ error: 'Login succeeded but session creation failed' })
          return
        }
        res.status(200).json({ user })
      })
    })
  } catch (err) {
    if (err instanceof AuthError && err.code === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: err.message, code: err.code })
      return
    }
    logger.error({ err }, 'Login failed')
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/auth/logout
 * Destroy session and clear cookie.
 */
authRouter.post('/logout', (req: Request, res: Response): void => {
  req.session.destroy((err) => {
    if (err) {
      logger.error({ err }, 'Session destroy failed')
      res.status(500).json({ error: 'Logout failed' })
      return
    }
    res.clearCookie('basecamp.sid')
    res.status(200).json({ success: true })
  })
})

/**
 * GET /api/auth/me
 * Return the current user from session, or null if not authenticated.
 * Used by the frontend to check auth state on load.
 */
authRouter.get('/me', async (req: Request, res: Response): Promise<void> => {
  if (!req.session.userId) {
    res.status(200).json({ user: null })
    return
  }

  try {
    const user = await getUserById(req.session.userId)
    if (!user) {
      // Session references a deleted user — clear it
      req.session.destroy(() => {})
      res.clearCookie('basecamp.sid')
      res.status(200).json({ user: null })
      return
    }
    res.status(200).json({ user })
  } catch (err) {
    logger.error({ err }, 'Failed to fetch user from session')
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default authRouter
