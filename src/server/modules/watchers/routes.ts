/**
 * Watchers API Routes — subscribe to entity changes
 *
 * Ties into the existing notifications module.
 * Use notifyWatchers() when an entity changes to
 * create notifications for all watchers except the actor.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { watchers } from './db/schema'
import { canAccessEntity } from '@/server/lib/entity-access'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

/** GET /api/watchers?entityType=x&entityId=y — list watchers + check if current user watches */
app.get('/', async (c) => {
  const entityType = c.req.query('entityType')
  const entityId = c.req.query('entityId')
  if (!entityType || !entityId) return c.json({ error: 'entityType and entityId required' }, 400)

  const userId = c.get('userId')
  // Gate: don't reveal who watches an entity the caller can't access (IDOR).
  if (!(await canAccessEntity(c.env, entityType, entityId, userId))) {
    return c.json({ error: 'Not found' }, 404)
  }
  const db = drizzle(c.env.DB)

  const rows = await db
    .select()
    .from(watchers)
    .where(and(eq(watchers.entityType, entityType), eq(watchers.entityId, entityId)))

  return c.json({
    watchers: rows,
    count: rows.length,
    isWatching: rows.some((w) => w.userId === userId),
  })
})

/** POST /api/watchers — watch an entity */
app.post(
  '/',
  zValidator('json', z.object({ entityType: z.string(), entityId: z.string() })),
  async (c) => {
    const { entityType, entityId } = c.req.valid('json')
    const userId = c.get('userId')
    // Gate: can't subscribe to (and get notified about) an inaccessible entity.
    if (!(await canAccessEntity(c.env, entityType, entityId, userId))) {
      return c.json({ error: 'Not found' }, 404)
    }
    const db = drizzle(c.env.DB)

    await db.insert(watchers).values({ entityType, entityId, userId }).onConflictDoNothing()
    return c.json({ success: true })
  }
)

/** DELETE /api/watchers — unwatch an entity */
app.delete(
  '/',
  zValidator('json', z.object({ entityType: z.string(), entityId: z.string() })),
  async (c) => {
    const { entityType, entityId } = c.req.valid('json')
    const userId = c.get('userId')
    const db = drizzle(c.env.DB)

    await db
      .delete(watchers)
      .where(
        and(
          eq(watchers.entityType, entityType),
          eq(watchers.entityId, entityId),
          eq(watchers.userId, userId)
        )
      )
    return c.json({ success: true })
  }
)

export default app

/**
 * Notify all watchers of an entity about an event.
 * Creates a notification for each watcher except the actor.
 * Call this from any module when an entity changes.
 */
export async function notifyWatchers(
  db: D1Database,
  entityType: string,
  entityId: string,
  actorId: string,
  message: string
) {
  const d = drizzle(db)
  const rows = await d
    .select({ userId: watchers.userId })
    .from(watchers)
    .where(and(eq(watchers.entityType, entityType), eq(watchers.entityId, entityId)))

  const watcherIds = rows.map((r) => r.userId).filter((id) => id !== actorId)
  if (watcherIds.length === 0) return

  // Insert notifications (uses the existing notifications table)
  const { userNotifications } = await import('@/server/modules/notifications/db/schema')
  const BATCH_SIZE = 10
  for (let i = 0; i < watcherIds.length; i += BATCH_SIZE) {
    const batch = watcherIds.slice(i, i + BATCH_SIZE)
    await d.insert(userNotifications).values(
      batch.map((userId) => ({
        userId,
        type: 'info' as const,
        title: message,
        message: `${entityType}/${entityId}`,
      }))
    )
  }
}
