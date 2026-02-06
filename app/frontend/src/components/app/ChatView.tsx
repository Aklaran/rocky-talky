import { trpc } from '@/lib/trpc'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ChatHeader } from './ChatHeader'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * ChatView — displays a single conversation with its messages and input.
 *
 * Handles:
 * - Fetching conversation data
 * - Sending messages (optimistic UI updates)
 * - Loading and error states
 */
interface ChatViewProps {
  conversationId: string
}

export function ChatView({ conversationId }: ChatViewProps) {
  const utils = trpc.useUtils()

  const {
    data: conversation,
    isLoading,
    error,
  } = trpc.chat.get.useQuery({ id: conversationId })

  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      // Refetch conversation to get the new message
      utils.chat.get.invalidate({ id: conversationId })
      // Refetch list to update preview/ordering
      utils.chat.list.invalidate()
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
      <MessageList messages={conversation.messages} />
      <MessageInput
        onSend={(content) =>
          sendMessage.mutate({ conversationId, content })
        }
        disabled={sendMessage.isPending}
      />
    </div>
  )
}
