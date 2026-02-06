import { createFileRoute } from '@tanstack/react-router'
import { ChatView } from '@/components/app/ChatView'

/**
 * /chat/$conversationId — displays a specific conversation.
 * The conversationId param is extracted from the URL.
 */
export const Route = createFileRoute('/chat/$conversationId')({
  component: ChatConversationRoute,
})

function ChatConversationRoute() {
  const { conversationId } = Route.useParams()
  return <ChatView conversationId={conversationId} />
}
