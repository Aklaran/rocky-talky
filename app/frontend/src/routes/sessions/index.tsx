import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { MessageSquare, Menu, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/contexts/SidebarContext'
import { trpc } from '@/lib/trpc'

/**
 * /sessions (index) — shown when no session is selected.
 * Empty state prompting the user to start or select a session.
 * On mobile: hamburger menu + FAB for new session.
 */
export const Route = createFileRoute('/sessions/')({
  component: SessionsIndex,
})

function SessionsIndex() {
  const { toggleSidebar } = useSidebar()
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const createSession = trpc.session.create.useMutation({
    onSuccess: (data) => {
      utils.session.list.invalidate()
      navigate({ to: '/sessions/$sessionId', params: { sessionId: data.id } })
    },
  })

  return (
    <div className="relative flex flex-1 flex-col">
      {/* Mobile header with hamburger */}
      <div className="flex items-center border-b px-4 py-3 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          title="Open menu"
          className="min-h-[44px] min-w-[44px]"
          data-testid="toggle-sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="ml-2 text-lg font-semibold">🗻 Rocky Talky</h1>
      </div>

      {/* Empty state */}
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-lg text-muted-foreground">
            Select a session
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Or start a new one
          </p>
        </div>
      </div>

      {/* Mobile FAB - New Session */}
      <Button
        onClick={() => createSession.mutate({})}
        disabled={createSession.isPending}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg md:hidden"
        size="icon"
        title="New session"
        data-testid="new-session-fab"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  )
}
