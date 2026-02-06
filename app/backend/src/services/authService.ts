import * as argon2 from 'argon2'
import { prisma } from '../lib/clients/prisma'
import logger from '@shared/util/logger'

/**
 * Auth service — handles user registration, login, and password operations.
 * Owns business logic; repositories handle raw data access.
 */

export interface RegisterInput {
  email: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

/**
 * Register a new user.
 * @throws Error if email already exists or hashing fails.
 */
export async function registerUser({ email, password }: RegisterInput) {
  // Check for existing user first (friendlier error than unique constraint violation)
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new AuthError('EMAIL_EXISTS', 'A user with this email already exists')
  }

  const passwordHash = await argon2.hash(password)

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
  })

  logger.info({ userId: user.id }, 'User registered')
  return user
}

/**
 * Verify credentials and return user if valid.
 * @throws AuthError if credentials are invalid.
 */
export async function loginUser({ email, password }: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    // Don't reveal whether the email exists
    throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
  }

  const valid = await argon2.verify(user.passwordHash, password)
  if (!valid) {
    throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
  }

  logger.info({ userId: user.id }, 'User logged in')
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  }
}

/**
 * Get user by ID (for session hydration in tRPC context).
 * Returns null if not found (session references deleted user).
 */
export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
  })
}

// =============================================================================
// Custom error class for auth-specific errors
// =============================================================================

export type AuthErrorCode = 'EMAIL_EXISTS' | 'INVALID_CREDENTIALS'

export class AuthError extends Error {
  code: AuthErrorCode

  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}
