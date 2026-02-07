import { createFileRoute } from '@tanstack/react-router'
import { SessionView } from '@/components/app/SessionView'

/**
 * /sessions/$sessionId — displays a specific session.
 * The sessionId param is extracted from the URL.
 */
export const Route = createFileRoute('/sessions/$sessionId')({
  component: SessionRoute,
})

function SessionRoute() {
  const { sessionId } = Route.useParams()
  return <SessionView sessionId={sessionId} />
}
