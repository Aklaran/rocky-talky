import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  // Redirect directly to sessions
  return <Navigate to="/sessions" />
}
