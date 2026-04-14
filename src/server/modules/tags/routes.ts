/**
 * Tags API Routes — polymorphic labels for any entity
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { tags, entityTags } from './db/schema'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

/** GET /api/tags?entityType=x — list tags for a domain */
app.get('/', async (c) => {
  const entityType = c.req.query('entityType')
  if (!entityType) return c.json({ error: 'entityType required' }, 400)

  const db = drizzle(c.env.DB)
  const rows = await db.select().from(tags).where(eq(tags.entityType, entityType))
  return c.json({ tags: rows })
})

/** POST /api/tags — create a tag */
app.post(
  '/',
  zValidator('json', z.object({
    name: z.string().min(1).max(50),
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    entityType: z.string(),
  })),
  async (c) => {
    const input = c.req.valid('json')
    const userId = c.get('userId')
    const db = drizzle(c.env.DB)
    const [tag] = await db.insert(tags).values({ ...input, userId }).returning()
    return c.json({ tag }, 201)
  }
)

/** DELETE /api/tags/:id — delete a tag */
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  await db.delete(tags).where(eq(tags.id, id))
  return c.json({ success: true })
})

/** GET /api/tags/entity?entityType=x&entityId=y — get tags for an entity */
app.get('/entity', async (c) => {
  const entityType = c.req.query('entityType')
  const entityId = c.req.query('entityId')
  if (!entityType || !entityId) return c.json({ error: 'entityType and entityId required' }, 400)

  const db = drizzle(c.env.DB)
  const rows = await db
    .select({ tag: tags })
    .from(entityTags)
    .innerJoin(tags, eq(entityTags.tagId, tags.id))
    .where(and(eq(entityTags.entityType, entityType), eq(entityTags.entityId, entityId)))

  return c.json({ tags: rows.map((r) => r.tag) })
})

/** POST /api/tags/entity — attach a tag to an entity */
app.post(
  '/entity',
  zValidator('json', z.object({
    entityType: z.string(),
    entityId: z.string(),
    tagId: z.string(),
  })),
  async (c) => {
    const input = c.req.valid('json')
    const db = drizzle(c.env.DB)
    await db.insert(entityTags).values(input).onConflictDoNothing()
    return c.json({ success: true })
  }
)

/** DELETE /api/tags/entity — detach a tag from an entity */
app.delete(
  '/entity',
  zValidator('json', z.object({
    entityType: z.string(),
    entityId: z.string(),
    tagId: z.string(),
  })),
  async (c) => {
    const { entityType, entityId, tagId } = c.req.valid('json')
    const db = drizzle(c.env.DB)
    await db.delete(entityTags).where(
      and(eq(entityTags.entityType, entityType), eq(entityTags.entityId, entityId), eq(entityTags.tagId, tagId))
    )
    return c.json({ success: true })
  }
)

export default app
