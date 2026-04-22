import { useSession } from '@/client/lib/auth'
import { Navigate } from 'react-router-dom'

interface PublicOnlyRouteProps {
  children: React.ReactNode
}

/**
 * Public-only route wrapper
 *
 * Redirects to /dashboard if a user is already authenticated — keeps
 * returning users out of /sign-in and /sign-up, which would otherwise
 * render a confusing "create an account" form to someone already in.
 */
export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { data: session, isPending } = useSession()

  if (isPending) return null
  if (session) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
