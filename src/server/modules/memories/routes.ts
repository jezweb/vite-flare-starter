/**
 * Memories API — multi-entry, three-scope persistent memory.
 *
 * Endpoints:
 *   GET    /api/memories?scope=project|user|org&scopeId=...   — list
 *   GET    /api/memories/:id                                   — get one
 *   POST   /api/memories                                       — create
 *   PATCH  /api/memories/:id                                   — update
 *   DELETE /api/memories/:id                                   — delete
 *
 * Scope semantics enforced server-side:
 *   - 'project' scopeId must be a project the user owns
 *   - 'user' scopeId must equal the authenticated user's id
 *   - 'org' scopeId must be an organization the user is a member of
 *     (Phase 5 enforcement; Phase 3 ships open writes — defer)
 *
 * Privacy:
 *   - is_private rows are excluded from auto-injection (helper does the filter)
 *   - All rows are returned via this CRUD API; UI shows the lock icon
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { memories, MEMORY_SCOPES, MEMORY_TYPES } from './db/schema'
import { projects } from '@/server/modules/projects/db/schema'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const listQuerySchema = z.object({
  scope: z.enum(MEMORY_SCOPES),
  scopeId: z.string().min(1),
  type: z.enum(MEMORY_TYPES).optional(),
  includePrivate: z.string().optional(), // '1' to include is_private rows in the list (UI default)
})

/**
 * Verify the authenticated user is allowed to read/write a given scope+scopeId.
 * - user scope: scopeId must be their own user id
 * - project scope: must own the project
 * - org scope: deferred — return true for now (Phase 5 will enforce)
 */
async function checkScopeAccess(
  db: ReturnType<typeof drizzle>,
  userId: string,
  scope: 'project' | 'user' | 'org',
  scopeId: string,
): Promise<boolean> {
  if (scope === 'user') return scopeId === userId
  if (scope === 'project') {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, scopeId), eq(projects.userId, userId)))
      .limit(1)
    return !!project
  }
  // org — deferred to Phase 5; allow for now
  return true
}

/** GET /api/memories?scope=...&scopeId=... — list memories for a scope */
app.get('/', zValidator('query', listQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { scope, scopeId, type, includePrivate } = c.req.valid('query')
  const d = drizzle(c.env.DB)

  const allowed = await checkScopeAccess(d, userId, scope, scopeId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  const conditions = [eq(memories.scope, scope), eq(memories.scopeId, scopeId)]
  if (type) conditions.push(eq(memories.type, type))
  // includePrivate defaults to '1' (UI shows them with the lock icon).
  // Internally, the auto-injector calls this endpoint with includePrivate='0'.
  if (includePrivate === '0') conditions.push(eq(memories.isPrivate, 0))

  const rows = await d
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.updatedAt))

  return c.json({
    memories: rows.map((m) => ({
      ...m,
      createdAt: m.createdAt
        ? new Date(m.createdAt as unknown as number).toISOString()
        : null,
      updatedAt: m.updatedAt
        ? new Date(m.updatedAt as unknown as number).toISOString()
        : null,
    })),
  })
})

/** GET /api/memories/:id — single memory */
app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)

  const [m] = await d.select().from(memories).where(eq(memories.id, id)).limit(1)
  if (!m) return c.json({ error: 'Memory not found' }, 404)

  const allowed = await checkScopeAccess(d, userId, m.scope as 'project' | 'user' | 'org', m.scopeId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  return c.json({
    memory: {
      ...m,
      createdAt: m.createdAt
        ? new Date(m.createdAt as unknown as number).toISOString()
        : null,
      updatedAt: m.updatedAt
        ? new Date(m.updatedAt as unknown as number).toISOString()
        : null,
    },
  })
})

const createSchema = z.object({
  scope: z.enum(MEMORY_SCOPES),
  scopeId: z.string().min(1),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(200),
  type: z.enum(MEMORY_TYPES),
  content: z.string().min(1).max(8000),
  isPrivate: z.boolean().optional(),
  sourceConversationId: z.string().nullable().optional(),
})

app.post('/', zValidator('json', createSchema), async (c) => {
  const userId = c.get('userId')
  const input = c.req.valid('json')
  const d = drizzle(c.env.DB)

  const allowed = await checkScopeAccess(d, userId, input.scope, input.scopeId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  const id = crypto.randomUUID()
  const now = new Date()
  await d.insert(memories).values({
    id,
    scope: input.scope,
    scopeId: input.scopeId,
    name: input.name,
    description: input.description,
    type: input.type,
    content: input.content,
    isPrivate: input.isPrivate ? 1 : 0,
    sourceConversationId: input.sourceConversationId ?? null,
    createdAt: now,
    updatedAt: now,
  })

  return c.json({ id, success: true }, 201)
})

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().min(1).max(200).optional(),
  type: z.enum(MEMORY_TYPES).optional(),
  content: z.string().min(1).max(8000).optional(),
  isPrivate: z.boolean().optional(),
})

app.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const input = c.req.valid('json')
  const d = drizzle(c.env.DB)

  const [existing] = await d.select().from(memories).where(eq(memories.id, id)).limit(1)
  if (!existing) return c.json({ error: 'Memory not found' }, 404)

  const allowed = await checkScopeAccess(
    d,
    userId,
    existing.scope as 'project' | 'user' | 'org',
    existing.scopeId,
  )
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  const patch: Partial<typeof memories.$inferInsert> = { updatedAt: new Date() }
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.type !== undefined) patch.type = input.type
  if (input.content !== undefined) patch.content = input.content
  if (input.isPrivate !== undefined) patch.isPrivate = input.isPrivate ? 1 : 0

  await d.update(memories).set(patch).where(eq(memories.id, id))

  return c.json({ success: true })
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)

  const [existing] = await d.select().from(memories).where(eq(memories.id, id)).limit(1)
  if (!existing) return c.json({ error: 'Memory not found' }, 404)

  const allowed = await checkScopeAccess(
    d,
    userId,
    existing.scope as 'project' | 'user' | 'org',
    existing.scopeId,
  )
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  await d.delete(memories).where(eq(memories.id, id))

  return c.json({ success: true })
})

export default app
