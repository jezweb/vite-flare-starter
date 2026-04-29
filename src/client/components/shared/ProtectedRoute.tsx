import { useSession } from '@/client/lib/auth'
import { Navigate, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/ui/spinner'

interface ProtectedRouteProps {
  children: React.ReactNode
}

/**
 * Protected route wrapper.
 *
 * Redirects to sign-in if the user isn't authenticated, preserving the
 * intended destination in `?next=` so post-login they land back where
 * they were trying to go instead of on /dashboard by default.
 *
 * Shows a loader while the session is resolving.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { data: session, isPending } = useSession()
  const location = useLocation()

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Spinner className="size-12 text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    // Preserve the intended URL so sign-in can return the user to the
    // exact page they were trying to reach. URL-encode the path+search
    // defensively — the receiver validates it points under /dashboard.
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/sign-in?next=${next}`} replace />
  }

  return <>{children}</>
}
