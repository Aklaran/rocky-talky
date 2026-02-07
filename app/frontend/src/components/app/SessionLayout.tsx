import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { SessionList } from './SessionList'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Plus } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { SidebarContext } from '@/contexts/SidebarContext'
import type { ReactNode } from 'react'

/**
 * Session layout — sidebar with session list + main content area.
 *
 * This is the shell for all /sessions routes. The active session
 * (or empty state) is rendered as children via the Outlet.
 *
 * Mobile: Sidebar is hidden by default, shown as an overlay (Sheet) when toggled.
 * Desktop: Sidebar always visible alongside main content.
 */
export function SessionLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const createSession = trpc.session.create.useMutation({
    onSuccess: (data) => {
      utils.session.list.invalidate()
      navigate({ to: '/sessions/$sessionId', params: { sessionId: data.id } })
      // Close sidebar on mobile after creating session
      setSidebarOpen(false)
    },
  })

  const sidebarContent = (
    <>
      {/* Sidebar header */}
      <div className="flex items-center justify-between p-4">
        <h1 className="text-lg font-semibold">🗻 Rocky Talky</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => createSession.mutate({})}
          disabled={createSession.isPending}
          title="New session"
          data-testid="new-session"
          className="min-h-[44px] min-w-[44px]"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* Session list */}
      <div className="flex-1 overflow-hidden">
        <SessionList onSelectSession={() => setSidebarOpen(false)} />
      </div>
    </>
  )

  return (
    <SidebarContext.Provider value={{ toggleSidebar: () => setSidebarOpen(true) }}>
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
          {children}
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
