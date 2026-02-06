import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Bot, User } from 'lucide-react'
import type { MessageOutput } from '@shared/schemas/chat'

/**
 * Message list — displays conversation messages with auto-scroll.
 *
 * Design decisions:
 * - User messages right-aligned, assistant messages left-aligned
 * - System messages are subtle/centered (rarely shown in UI)
 * - Auto-scrolls to bottom on new messages
 * - Role icons for visual distinction
 */
interface MessageListProps {
  messages: MessageOutput[]
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Start a conversation</p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Type a message below to get started
          </p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}

function MessageBubble({ message }: { message: MessageOutput }) {
  if (message.role === 'system') {
    return (
      <div className="py-2 text-center text-xs text-muted-foreground italic">
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Message content */}
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-2.5',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </p>
      </div>
    </div>
  )
}
