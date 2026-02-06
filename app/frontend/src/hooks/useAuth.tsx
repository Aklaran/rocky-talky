import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { AuthUser } from '@shared/schemas/auth'
import { apiGetMe, apiLogin, apiLogout, apiRegister, AuthApiError } from '@/lib/auth'

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  error: string | null
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true, // Start loading — check session on mount
    error: null,
  })

  // Check for existing session on mount
  useEffect(() => {
    apiGetMe()
      .then((user) => {
        setState({ user, isLoading: false, error: null })
      })
      .catch(() => {
        setState({ user: null, isLoading: false, error: null })
      })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const result = await apiLogin(email, password)
      setState({ user: result.user, isLoading: false, error: null })
    } catch (err) {
      const message =
        err instanceof AuthApiError ? err.message : 'Login failed'
      setState((prev) => ({ ...prev, isLoading: false, error: message }))
      throw err
    }
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const result = await apiRegister(email, password)
      setState({ user: result.user, isLoading: false, error: null })
    } catch (err) {
      const message =
        err instanceof AuthApiError ? err.message : 'Registration failed'
      setState((prev) => ({ ...prev, isLoading: false, error: message }))
      throw err
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setState({ user: null, isLoading: false, error: null })
    }
  }, [])

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, clearError }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
