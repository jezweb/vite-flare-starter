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
import { conversations } from '@/server/modules/conversations/db/schema'
import { user } from '@/server/modules/auth/db/schema'
import { getOrgRole } from '@/server/modules/organizations/helpers'
import type { D1Database } from '@cloudflare/workers-types'
import { extractMemoryFromConversation } from './extract-job'
import { applyExtractionResult } from './apply-updates'

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
  d1: D1Database,
  userId: string,
  scope: 'project' | 'user' | 'org',
  scopeId: string
): Promise<boolean> {
  if (scope === 'user') return scopeId === userId
  if (scope === 'project') {
    const [project] = await drizzle(d1)
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, scopeId), eq(projects.userId, userId)))
      .limit(1)
    return !!project
  }
  // org — caller must be a member of the organization. Previously deferred
  // ("Phase 5") and returned true, which let any authenticated user read/write
  // any org's memories by passing scope=org&scopeId=<any org id>.
  return (await getOrgRole(d1, userId, scopeId)) !== null
}

/** GET /api/memories?scope=...&scopeId=... — list memories for a scope */
app.get('/', zValidator('query', listQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { scope, scopeId, type, includePrivate } = c.req.valid('query')
  const d = drizzle(c.env.DB)

  const allowed = await checkScopeAccess(c.env.DB, userId, scope, scopeId)
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
      createdAt: m.createdAt ? new Date(m.createdAt as unknown as number).toISOString() : null,
      updatedAt: m.updatedAt ? new Date(m.updatedAt as unknown as number).toISOString() : null,
    })),
  })
})

// ─── Static routes BEFORE parameterised — Hono matches top-to-bottom ──
//
// `/user-mode` and `/regenerate` must register before `/:id` or the
// parameterised handler greedily catches them and returns
// {"error":"Memory not found"}.

const userModeSchema = z.object({
  memoryUpdateMode: z.enum(['ask', 'auto', 'never']),
})

app.get('/user-mode', async (c) => {
  const userId = c.get('userId')
  const d = drizzle(c.env.DB)
  const [row] = await d
    .select({ memoryUpdateMode: user.memoryUpdateMode })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return c.json({ memoryUpdateMode: row?.memoryUpdateMode ?? 'auto' })
})

app.patch('/user-mode', zValidator('json', userModeSchema), async (c) => {
  const userId = c.get('userId')
  const { memoryUpdateMode } = c.req.valid('json')
  const d = drizzle(c.env.DB)
  await d.update(user).set({ memoryUpdateMode }).where(eq(user.id, userId))
  return c.json({ success: true, memoryUpdateMode })
})

/** GET /api/memories/:id — single memory */
app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)

  const [m] = await d.select().from(memories).where(eq(memories.id, id)).limit(1)
  if (!m) return c.json({ error: 'Memory not found' }, 404)

  const allowed = await checkScopeAccess(
    c.env.DB,
    userId,
    m.scope as 'project' | 'user' | 'org',
    m.scopeId
  )
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  return c.json({
    memory: {
      ...m,
      createdAt: m.createdAt ? new Date(m.createdAt as unknown as number).toISOString() : null,
      updatedAt: m.updatedAt ? new Date(m.updatedAt as unknown as number).toISOString() : null,
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

  const allowed = await checkScopeAccess(c.env.DB, userId, input.scope, input.scopeId)
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
    c.env.DB,
    userId,
    existing.scope as 'project' | 'user' | 'org',
    existing.scopeId
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
    c.env.DB,
    userId,
    existing.scope as 'project' | 'user' | 'org',
    existing.scopeId
  )
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  await d.delete(memories).where(eq(memories.id, id))

  return c.json({ success: true })
})

// ─── User memory mode (Phase 3 v2) ──────────────────────────────────
//
// User-scope `memoryUpdateMode` lives on the `user` table. Project-scope
// is on the `projects` table and gets PATCHed via the existing project
// route. The user-mode handlers live above the `/:id` block — see the
// "Static routes BEFORE parameterised" note up top.

// ─── Manual regenerate (Phase 3 v2) ─────────────────────────────────
//
// Synchronous re-run of the memory extraction job for a single
// conversation. Used by the "Regenerate now" button on the project
// page Memory section. Returns the structured proposal + apply
// summary so the UI can show what changed (or routed to approvals).
//
// The auto path uses fire-and-forget via ctx.waitUntil from the chat
// onFinish hook (reactive trigger) and the cron sweep. This endpoint
// is the manual third trigger — handy for testing and for users who
// want to force a re-pass after correcting earlier rejections.
const regenerateSchema = z.object({
  conversationId: z.string().uuid(),
})

app.post('/regenerate', zValidator('json', regenerateSchema), async (c) => {
  const userId = c.get('userId')
  const { conversationId } = c.req.valid('json')
  const d = drizzle(c.env.DB)

  // Ownership check
  const [conv] = await d
    .select({
      id: conversations.id,
      projectId: conversations.projectId,
      title: conversations.title,
    })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1)
  if (!conv) return c.json({ error: 'Not found' }, 404)

  const job = await extractMemoryFromConversation({
    db: c.env.DB,
    ai: c.env.AI,
    conversationId,
    userId,
  })
  if (!job.ok || !job.result) {
    return c.json({ ok: false, error: job.error ?? 'extract_failed' }, 200)
  }

  const allowTitleReplace =
    !conv.title || conv.title.trim().length === 0 || conv.title === 'New conversation'
  const summary = await applyExtractionResult({
    db: c.env.DB,
    userId,
    conversationId,
    projectId: conv.projectId ?? null,
    result: job.result,
    allowTitleReplace,
  })
  return c.json({ ok: true, result: job.result, summary })
})

export default app
