import { useNavigate } from '@tanstack/react-router'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Trash2, Menu } from 'lucide-react'
import { useSidebar } from '@/contexts/SidebarContext'
import type { SessionDetail } from '@shared/schemas/session'

/**
 * Session header — shows session title, tags, and actions (delete).
 * On mobile: includes hamburger menu to toggle sidebar.
 */
interface SessionHeaderProps {
  session: SessionDetail
}

export function SessionHeader({ session }: SessionHeaderProps) {
  const { toggleSidebar } = useSidebar()
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const deleteSession = trpc.session.delete.useMutation({
    onSuccess: () => {
      utils.session.list.invalidate()
      navigate({ to: '/sessions' })
    },
  })

  return (
    <div data-testid="session-header" className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Hamburger menu - only visible on mobile */}
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            title="Open menu"
            className="md:hidden min-h-[44px] min-w-[44px] shrink-0"
            data-testid="toggle-sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
        
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <h2 className="truncate text-base font-medium">
            {session.title || 'New session'}
          </h2>
          
          {/* Tags */}
          {session.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {session.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-primary/10 text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            title="Delete session" 
            data-testid="delete-session"
            className="min-h-[44px] min-w-[44px] shrink-0"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this session and all its messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSession.mutate({ id: session.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
