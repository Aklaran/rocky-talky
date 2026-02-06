import { z } from 'zod'

/**
 * Auth validation schemas — shared between frontend and backend.
 */

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address')
    .max(255, 'Email must be 255 characters or fewer'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or fewer'),
})

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>

/**
 * Auth response types — what the API returns.
 */
export interface AuthUser {
  id: string
  email: string
  createdAt: string
}

export interface AuthResponse {
  user: AuthUser
}

export interface AuthErrorResponse {
  error: string
  code?: string
}
