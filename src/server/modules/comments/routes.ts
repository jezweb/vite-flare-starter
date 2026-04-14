/**
 * Comments API Routes — polymorphic comments for any entity
 *
 * Supports threaded replies, soft delete, @mention parsing.
 * Attach to any entity using entityType + entityId.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { comments } from './db/schema'
import { whereNotDeleted, softDeleteValues } from '@/server/lib/soft-delete'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

/** GET /api/comments?entityType=x&entityId=y — list comments for an entity */
app.get('/', async (c) => {
  const entityType = c.req.query('entityType')
  const entityId = c.req.query('entityId')
  if (!entityType || !entityId) return c.json({ error: 'entityType and entityId required' }, 400)

  const db = drizzle(c.env.DB)
  const rows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.entityType, entityType), eq(comments.entityId, entityId), whereNotDeleted(comments)))
    .orderBy(comments.createdAt)

  return c.json({ comments: rows })
})

/** POST /api/comments — create a comment */
app.post(
  '/',
  zValidator('json', z.object({
    entityType: z.string(),
    entityId: z.string(),
    body: z.string().min(1).max(10000),
    parentId: z.string().optional(),
  })),
  async (c) => {
    const input = c.req.valid('json')
    const userId = c.get('userId')
    const db = drizzle(c.env.DB)

    const [comment] = await db.insert(comments).values({
      ...input,
      userId,
      parentId: input.parentId || null,
    }).returning()

    return c.json({ comment }, 201)
  }
)

/** PATCH /api/comments/:id — edit own comment */
app.patch(
  '/:id',
  zValidator('json', z.object({ body: z.string().min(1).max(10000) })),
  async (c) => {
    const id = c.req.param('id')
    const userId = c.get('userId')
    const { body } = c.req.valid('json')
    const db = drizzle(c.env.DB)

    await db.update(comments)
      .set({ body, updatedAt: new Date() })
      .where(and(eq(comments.id, id), eq(comments.userId, userId)))

    return c.json({ success: true })
  }
)

/** DELETE /api/comments/:id — soft delete own comment */
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)

  await db.update(comments)
    .set(softDeleteValues())
    .where(and(eq(comments.id, id), eq(comments.userId, userId)))

  return c.json({ success: true })
})

export default app
