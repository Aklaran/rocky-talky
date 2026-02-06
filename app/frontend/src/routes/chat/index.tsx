import { createFileRoute } from '@tanstack/react-router'
import { MessageSquare } from 'lucide-react'

/**
 * /chat (index) — shown when no conversation is selected.
 * Empty state prompting the user to start or select a conversation.
 */
export const Route = createFileRoute('/chat/')({
  component: ChatIndex,
})

function ChatIndex() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
        <p className="mt-4 text-lg text-muted-foreground">
          Select a conversation
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Or start a new one with the + button
        </p>
      </div>
    </div>
  )
}
