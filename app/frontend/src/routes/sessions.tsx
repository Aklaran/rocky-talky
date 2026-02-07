import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SessionLayout } from '@/components/app/SessionLayout'

/**
 * /sessions layout route — wraps all session pages in the sidebar layout.
 * No auth guard — public access.
 */
export const Route = createFileRoute('/sessions')({
  component: SessionLayoutRoute,
})

function SessionLayoutRoute() {
  return (
    <SessionLayout>
      <Outlet />
    </SessionLayout>
  )
}
