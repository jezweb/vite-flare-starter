/**
 * Recent Views API Routes — track recently viewed entities
 *
 * Auto-prunes to max 50 per user. Upserts on re-view (updates viewedAt).
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, sql } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { recentViews } from './db/schema'

const MAX_RECENT = 50

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

/** GET /api/recent — list user's recently viewed entities */
app.get('/', async (c) => {
  const userId = c.get('userId')
  const limit = Number(c.req.query('limit') || '20')
  const db = drizzle(c.env.DB)

  const rows = await db
    .select()
    .from(recentViews)
    .where(eq(recentViews.userId, userId))
    .orderBy(desc(recentViews.viewedAt))
    .limit(Math.min(limit, MAX_RECENT))

  return c.json({ recentViews: rows })
})

/** POST /api/recent — record a view (upsert + auto-prune) */
app.post(
  '/',
  zValidator('json', z.object({ entityType: z.string(), entityId: z.string() })),
  async (c) => {
    const { entityType, entityId } = c.req.valid('json')
    const userId = c.get('userId')
    const db = drizzle(c.env.DB)

    // Upsert: update viewedAt if exists, insert if not
    await db
      .insert(recentViews)
      .values({ userId, entityType, entityId })
      .onConflictDoUpdate({
        target: [recentViews.userId, recentViews.entityType, recentViews.entityId],
        set: { viewedAt: new Date() },
      })

    // Auto-prune: delete oldest entries beyond MAX_RECENT
    await db.run(sql`
      DELETE FROM recent_views
      WHERE user_id = ${userId}
      AND rowid NOT IN (
        SELECT rowid FROM recent_views
        WHERE user_id = ${userId}
        ORDER BY viewed_at DESC
        LIMIT ${MAX_RECENT}
      )
    `)

    return c.json({ success: true })
  }
)

export default app
