/**
 * Favourites API Routes — pin/star any entity for quick access
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { favourites } from './db/schema'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

/** GET /api/favourites — list user's favourites */
app.get('/', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)
  const rows = await db
    .select()
    .from(favourites)
    .where(eq(favourites.userId, userId))
    .orderBy(favourites.position)
  return c.json({ favourites: rows })
})

/** POST /api/favourites — add a favourite */
app.post(
  '/',
  zValidator('json', z.object({ entityType: z.string(), entityId: z.string() })),
  async (c) => {
    const { entityType, entityId } = c.req.valid('json')
    const userId = c.get('userId')
    const db = drizzle(c.env.DB)
    await db.insert(favourites).values({ userId, entityType, entityId }).onConflictDoNothing()
    return c.json({ success: true })
  }
)

/** DELETE /api/favourites — remove a favourite */
app.delete(
  '/',
  zValidator('json', z.object({ entityType: z.string(), entityId: z.string() })),
  async (c) => {
    const { entityType, entityId } = c.req.valid('json')
    const userId = c.get('userId')
    const db = drizzle(c.env.DB)
    await db
      .delete(favourites)
      .where(
        and(
          eq(favourites.userId, userId),
          eq(favourites.entityType, entityType),
          eq(favourites.entityId, entityId)
        )
      )
    return c.json({ success: true })
  }
)

export default app
