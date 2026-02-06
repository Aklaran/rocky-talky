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
import { Trash2 } from 'lucide-react'
import type { ConversationDetail } from '@shared/schemas/chat'

/**
 * Chat header — shows conversation title and actions (delete).
 */
interface ChatHeaderProps {
  conversation: ConversationDetail
}

export function ChatHeader({ conversation }: ChatHeaderProps) {
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const deleteConversation = trpc.chat.delete.useMutation({
    onSuccess: () => {
      utils.chat.list.invalidate()
      navigate({ to: '/chat' })
    },
  })

  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <h2 className="truncate text-base font-medium">
        {conversation.title || 'New conversation'}
      </h2>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" title="Delete conversation">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConversation.mutate({ id: conversation.id })}
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
