import type { AuthUser } from '@shared/schemas/auth'

/**
 * Auth API client — calls the Express REST auth endpoints.
 * These are NOT tRPC — they're standard REST because auth
 * needs direct cookie/session control.
 */

interface AuthResult {
  user: AuthUser
}

interface ValidationIssue {
  field: string
  message: string
}

interface ApiErrorBody {
  error: string
  code?: string
  issues?: ValidationIssue[]
}

export class AuthApiError extends Error {
  status: number
  code?: string
  issues?: ValidationIssue[]

  constructor(status: number, data: ApiErrorBody) {
    super(data.error)
    this.name = 'AuthApiError'
    this.status = status
    this.code = data.code
    this.issues = data.issues
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json()
  if (!res.ok) {
    throw new AuthApiError(res.status, data)
  }
  return data as T
}

export async function apiRegister(email: string, password: string): Promise<AuthResult> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handleResponse<AuthResult>(res)
}

export async function apiLogin(email: string, password: string): Promise<AuthResult> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handleResponse<AuthResult>(res)
}

export async function apiLogout(): Promise<void> {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
  })
  if (!res.ok) {
    throw new AuthApiError(res.status, await res.json())
  }
}

export async function apiGetMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me')
  const data = await res.json()
  if (!res.ok) {
    throw new AuthApiError(res.status, data)
  }
  return data.user
}
