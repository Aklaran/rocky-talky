import { trpc } from '@/lib/trpc'
import { useAIStream } from '@/hooks/useAIStream'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ChatHeader } from './ChatHeader'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * ChatView — displays a single conversation with its messages and input.
 *
 * Handles:
 * - Fetching conversation data
 * - Sending messages + triggering AI response stream
 * - Streaming display of AI responses
 * - Loading and error states
 *
 * Flow:
 * 1. User types message → sendMessage mutation stores it
 * 2. On success → trigger AI stream via SSE
 * 3. Stream chunks display progressively in the message list
 * 4. On stream complete → refetch conversation to get final saved message
 */
interface ChatViewProps {
  conversationId: string
}

export function ChatView({ conversationId }: ChatViewProps) {
  const utils = trpc.useUtils()
  const { streamingContent, isStreaming, error: streamError, generate } = useAIStream()

  const {
    data: conversation,
    isLoading,
    error,
  } = trpc.chat.get.useQuery({ id: conversationId })

  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      // Refetch conversation to show the user message
      utils.chat.get.invalidate({ id: conversationId })
      // Refetch list to update preview/ordering
      utils.chat.list.invalidate()
      // Start AI response stream
      generate(conversationId, {
        onComplete: () => {
          // Refetch to get the saved assistant message
          utils.chat.get.invalidate({ id: conversationId })
          utils.chat.list.invalidate()
        },
      })
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

  if (error || !conversation) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-destructive">Conversation not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been deleted
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <ChatHeader conversation={conversation} />
      <MessageList
        messages={conversation.messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />
      {streamError && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
          AI error: {streamError}
        </div>
      )}
      <MessageInput
        onSend={(content) =>
          sendMessage.mutate({ conversationId, content })
        }
        disabled={sendMessage.isPending || isStreaming}
      />
    </div>
  )
}
