import { createMiddleware } from 'hono/factory'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import type { Env } from '../index'
import { createAuth } from '../modules/auth'
import * as schema from '@/server/db/schema'

/**
 * Auth middleware for protecting API routes
 *
 * Supports two authentication methods:
 * 1. Session cookies (via better-auth) - for browser/frontend access
 * 2. Bearer tokens (API tokens) - for external services like ElevenLabs agents
 *
 * Returns 401 Unauthorized if neither method is valid
 */

// Extend Hono context with user information
export type AuthContext = {
  Bindings: Env
  Variables: {
    userId: string
    user: {
      id: string
      email: string
      name: string
      image?: string | null
      role: 'user' | 'manager' | 'admin'
    }
    authMethod: 'session' | 'api-token' // Track which auth method was used
  }
}

/**
 * Hash a token using SHA-256
 * Used to securely store and compare API tokens
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Authenticate using Bearer token from Authorization header
 * Returns the user if valid, null otherwise
 */
async function authenticateWithBearerToken(
  authHeader: string,
  db: D1Database
): Promise<{ userId: string; user: { id: string; email: string; name: string; image?: string | null; role: 'user' | 'manager' | 'admin' } } | null> {
  // Extract token from "Bearer <token>" format
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return null

  // Hash the token for lookup
  const hashedToken = await hashToken(token)

  // Look up the token in the database
  const drizzleDb = drizzle(db, { schema })
  const apiToken = await drizzleDb.query.apiTokens.findFirst({
    where: eq(schema.apiTokens.token, hashedToken),
  })

  if (!apiToken) return null

  // Check if token has expired
  if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
    return null
  }

  // Get the user associated with this token
  const user = await drizzleDb.query.user.findFirst({
    where: eq(schema.user.id, apiToken.userId),
  })

  if (!user) return null

  // Update lastUsedAt timestamp (fire and forget)
  drizzleDb
    .update(schema.apiTokens)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.apiTokens.id, apiToken.id))
    .run()
    .catch(err => console.error('Failed to update lastUsedAt:', err))

  return {
    userId: user.id,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: (user.role as 'user' | 'manager' | 'admin') || 'user',
    },
  }
}

export const authMiddleware = createMiddleware<AuthContext>(async (c, next) => {
  try {
    // First, check for Bearer token authentication
    const authHeader = c.req.header('Authorization')
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      const tokenAuth = await authenticateWithBearerToken(authHeader, c.env.DB)
      if (tokenAuth) {
        c.set('userId', tokenAuth.userId)
        c.set('user', tokenAuth.user)
        c.set('authMethod', 'api-token')
        await next()
        return
      }
      // If Bearer token was provided but invalid, return 401
      return c.json({ error: 'Invalid API token' }, 401)
    }

    // Fall back to session authentication (cookies)
    const auth = createAuth(c.env.DB, {
      BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
      GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
      EMAIL_API_KEY: c.env.EMAIL_API_KEY,
      EMAIL_FROM: c.env.EMAIL_FROM,
    })

    // Get session from better-auth using the raw request
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    })

    // Check if session exists and is valid
    if (!session || !session.user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    // Get user role from database (session.user may not include custom fields)
    const drizzleDb = drizzle(c.env.DB, { schema })
    const dbUser = await drizzleDb.query.user.findFirst({
      where: eq(schema.user.id, session.user.id),
      columns: { role: true },
    })

    // Attach user to context for use in route handlers
    c.set('userId', session.user.id)
    c.set('user', {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
      role: (dbUser?.role as 'user' | 'manager' | 'admin') || 'user',
    })
    c.set('authMethod', 'session')

    await next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    return c.json({ error: 'Unauthorized' }, 401)
  }
})

// Export hashToken for use in API token creation
export { hashToken }
