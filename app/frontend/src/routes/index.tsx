import { createFileRoute } from '@tanstack/react-router'
import { trpc } from '@/lib/trpc'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const health = trpc.health.check.useQuery()

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">🏔️ Basecamp</h1>
        <p className="text-muted-foreground text-lg">
          Full-stack AI-native template. Clone, rename, build.
        </p>
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
    </div>
  )
}
