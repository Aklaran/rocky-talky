import { trpc } from '@/lib/trpc'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { SessionHeader } from './SessionHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { useAgentStream } from '@/lib/useAgentStream'
import { useEffect } from 'react'
import { toast } from 'sonner'

/**
 * SessionView — displays a single session with its messages and input.
 *
 * Handles:
 * - Fetching session data
 * - Sending messages and triggering AI streaming responses
 * - Real-time streaming UI with markdown rendering
 * - Loading and error states
 *
 * Flow:
 * 1. User types message → sendMessage mutation stores it
 * 2. On success → trigger sendAndStream to get AI response
 * 3. Stream updates UI in real-time
 * 4. On done → refetch session to show the saved message
 */
interface SessionViewProps {
  sessionId: string
}

export function SessionView({ sessionId }: SessionViewProps) {
  const utils = trpc.useUtils()

  const {
    data: session,
    isLoading,
    error,
  } = trpc.session.get.useQuery({ id: sessionId })

  const {
    streamingText,
    isStreaming,
    activeTools,
    error: streamError,
    sendAndStream,
  } = useAgentStream()

  const sendMessage = trpc.session.sendMessage.useMutation({
    onSuccess: async () => {
      // Refetch session to show the user message
      await utils.session.get.invalidate({ id: sessionId })
      // Refetch list to update preview/ordering
      await utils.session.list.invalidate()
      
      // Trigger AI streaming response
      try {
        await sendAndStream(sessionId)
        // After streaming completes, refetch to show the saved assistant message
        await utils.session.get.invalidate({ id: sessionId })
        await utils.session.list.invalidate()
      } catch (err) {
        console.error('Stream failed:', err)
      }
    },
  })

  // Show toast on stream error
  useEffect(() => {
    if (streamError) {
      toast.error('AI response failed', {
        description: streamError,
      })
    }
  }, [streamError])

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
      <SessionHeader session={session} />
      <MessageList 
        messages={session.messages}
        streamingContent={streamingText}
        isStreaming={isStreaming}
        activeTools={activeTools}
      />
      <MessageInput
        onSend={(content) =>
          sendMessage.mutate({ sessionId, content })
        }
        disabled={sendMessage.isPending || isStreaming}
      />
    </div>
  )
}
