import { createAuthClient } from 'better-auth/react'

/**
 * Better-auth client for React
 *
 * Provides hooks and methods for authentication:
 * - useSession() - Get current session
 * - signIn() - Sign in with email/password
 * - signUp() - Create new account
 * - signOut() - End session
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env['VITE_API_URL'] || window.location.origin,
})

// Export commonly used hooks for convenience
export const { useSession, signIn, signUp, signOut } = authClient
