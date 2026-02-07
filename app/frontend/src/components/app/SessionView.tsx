import { trpc } from '@/lib/trpc'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { SessionHeader } from './SessionHeader'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * SessionView — displays a single session with its messages and input.
 *
 * Handles:
 * - Fetching session data
 * - Sending messages (no AI response yet — Phase 3)
 * - Loading and error states
 *
 * Flow:
 * 1. User types message → sendMessage mutation stores it
 * 2. On success → refetch session to show the new message
 * 3. No AI streaming yet — just persist user messages
 */
interface SessionViewProps {
  sessionId: string
  onToggleSidebar?: () => void
}

export function SessionView({ sessionId, onToggleSidebar }: SessionViewProps) {
  const utils = trpc.useUtils()

  const {
    data: session,
    isLoading,
    error,
  } = trpc.session.get.useQuery({ id: sessionId })

  const sendMessage = trpc.session.sendMessage.useMutation({
    onSuccess: () => {
      // Refetch session to show the user message
      utils.session.get.invalidate({ id: sessionId })
      // Refetch list to update preview/ordering
      utils.session.list.invalidate()
    },
  })

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="border-b p-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 space-y-4 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-16 w-64 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-destructive">Session not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been deleted
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <SessionHeader session={session} onToggleSidebar={onToggleSidebar} />
      <MessageList messages={session.messages} />
      <MessageInput
        onSend={(content) =>
          sendMessage.mutate({ sessionId, content })
        }
        disabled={sendMessage.isPending}
      />
    </div>
  )
}
