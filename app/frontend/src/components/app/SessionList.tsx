import { useNavigate, useParams } from '@tanstack/react-router'
import { trpc } from '@/lib/trpc'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SessionStatus } from '@shared/schemas/session'

/**
 * Session list in the sidebar.
 * Highlights the active session, shows title, tags, preview, and status.
 */
interface SessionListProps {
  /** Called when a session is selected (used to close mobile sidebar) */
  onSelectSession?: () => void
}

export function SessionList({ onSelectSession }: SessionListProps = {}) {
  const navigate = useNavigate()
  // Get current sessionId from URL if we're on a session route
  const params = useParams({ strict: false }) as { sessionId?: string }
  const activeId = params.sessionId

  const { data: sessions, isLoading, error } = trpc.session.list.useQuery()

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load sessions
      </div>
    )
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No sessions yet</p>
        <p className="text-xs text-muted-foreground/70">
          Click + to start a new session
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full" data-testid="session-list">
      <div className="space-y-1 p-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            data-testid="session-item"
            onClick={() => {
              navigate({
                to: '/sessions/$sessionId',
                params: { sessionId: session.id },
              })
              onSelectSession?.()
            }}
            className={cn(
              'w-full rounded-md px-3 py-2.5 text-left transition-colors',
              'hover:bg-accent',
              activeId === session.id
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground',
            )}
          >
            {/* Title and status */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="truncate text-sm font-medium">
                {session.title || 'New session'}
              </div>
              <StatusDot status={session.status} />
            </div>

            {/* Tags */}
            {session.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {session.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-primary/10 text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Last message preview */}
            {session.lastMessage && (
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {session.lastMessage}
              </div>
            )}

            {/* Time and message count */}
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/70">
              <span>{formatRelativeTime(session.updatedAt)}</span>
              <span>{session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}</span>
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}

/**
 * Status dot indicator
 */
function StatusDot({ status }: { status: SessionStatus }) {
  const colors = {
    active: 'bg-green-500',
    completed: 'bg-gray-400',
    abandoned: 'bg-yellow-500',
  }

  return (
    <div
      className={cn('h-2 w-2 rounded-full shrink-0', colors[status])}
      title={status}
    />
  )
}

/**
 * Format a timestamp to relative time (e.g., "2h ago", "yesterday")
 */
function formatRelativeTime(timestamp: string): string {
  const now = new Date()
  const date = new Date(timestamp)
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`
  return `${Math.floor(diffDay / 365)}y ago`
}
