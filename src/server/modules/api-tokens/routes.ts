import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc } from 'drizzle-orm'
import { apiTokens } from './db/schema'
import { authMiddleware, hashToken, type AuthContext } from '@/server/middleware/auth'
import { createApiTokenSchema } from '@/shared/schemas/api-token.schema'
import * as schema from '@/server/db/schema'

/**
 * Default token prefix
 *
 * ⚠️  SECURITY: Change this for production deployments!
 *
 * This prefix appears in API tokens (e.g., "vfs_abc123...") and can identify
 * your site as using Vite Flare Starter. Override with TOKEN_PREFIX env var.
 *
 * Set in Cloudflare: npx wrangler secret put TOKEN_PREFIX
 * Example: "myapp_" (3-4 chars + underscore)
 */
const DEFAULT_TOKEN_PREFIX = 'vfs_'

// Create Hono app for API token routes with auth context
const app = new Hono<AuthContext>()

// Apply auth middleware to all API token routes
// Note: These routes require session auth only, not API token auth
// Users must be logged in via the web UI to manage their API tokens
app.use('/*', authMiddleware)

/**
 * Generate a secure random token
 * Format: <prefix>_<random-base64-url-safe-string>
 *
 * @param prefix - Token prefix from env var or default
 */
function generateToken(prefix: string): string {
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  // Convert to base64url (URL-safe base64)
  const base64 = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  return `${prefix}${base64}`
}

/**
 * Parse scopes from comma-separated string to array
 */
function parseScopes(scopesStr: string): string[] {
  if (!scopesStr) return []
  return scopesStr.split(',').filter(Boolean)
}

/**
 * GET /api/api-tokens
 * List all API tokens for the authenticated user
 * Does NOT return the actual token values (they're hashed)
 */
app.get('/', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  const tokens = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenPrefix: apiTokens.tokenPrefix,
      scopes: apiTokens.scopes,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))

  // Convert Date objects to timestamps for JSON serialization
  const formattedTokens = tokens.map(token => ({
    ...token,
    scopes: parseScopes(token.scopes),
    lastUsedAt: token.lastUsedAt?.getTime() ?? null,
    expiresAt: token.expiresAt?.getTime() ?? null,
    createdAt: token.createdAt.getTime(),
  }))

  return c.json({ tokens: formattedTokens })
})

/**
 * POST /api/api-tokens
 * Create a new API token
 * Returns the raw token value (only shown once!)
 */
app.post('/', zValidator('json', createApiTokenSchema), async (c) => {
  // Only allow session-based auth for token management
  const authMethod = c.get('authMethod')
  if (authMethod !== 'session') {
    return c.json({ error: 'API tokens can only be managed via web session' }, 403)
  }

  const userId = c.get('userId')
  const input = c.req.valid('json')
  const db = drizzle(c.env.DB, { schema })

  // Get token prefix from env or use default
  const tokenPrefix = c.env.TOKEN_PREFIX || DEFAULT_TOKEN_PREFIX

  // Generate the raw token
  const rawToken = generateToken(tokenPrefix)

  // Hash it for storage
  const hashedToken = await hashToken(rawToken)

  // Get the prefix for display (first 12 chars)
  const displayPrefix = rawToken.substring(0, 12) + '...'

  // Convert scopes array to comma-separated string for storage
  const scopesStr = input.scopes.join(',')

  // Create the token record
  const newToken = await db
    .insert(apiTokens)
    .values({
      userId,
      name: input.name,
      token: hashedToken,
      tokenPrefix: displayPrefix,
      scopes: scopesStr,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    })
    .returning()
    .get()

  // Return the response with the raw token (only shown once!)
  return c.json({
    token: {
      id: newToken.id,
      name: newToken.name,
      tokenPrefix: newToken.tokenPrefix,
      scopes: input.scopes,
      rawToken, // This is only returned on creation!
      expiresAt: newToken.expiresAt?.getTime() ?? null,
      createdAt: newToken.createdAt.getTime(),
    },
  }, 201)
})

/**
 * DELETE /api/api-tokens/:id
 * Delete an API token
 */
app.delete('/:id', async (c) => {
  // Only allow session-based auth for token management
  const authMethod = c.get('authMethod')
  if (authMethod !== 'session') {
    return c.json({ error: 'API tokens can only be managed via web session' }, 403)
  }

  const userId = c.get('userId')
  const tokenId = c.req.param('id')
  const db = drizzle(c.env.DB, { schema })

  // First check if token exists and belongs to user
  const existingToken = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
    .get()

  if (!existingToken) {
    return c.json({ error: 'API token not found' }, 404)
  }

  // Delete the token
  await db.delete(apiTokens).where(eq(apiTokens.id, tokenId))

  return c.json({ success: true })
})

export default app
