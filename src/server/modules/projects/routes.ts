/**
 * Projects API — CRUD + list with per-project conversation counts.
 *
 * Owned by the current user: every query joins on `user_id`. No cross-user
 * visibility. Deleting a project uses the `ON DELETE SET NULL` FK on
 * `conversations.project_id` so the chats survive — see
 * .jez/artifacts/projects-plan-2026-04-18.md for why.
 *
 * Phase 1 scope: CRUD + sidebar. Phase 2 will wire system-prompt + model
 * inheritance into the chat route.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, sql } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { projects } from './db/schema'
import { conversations } from '@/server/modules/conversations/db/schema'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

/**
 * GET /api/projects — list user's active projects with conversation counts.
 *
 * Returns ordered by position ASC, then updatedAt DESC. Archived projects
 * excluded (use ?includeArchived=1 to fetch them too).
 */
app.get('/', async (c) => {
  const userId = c.get('userId')
  const includeArchived = c.req.query('includeArchived') === '1'
  const d = drizzle(c.env.DB)

  // Single query: project rows + count of active conversations per project.
  // LEFT JOIN so empty projects still appear (count = 0).
  const rows = await d
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      systemPrompt: projects.systemPrompt,
      defaultModel: projects.defaultModel,
      color: projects.color,
      position: projects.position,
      archived: projects.archived,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      conversationCount: sql<number>`COUNT(${conversations.id})`.as('conversation_count'),
    })
    .from(projects)
    .leftJoin(conversations, eq(conversations.projectId, projects.id))
    .where(
      includeArchived
        ? eq(projects.userId, userId)
        : and(eq(projects.userId, userId), eq(projects.archived, 0)),
    )
    .groupBy(projects.id)
    .orderBy(projects.position, desc(projects.updatedAt))

  return c.json({
    projects: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt ? new Date(r.createdAt as unknown as number).toISOString() : null,
      updatedAt: r.updatedAt ? new Date(r.updatedAt as unknown as number).toISOString() : null,
    })),
  })
})

/** GET /api/projects/:id — single project with its conversations */
app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)

  const [project] = await d
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1)

  if (!project) return c.json({ error: 'Not found' }, 404)

  const convs = await d
    .select({
      id: conversations.id,
      title: conversations.title,
      summary: conversations.summary,
      starred: conversations.starred,
      model: conversations.model,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.projectId, id)))
    .orderBy(desc(conversations.starred), desc(conversations.updatedAt))

  return c.json({
    project: {
      ...project,
      createdAt: project.createdAt ? new Date(project.createdAt as unknown as number).toISOString() : null,
      updatedAt: project.updatedAt ? new Date(project.updatedAt as unknown as number).toISOString() : null,
    },
    conversations: convs.map((v) => ({
      ...v,
      updatedAt: v.updatedAt ? new Date(v.updatedAt as unknown as number).toISOString() : null,
    })),
  })
})

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().max(4000).optional(),
  defaultModel: z.string().max(120).optional(),
  color: z.string().max(40).optional(),
})

/** POST /api/projects — create a new project */
app.post('/', zValidator('json', createSchema), async (c) => {
  const userId = c.get('userId')
  const input = c.req.valid('json')
  const d = drizzle(c.env.DB)

  // New projects land at the top (position 0) and push siblings down by 1
  // so user-facing order matches "most recently created, then previous".
  await d
    .update(projects)
    .set({ position: sql`${projects.position} + 1` })
    .where(eq(projects.userId, userId))

  const id = crypto.randomUUID()
  await d.insert(projects).values({
    id,
    userId,
    name: input.name,
    description: input.description ?? null,
    systemPrompt: input.systemPrompt ?? null,
    defaultModel: input.defaultModel ?? null,
    color: input.color ?? null,
    position: 0,
  })

  return c.json({ id, success: true }, 201)
})

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  systemPrompt: z.string().max(4000).nullable().optional(),
  defaultModel: z.string().max(120).nullable().optional(),
  color: z.string().max(40).nullable().optional(),
  position: z.number().int().optional(),
})

/** PATCH /api/projects/:id — rename / edit description / instructions / reorder */
app.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const input = c.req.valid('json')
  const d = drizzle(c.env.DB)

  // Only apply fields that were explicitly passed — undefined keeps old
  // value, null clears. Typed object rather than Record<string,unknown> so
  // tsconfig's noUncheckedIndexedAccess doesn't force bracket notation on
  // every assignment.
  const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() }
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.systemPrompt !== undefined) patch.systemPrompt = input.systemPrompt
  if (input.defaultModel !== undefined) patch.defaultModel = input.defaultModel
  if (input.color !== undefined) patch.color = input.color
  if (input.position !== undefined) patch.position = input.position

  await d
    .update(projects)
    .set(patch)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))

  return c.json({ success: true })
})

/** DELETE /api/projects/:id — delete the project. Conversations survive (SET NULL FK). */
app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)

  await d
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))

  return c.json({ success: true })
})

/**
 * POST   /api/projects/:id/archive  — hide from sidebar
 * DELETE /api/projects/:id/archive  — restore
 */
app.post('/:id/archive', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)
  await d.update(projects).set({ archived: 1 }).where(and(eq(projects.id, id), eq(projects.userId, userId)))
  return c.json({ success: true, archived: true })
})

app.delete('/:id/archive', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)
  await d.update(projects).set({ archived: 0 }).where(and(eq(projects.id, id), eq(projects.userId, userId)))
  return c.json({ success: true, archived: false })
})

export default app
