import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Bot, User, Wrench } from 'lucide-react'
import type { MessageOutput } from '@shared/schemas/session'
import { MarkdownMessage } from './MarkdownMessage'
import { ToolCallIndicator } from './ToolCallIndicator'
import type { ToolCall } from '@/lib/useAgentStream'

/**
 * Message list — displays session messages with auto-scroll.
 *
 * Design decisions:
 * - User messages right-aligned, assistant messages left-aligned
 * - System messages are subtle/centered (rarely shown in UI)
 * - Tool messages shown with monospace font and distinct styling
 * - Auto-scrolls to bottom on new messages
 * - Role icons for visual distinction
 * - Supports streaming messages with markdown rendering
 */
interface MessageListProps {
  messages: MessageOutput[]
  streamingContent?: string
  isStreaming?: boolean
  activeTools?: ToolCall[]
}

export function MessageList({ 
  messages, 
  streamingContent, 
  isStreaming,
  activeTools = [],
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change or streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

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
    <ScrollArea className="flex-1" data-testid="message-list">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Streaming assistant message */}
        {isStreaming && streamingContent && (
          <div className="flex gap-3" data-testid="message-streaming">
            {/* Avatar */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bot className="h-4 w-4" />
            </div>

            {/* Streaming content */}
            <div className="max-w-[85%] md:max-w-[80%] rounded-lg px-4 py-2.5 bg-muted text-foreground">
              <MarkdownMessage content={streamingContent} isStreaming />
              <ToolCallIndicator tools={activeTools} />
            </div>
          </div>
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

  if (message.role === 'tool') {
    return (
      <div data-testid="message-tool" className="flex gap-3">
        {/* Tool icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600">
          <Wrench className="h-4 w-4" />
        </div>

        {/* Tool message content */}
        <div className="max-w-[85%] md:max-w-[80%] rounded-lg px-4 py-2.5 bg-muted/50 border border-orange-500/20">
          <div className="flex items-center gap-1.5 mb-1">
            <Wrench className="h-3 w-3 text-orange-600" />
            <span className="text-xs font-medium text-orange-600">Tool</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed font-mono text-muted-foreground">
            {message.content}
          </p>
        </div>
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
          'max-w-[85%] md:max-w-[80%] rounded-lg px-4 py-2.5',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <MarkdownMessage content={message.content} />
        )}
      </div>
    </div>
  )
}
