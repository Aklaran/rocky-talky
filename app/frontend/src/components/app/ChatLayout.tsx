import { useState, cloneElement, isValidElement } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { ConversationList } from './ConversationList'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { LogOut, Plus } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import type { ReactNode } from 'react'

/**
 * Chat layout — sidebar with conversation list + main content area.
 *
 * This is the shell for all /chat routes. The active conversation
 * (or empty state) is rendered as children via the Outlet.
 *
 * Mobile: Sidebar is hidden by default, shown as an overlay (Sheet) when toggled.
 * Desktop: Sidebar always visible alongside main content.
 */
export function ChatLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const createConversation = trpc.chat.create.useMutation({
    onSuccess: (data) => {
      utils.chat.list.invalidate()
      navigate({ to: '/chat/$conversationId', params: { conversationId: data.id } })
      // Close sidebar on mobile after creating conversation
      setSidebarOpen(false)
    },
  })

  const handleLogout = async () => {
    await logout()
    navigate({ to: '/' })
  }

  const sidebarContent = (
    <>
      {/* Sidebar header */}
      <div className="flex items-center justify-between p-4">
        <h1 className="text-lg font-semibold">🏔️ Basecamp</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => createConversation.mutate({})}
          disabled={createConversation.isPending}
          title="New conversation"
          data-testid="new-conversation"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* Conversation list */}
      <div className="flex-1 overflow-hidden">
        <ConversationList onSelectConversation={() => setSidebarOpen(false)} />
      </div>

      <Separator />

      {/* User footer */}
      <div className="flex items-center justify-between p-3">
        <span data-testid="user-email" className="truncate text-sm text-muted-foreground">
          {user?.email}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          title="Sign out"
          data-testid="sign-out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen">
      {/* Desktop Sidebar - Always visible on md+ */}
      <div data-testid="sidebar" className="hidden md:flex w-72 flex-col border-r bg-muted/30">
        {sidebarContent}
      </div>

      {/* Mobile Sidebar - Sheet overlay */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Pass sidebar toggle function to children */}
        {isValidElement(children)
          ? cloneElement(children, { onToggleSidebar: () => setSidebarOpen(true) } as any)
          : children}
      </div>
    </div>
  )
}
