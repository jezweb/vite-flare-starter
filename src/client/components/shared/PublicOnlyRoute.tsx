import { useSession } from '@/client/lib/auth'
import { Navigate, useLocation } from 'react-router-dom'

interface PublicOnlyRouteProps {
  children: React.ReactNode
}

/**
 * Validate a `next` URL from the query string is safe to redirect to.
 * Only accept paths under `/dashboard` so an attacker can't craft a link
 * like `/sign-in?next=https://evil.com` and have us redirect off-origin.
 */
function resolveNextUrl(rawNext: string | null): string {
  if (!rawNext) return '/dashboard'
  try {
    const decoded = decodeURIComponent(rawNext)
    // Reject protocol-relative, absolute, or non-dashboard paths.
    if (!decoded.startsWith('/dashboard')) return '/dashboard'
    if (decoded.startsWith('//')) return '/dashboard'
    return decoded
  } catch {
    return '/dashboard'
  }
}

/**
 * Public-only route wrapper
 *
 * Redirects to the `?next=` destination if already authenticated, or to
 * `/dashboard` otherwise. Keeps returning users out of /sign-in and
 * /sign-up, which would otherwise render a confusing form to someone
 * already in.
 *
 * The `?next=` handling matters because ProtectedRoute sets it on its
 * own redirect to /sign-in. Without honouring it here, a brief session
 * blip (refetch race) would stamp the user onto /dashboard home even
 * though they were trying to reach /dashboard/chat/abc.
 */
export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { data: session, isPending } = useSession()
  const location = useLocation()

  if (isPending) return null
  if (session) {
    const next = new URLSearchParams(location.search).get('next')
    return <Navigate to={resolveNextUrl(next)} replace />
  }
  return <>{children}</>
}
