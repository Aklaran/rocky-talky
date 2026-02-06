import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { ConversationList } from './ConversationList'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { LogOut, Plus } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import type { ReactNode } from 'react'

/**
 * Chat layout — sidebar with conversation list + main content area.
 *
 * This is the shell for all /chat routes. The active conversation
 * (or empty state) is rendered as children via the Outlet.
 */
export function ChatLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const createConversation = trpc.chat.create.useMutation({
    onSuccess: (data) => {
      utils.chat.list.invalidate()
      navigate({ to: '/chat/$conversationId', params: { conversationId: data.id } })
    },
  })

  const handleLogout = async () => {
    await logout()
    navigate({ to: '/' })
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="flex w-72 flex-col border-r bg-muted/30">
        {/* Sidebar header */}
        <div className="flex items-center justify-between p-4">
          <h1 className="text-lg font-semibold">🏔️ Basecamp</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => createConversation.mutate({})}
            disabled={createConversation.isPending}
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <Separator />

        {/* Conversation list */}
        <div className="flex-1 overflow-hidden">
          <ConversationList />
        </div>

        <Separator />

        {/* User footer */}
        <div className="flex items-center justify-between p-3">
          <span className="truncate text-sm text-muted-foreground">
            {user?.email}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {children}
      </div>
    </div>
  )
}
