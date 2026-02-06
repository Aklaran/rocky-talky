import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { trpc } from '@/lib/trpc'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const health = trpc.health.check.useQuery()
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()

  // Redirect authenticated users to chat
  if (!isLoading && user) {
    navigate({ to: '/chat' })
    return null
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">🏔️ Basecamp</h1>
        <p className="text-muted-foreground text-lg">
          Full-stack AI-native template. Clone, rename, build.
        </p>
      </div>

      {/* Auth state */}
      <div className="text-center space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking auth...</p>
        ) : (
          <Button
            variant="default"
            onClick={() => navigate({ to: '/login' })}
          >
            Sign In
          </Button>
        )}
      </div>

      {/* Health check */}
      <div className="text-sm text-muted-foreground">
        {health.isLoading && <span>Checking backend...</span>}
        {health.isError && (
          <span className="text-destructive">
            Backend offline: {health.error.message}
          </span>
        )}
        {health.data && (
          <span className="text-green-500">
            ✓ Backend connected — DB latency: {health.data.db.latencyMs}ms
          </span>
        )}
      </div>
    </div>
  )
}
