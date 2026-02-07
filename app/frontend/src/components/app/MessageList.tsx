import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Bot, User, Loader2 } from 'lucide-react'
import type { MessageOutput } from '@shared/schemas/chat'

/**
 * Message list — displays conversation messages with auto-scroll.
 *
 * Design decisions:
 * - User messages right-aligned, assistant messages left-aligned
 * - System messages are subtle/centered (rarely shown in UI)
 * - Auto-scrolls to bottom on new messages and during streaming
 * - Role icons for visual distinction
 * - Streaming content shown as a live-updating assistant message
 */
interface MessageListProps {
  messages: MessageOutput[]
  /** Partially streamed AI response (shown as typing indicator) */
  streamingContent?: string
  /** Whether the AI is currently streaming */
  isStreaming?: boolean
}

export function MessageList({ messages, streamingContent, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change or streaming content updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  if (messages.length === 0 && !isStreaming) {
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
    <ScrollArea className="flex-1" data-testid="message-list">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Streaming AI response */}
        {isStreaming && (
          <StreamingMessage content={streamingContent || ''} />
        )}

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
      data-testid={isUser ? 'message-user' : 'message-assistant'}
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

/**
 * Streaming message — shows the AI response as it arrives.
 * Displays a typing indicator when content is empty (thinking).
 */
function StreamingMessage({ content }: { content: string }) {
  return (
    <div data-testid="message-streaming" className="flex gap-3 flex-row">
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bot className="h-4 w-4" />
      </div>

      {/* Message content */}
      <div className="max-w-[80%] rounded-lg px-4 py-2.5 bg-muted text-foreground">
        {content ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {content}
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-foreground/60 animate-pulse align-text-bottom" />
          </p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}
      </div>
    </div>
  )
}
