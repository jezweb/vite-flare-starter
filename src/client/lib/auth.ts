import { createAuthClient } from 'better-auth/react'

/**
 * Better-auth client for React
 *
 * Provides hooks and methods for authentication:
 * - useSession() - Get current session
 * - signIn() - Sign in with email/password
 * - signUp() - Create new account
 * - signOut() - End session
 *
 * ## sessionOptions.refetchOnWindowFocus: false
 *
 * better-auth refetches the session every time the browser tab regains focus
 * by default. In practice, if that refetch briefly returns null (network blip,
 * cookie tip, 5xx, cold D1), `ProtectedRoute` redirects to /sign-in and
 * `PublicOnlyRoute` then redirects to /dashboard home — so the user lands on
 * a completely different page without clicking anything. Disabling
 * focus-refetch removes the race entirely. Sessions still refresh on initial
 * mount, storage events (logout in another tab), and online events.
 *
 * `sessionOptions` is a runtime option (see better-auth/dist/client/session-refresh.mjs
 * line 23) but isn't in the published .d.ts yet — hence the cast.
 */
type AuthClientOptions = Parameters<typeof createAuthClient>[0] & {
  sessionOptions?: {
    refetchOnWindowFocus?: boolean
    refetchInterval?: number
    refetchWhenOffline?: boolean
  }
}

export const authClient = createAuthClient({
  baseURL: import.meta.env['VITE_API_URL'] || window.location.origin,
  sessionOptions: { refetchOnWindowFocus: false },
} satisfies AuthClientOptions as AuthClientOptions)

// Export commonly used hooks for convenience
export const { useSession, signIn, signUp, signOut } = authClient
