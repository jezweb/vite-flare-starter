import { createAuthClient } from 'better-auth/react'
import {
  lastLoginMethodClient,
  magicLinkClient,
  adminClient,
} from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

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
  // magicLink/passkey/admin client actions are safe to register even when
  // the matching server plugin is env-disabled — the server just 404s the
  // endpoint. UI surfaces gate on /api/auth/config flags instead.
  plugins: [lastLoginMethodClient(), magicLinkClient(), passkeyClient(), adminClient()],
} satisfies AuthClientOptions as AuthClientOptions)

// Export commonly used hooks for convenience
export const { useSession, signIn, signUp, signOut } = authClient

/**
 * Read the `better-auth.last_used_login_method` cookie set by the
 * lastLoginMethod() server plugin after a successful sign-in. Returns
 * 'google' / 'email' / 'magic-link' / etc., or null on first visit.
 *
 * Used by SignInPage to surface a "Last used: Google" hint and let
 * returning users skip straight to their preferred provider.
 *
 * The action is registered via `lastLoginMethodClient()` in plugins
 * above. Cast through `unknown` because the AuthClientOptions cast in
 * the createAuthClient call swallows plugin-action type inference.
 */
export function getLastUsedLoginMethod(): string | null {
  const client = authClient as unknown as {
    getLastUsedLoginMethod?: () => string | null
  }
  return client.getLastUsedLoginMethod?.() ?? null
}

/**
 * Typed wrappers for plugin actions the AuthClientOptions cast swallows
 * (same pattern as getLastUsedLoginMethod). Server availability is
 * env-gated — the UI should check /api/auth/config before offering these.
 */
export async function signInMagicLink(email: string, callbackURL: string): Promise<void> {
  const client = authClient as unknown as {
    signIn: {
      magicLink: (args: { email: string; callbackURL: string }) => Promise<{
        error?: { message?: string } | null
      }>
    }
  }
  const { error } = await client.signIn.magicLink({ email, callbackURL })
  if (error) throw new Error(error.message ?? 'Failed to send magic link')
}

export async function signInPasskey(): Promise<void> {
  const client = authClient as unknown as {
    signIn: {
      passkey: () => Promise<{ error?: { message?: string } | null } | undefined>
    }
  }
  const result = await client.signIn.passkey()
  if (result?.error) throw new Error(result.error.message ?? 'Passkey sign-in failed')
}

/** Register a new passkey for the signed-in user (Settings → Security). */
export async function addPasskey(name?: string): Promise<void> {
  const client = authClient as unknown as {
    passkey: {
      addPasskey: (args?: { name?: string }) => Promise<
        { error?: { message?: string } | null } | undefined
      >
    }
  }
  const result = await client.passkey.addPasskey(name ? { name } : undefined)
  if (result?.error) throw new Error(result.error.message ?? 'Failed to add passkey')
}

interface AdminActionResult {
  error?: { message?: string } | null
}

/**
 * better-auth admin plugin actions (ban / unban / impersonate). All
 * role-gated server-side to `user.role === 'admin'` — the same role
 * ADMIN_EMAILS promotes.
 */
export const adminActions = {
  async banUser(userId: string, banReason?: string): Promise<void> {
    const client = authClient as unknown as {
      admin: { banUser: (a: { userId: string; banReason?: string }) => Promise<AdminActionResult> }
    }
    const { error } = await client.admin.banUser({ userId, ...(banReason && { banReason }) })
    if (error) throw new Error(error.message ?? 'Failed to ban user')
  },
  async unbanUser(userId: string): Promise<void> {
    const client = authClient as unknown as {
      admin: { unbanUser: (a: { userId: string }) => Promise<AdminActionResult> }
    }
    const { error } = await client.admin.unbanUser({ userId })
    if (error) throw new Error(error.message ?? 'Failed to unban user')
  },
  /** Swaps the current session for a 1h session AS the target user (stamped impersonatedBy). */
  async impersonateUser(userId: string): Promise<void> {
    const client = authClient as unknown as {
      admin: { impersonateUser: (a: { userId: string }) => Promise<AdminActionResult> }
    }
    const { error } = await client.admin.impersonateUser({ userId })
    if (error) throw new Error(error.message ?? 'Failed to impersonate user')
  },
  async stopImpersonating(): Promise<void> {
    const client = authClient as unknown as {
      admin: { stopImpersonating: () => Promise<AdminActionResult> }
    }
    const { error } = await client.admin.stopImpersonating()
    if (error) throw new Error(error.message ?? 'Failed to stop impersonating')
  },
}
