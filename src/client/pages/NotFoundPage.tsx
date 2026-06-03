/**
 * NotFoundPage — shown for any unmatched route.
 *
 * Rendered both for public (unauthenticated) and dashboard (authed) catch-alls.
 * Keeps signed-in users inside the app shell via the dashboard route tree
 * instead of silently bouncing to the landing page.
 */
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useSession } from '@/client/lib/auth'
import { FileQuestion, ArrowLeft, Home } from 'lucide-react'

export function NotFoundPage() {
  const location = useLocation()
  const { data: session } = useSession()
  const isAuthed = !!session
  const homePath = isAuthed ? '/dashboard' : '/'
  const homeLabel = isAuthed ? 'Back to Dashboard' : 'Back home'

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <FileQuestion className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          We couldn't find anything at{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            {location.pathname}
          </code>
          . It may have moved, been deleted, or never existed.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link to={homePath}>
            <Home className="mr-2 h-4 w-4" />
            {homeLabel}
          </Link>
        </Button>
        {isAuthed && (
          <Button asChild variant="outline">
            <Link to="/dashboard/chat">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Start a new chat
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}

export default NotFoundPage
