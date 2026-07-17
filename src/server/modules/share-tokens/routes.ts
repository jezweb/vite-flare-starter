/**
 * Share Tokens API (#62(4))
 *
 * Authenticated management (mounted at /api/share-tokens):
 *   POST   /            — mint a link (raw token returned ONCE)
 *   GET    /?entityType=&entityId= — list the caller's links (no raw tokens)
 *   DELETE /:id         — revoke (soft — sets revokedAt)
 *
 * Public resolution (mounted at /api/share, NO auth):
 *   GET /:token         — resolve to the shared payload, or uniform 404
 *
 * Management is always creator-scoped, even in shared tenancy: a link
 * grants public access, so only the person who minted it can revoke or
 * enumerate it — sharing records with the team doesn't mean sharing
 * control of public exposure.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, sql } from 'drizzle-orm'
import { authMiddleware, hashToken, type AuthContext } from '@/server/middleware/auth'
import { shareTokens } from './db/schema'
import { shareResolvers } from './resolvers'

const now = () => Math.floor(Date.now() / 1000)

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ─── Authenticated management ─────────────────────────────────────

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const CreateSchema = z.object({
  entityType: z.string().refine((t) => t in shareResolvers, 'No share resolver for this type'),
  entityId: z.string().min(1).max(128),
  /** Days until expiry; null = never. Defaults to 30 — links shouldn't live forever by accident. */
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
})

app.post('/', zValidator('json', CreateSchema), async (c) => {
  const userId = c.get('userId')
  const { entityType, entityId, expiresInDays = 30 } = c.req.valid('json')

  const resolver = shareResolvers[entityType]!
  if (!(await resolver.canShare(c.env, entityId, userId))) {
    return c.json({ error: 'Not found' }, 404)
  }

  const raw = randomToken()
  const db = drizzle(c.env.DB)
  const id = crypto.randomUUID()
  const expiresAt = expiresInDays === null ? null : now() + expiresInDays * 86_400
  await db.insert(shareTokens).values({
    id,
    userId,
    entityType,
    entityId,
    tokenHash: await hashToken(raw),
    expiresAt,
  })
  return c.json(
    {
      id,
      token: raw, // shown once — only the hash is stored
      url: `/share/${raw}`,
      entityType,
      entityId,
      expiresAt,
    },
    201
  )
})

const ListSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
})

app.get('/', zValidator('query', ListSchema), async (c) => {
  const userId = c.get('userId')
  const { entityType, entityId } = c.req.valid('query')
  const db = drizzle(c.env.DB)
  const conditions = [eq(shareTokens.userId, userId)]
  if (entityType) conditions.push(eq(shareTokens.entityType, entityType))
  if (entityId) conditions.push(eq(shareTokens.entityId, entityId))
  const rows = await db
    .select({
      id: shareTokens.id,
      entityType: shareTokens.entityType,
      entityId: shareTokens.entityId,
      expiresAt: shareTokens.expiresAt,
      revokedAt: shareTokens.revokedAt,
      accessCount: shareTokens.accessCount,
      lastAccessedAt: shareTokens.lastAccessedAt,
      createdAt: shareTokens.createdAt,
    })
    .from(shareTokens)
    .where(and(...conditions))
    .orderBy(desc(shareTokens.createdAt))
    .limit(100)
  return c.json({ tokens: rows })
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const [existing] = await db
    .select({ id: shareTokens.id })
    .from(shareTokens)
    .where(and(eq(shareTokens.id, id), eq(shareTokens.userId, userId)))
    .limit(1)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db
    .update(shareTokens)
    .set({ revokedAt: now() })
    .where(and(eq(shareTokens.id, id), eq(shareTokens.userId, userId)))
  return c.json({ revoked: true })
})

export default app

// ─── Public resolution (no auth) ──────────────────────────────────

export const publicShareRoutes = new Hono<{ Bindings: { DB: D1Database } }>()

publicShareRoutes.get('/:token', async (c) => {
  const raw = c.req.param('token')
  // Cheap shape gate before touching the DB (64 hex chars).
  if (!/^[0-9a-f]{64}$/.test(raw)) return c.json({ error: 'Not found' }, 404)

  const db = drizzle(c.env.DB)
  const [row] = await db
    .select()
    .from(shareTokens)
    .where(eq(shareTokens.tokenHash, await hashToken(raw)))
    .limit(1)

  // Uniform 404 — unknown, revoked, and expired are indistinguishable.
  if (!row || row.revokedAt || (row.expiresAt !== null && row.expiresAt < now())) {
    return c.json({ error: 'Not found' }, 404)
  }

  const resolver = shareResolvers[row.entityType]
  const payload = resolver ? await resolver.loadPublic(c.env, row.entityId) : null
  if (!payload) return c.json({ error: 'Not found' }, 404)

  await db
    .update(shareTokens)
    .set({ accessCount: sql`${shareTokens.accessCount} + 1`, lastAccessedAt: now() })
    .where(eq(shareTokens.id, row.id))

  return c.json({
    entityType: row.entityType,
    sharedAt: row.createdAt,
    expiresAt: row.expiresAt,
    payload,
  })
})
