import { useNavigate, useParams } from '@tanstack/react-router'
import { trpc } from '@/lib/trpc'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Conversation list in the sidebar.
 * Highlights the active conversation, shows title + preview.
 */
export function ConversationList() {
  const navigate = useNavigate()
  // Get current conversationId from URL if we're on a conversation route
  const params = useParams({ strict: false }) as { conversationId?: string }
  const activeId = params.conversationId

  const { data: conversations, isLoading, error } = trpc.chat.list.useQuery()

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load conversations
      </div>
    )
  }

  if (!conversations || conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No conversations yet</p>
        <p className="text-xs text-muted-foreground/70">
          Click + to start a new chat
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full" data-testid="conversation-list">
      <div className="space-y-1 p-2">
        {conversations.map((convo) => (
          <button
            key={convo.id}
            data-testid="conversation-item"
            onClick={() =>
              navigate({
                to: '/chat/$conversationId',
                params: { conversationId: convo.id },
              })
            }
            className={cn(
              'w-full rounded-md px-3 py-2.5 text-left transition-colors',
              'hover:bg-accent',
              activeId === convo.id
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground',
            )}
          >
            <div className="truncate text-sm font-medium">
              {convo.title || 'New conversation'}
            </div>
            {convo.lastMessage && (
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {convo.lastMessage}
              </div>
            )}
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}
