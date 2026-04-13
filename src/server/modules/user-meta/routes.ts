/**
 * User Metadata Routes
 *
 * Per-user key-value store. Stores arbitrary JSON data per key.
 * Useful for AI context, user preferences, feature state, etc.
 *
 * GET    /api/user-meta/:key     - Get a value
 * PUT    /api/user-meta/:key     - Set a value (upsert)
 * DELETE /api/user-meta/:key     - Delete a key
 * GET    /api/user-meta          - List all keys for the user
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { userMeta } from './db/schema'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)

/** Get a value by key */
app.get('/:key', async (c) => {
  const userId = c.get('userId')
  const key = c.req.param('key')
  const db = drizzle(c.env.DB)

  const row = await db
    .select({ value: userMeta.value, updatedAt: userMeta.updatedAt })
    .from(userMeta)
    .where(and(eq(userMeta.userId, userId), eq(userMeta.key, key)))
    .get()

  if (!row) return c.json({ error: 'Not found' }, 404)

  try {
    return c.json({ key, value: JSON.parse(row.value), updatedAt: row.updatedAt })
  } catch {
    return c.json({ key, value: row.value, updatedAt: row.updatedAt })
  }
})

/** Set a value (upsert) */
app.put('/:key', async (c) => {
  const userId = c.get('userId')
  const key = c.req.param('key')
  const body = await c.req.json()
  const value = JSON.stringify(body.value ?? body)
  const db = drizzle(c.env.DB)
  const now = new Date()

  // Upsert: try update, then insert if not found
  const existing = await db
    .select({ id: userMeta.id })
    .from(userMeta)
    .where(and(eq(userMeta.userId, userId), eq(userMeta.key, key)))
    .get()

  if (existing) {
    await db
      .update(userMeta)
      .set({ value, updatedAt: now })
      .where(eq(userMeta.id, existing.id))
  } else {
    await db.insert(userMeta).values({ userId, key, value, updatedAt: now })
  }

  return c.json({ key, success: true })
})

/** Delete a key */
app.delete('/:key', async (c) => {
  const userId = c.get('userId')
  const key = c.req.param('key')
  const db = drizzle(c.env.DB)

  await db
    .delete(userMeta)
    .where(and(eq(userMeta.userId, userId), eq(userMeta.key, key)))

  return c.json({ key, deleted: true })
})

/** List all keys for the user */
app.get('/', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)

  const rows = await db
    .select({ key: userMeta.key, value: userMeta.value, updatedAt: userMeta.updatedAt })
    .from(userMeta)
    .where(eq(userMeta.userId, userId))

  const items = rows.map((row) => {
    try {
      return { key: row.key, value: JSON.parse(row.value), updatedAt: row.updatedAt }
    } catch {
      return { key: row.key, value: row.value, updatedAt: row.updatedAt }
    }
  })

  return c.json({ items })
})

export default app
