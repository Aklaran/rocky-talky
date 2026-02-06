import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { ChatLayout } from '@/components/app/ChatLayout'
import { useAuth } from '@/hooks/useAuth'
import { useEffect } from 'react'

/**
 * /chat layout route — wraps all chat pages in the sidebar layout.
 *
 * Auth guard: redirects to /login if not authenticated.
 * Waits for auth check to complete before rendering.
 */
export const Route = createFileRoute('/chat')({
  component: ChatLayoutRoute,
})

function ChatLayoutRoute() {
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !user) {
      navigate({ to: '/login' })
    }
  }, [isLoading, user, navigate])

  // Show nothing while checking auth or redirecting
  if (isLoading || !user) {
    return null
  }

  return (
    <ChatLayout>
      <Outlet />
    </ChatLayout>
  )
}
