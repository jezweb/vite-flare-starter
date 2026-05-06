/**
 * Knowledge API — long-form indexed reference documents.
 *
 * Endpoints (mirrors memories shape):
 *   GET    /api/knowledge?scope=...&scopeId=...   — list (optional injectionMode + tags filter)
 *   GET    /api/knowledge/search?q=...            — FTS5 search across the user's accessible scopes
 *   GET    /api/knowledge/catalog                 — on-demand-mode catalog for the current scopes
 *   GET    /api/knowledge/budget                  — always-active token budget
 *   GET    /api/knowledge/:id                     — read single
 *   POST   /api/knowledge                          — create
 *   PATCH  /api/knowledge/:id                     — update
 *   DELETE /api/knowledge/:id                     — delete
 *
 * Scope authorisation matches memories:
 *   - 'user'    — scopeId must equal the authenticated user's id
 *   - 'project' — caller must own the project (projects.userId = caller)
 *   - 'org'     — Phase 5 (open writes for now)
 *
 * Static routes are declared BEFORE parameterised ones — Hono matches
 * top-to-bottom and `/:id` greedily eats `/search`, `/catalog`, etc.
 * See ~/.claude/rules/hono-routing.md.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { projects } from '@/server/modules/projects/db/schema'
import {
  KNOWLEDGE_FORMATS,
  KNOWLEDGE_SCOPES,
  INJECTION_MODES,
  knowledgeDocuments,
  type KnowledgeScope,
} from './db/schema'
import {
  createKnowledge,
  deleteKnowledge,
  getKnowledge,
  KNOWLEDGE_BODY_HARD_CAP,
  listKnowledge,
  listKnowledgeCatalog,
  loadAlwaysActiveKnowledge,
  parseTags,
  searchKnowledge,
  updateKnowledge,
} from './storage'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

async function checkScopeAccess(
  d: ReturnType<typeof drizzle>,
  userId: string,
  scope: KnowledgeScope,
  scopeId: string,
): Promise<boolean> {
  if (scope === 'user') return scopeId === userId
  if (scope === 'project') {
    const [project] = await d
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, scopeId), eq(projects.userId, userId)))
      .limit(1)
    return !!project
  }
  // org — Phase 5 enforcement; allow for now
  return true
}

/**
 * Resolve the set of (scope, scopeId) pairs this user can read across.
 * Currently: own user scope + every project they own. Org is deferred.
 */
async function userAccessibleScopes(
  d: ReturnType<typeof drizzle>,
  userId: string,
): Promise<Array<{ scope: KnowledgeScope; scopeId: string }>> {
  const ownProjects = await d
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.userId, userId))

  return [
    { scope: 'user' as const, scopeId: userId },
    ...ownProjects.map((p) => ({ scope: 'project' as const, scopeId: p.id })),
  ]
}

const listQuerySchema = z.object({
  scope: z.enum(KNOWLEDGE_SCOPES),
  scopeId: z.string().min(1),
  injectionMode: z.enum(INJECTION_MODES).optional(),
  tag: z.string().optional(), // single tag filter; comma-separate for multiple
})

/** GET /api/knowledge?scope=...&scopeId=... — list docs for a scope. */
app.get('/', zValidator('query', listQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { scope, scopeId, injectionMode, tag } = c.req.valid('query')
  const d = drizzle(c.env.DB)

  if (!(await checkScopeAccess(d, userId, scope, scopeId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const tags = tag ? tag.split(',').map((t) => t.trim()).filter(Boolean) : undefined
  const rows = await listKnowledge(c.env.DB, scope, scopeId, { injectionMode, tags })
  return c.json({
    knowledge: rows.map(serializeRow),
    count: rows.length,
  })
})

/**
 * GET /api/knowledge/search?q=... — FTS5 keyword search across the user's
 * accessible scopes. Returns ranked hits with title/summary; load_knowledge
 * fetches the body for a specific id.
 */
const searchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
})

app.get('/search', zValidator('query', searchQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { q, limit } = c.req.valid('query')
  const d = drizzle(c.env.DB)
  const scopes = await userAccessibleScopes(d, userId)
  const hits = await searchKnowledge(c.env.DB, scopes, q, limit)
  return c.json({ hits, count: hits.length })
})

/**
 * GET /api/knowledge/catalog — on-demand-mode docs the user can load. Used
 * by the chat agent to populate the "Available Knowledge" system-prompt
 * section.
 */
app.get('/catalog', async (c) => {
  const userId = c.get('userId')
  const projectId = c.req.query('projectId') ?? null
  const orgId = c.req.query('orgId') ?? null
  const entries = await listKnowledgeCatalog(c.env.DB, userId, projectId, orgId)
  return c.json({ entries, count: entries.length })
})

/**
 * GET /api/knowledge/budget — always-active token budget summary. Drives the
 * editor's "you've baked in N tokens of always-active knowledge" warning so
 * users can spot prompt bloat before it hurts.
 */
app.get('/budget', async (c) => {
  const userId = c.get('userId')
  const projectId = c.req.query('projectId') ?? null
  const orgId = c.req.query('orgId') ?? null
  const entries = await loadAlwaysActiveKnowledge(c.env.DB, userId, projectId, orgId)
  const total = entries.reduce((acc, e) => acc + e.estimatedTokens, 0)
  return c.json({
    total,
    count: entries.length,
    entries: entries.map((e) => ({
      id: e.id,
      title: e.title,
      scope: e.scope,
      estimatedTokens: e.estimatedTokens,
    })),
  })
})

const createSchema = z.object({
  scope: z.enum(KNOWLEDGE_SCOPES),
  scopeId: z.string().min(1),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(500),
  body: z.string().min(1),
  format: z.enum(KNOWLEDGE_FORMATS).optional(),
  injectionMode: z.enum(INJECTION_MODES).optional(),
  tags: z.array(z.string()).optional(),
})

app.post('/', zValidator('json', createSchema), async (c) => {
  const userId = c.get('userId')
  const args = c.req.valid('json')
  const d = drizzle(c.env.DB)

  if (!(await checkScopeAccess(d, userId, args.scope, args.scopeId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  if (args.body.length > KNOWLEDGE_BODY_HARD_CAP) {
    return c.json({ error: `Body exceeds hard cap of ${KNOWLEDGE_BODY_HARD_CAP} bytes` }, 413)
  }

  const row = await createKnowledge(c.env.DB, args)
  return c.json({ knowledge: serializeRow(row) }, 201)
})

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  format: z.enum(KNOWLEDGE_FORMATS).optional(),
  injectionMode: z.enum(INJECTION_MODES).optional(),
  tags: z.array(z.string()).optional(),
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)
  const row = await getKnowledge(c.env.DB, id)
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (!(await checkScopeAccess(d, userId, row.scope, row.scopeId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  return c.json({ knowledge: serializeRow(row) })
})

app.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const patch = c.req.valid('json')
  const d = drizzle(c.env.DB)

  const existing = await getKnowledge(c.env.DB, id)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await checkScopeAccess(d, userId, existing.scope, existing.scopeId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  if (patch.body && patch.body.length > KNOWLEDGE_BODY_HARD_CAP) {
    return c.json({ error: `Body exceeds hard cap of ${KNOWLEDGE_BODY_HARD_CAP} bytes` }, 413)
  }

  const updated = await updateKnowledge(c.env.DB, id, patch)
  return c.json({ knowledge: updated ? serializeRow(updated) : null })
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)

  const existing = await getKnowledge(c.env.DB, id)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await checkScopeAccess(d, userId, existing.scope, existing.scopeId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const ok = await deleteKnowledge(c.env.DB, id)
  return c.json({ ok })
})

function serializeRow(r: typeof knowledgeDocuments.$inferSelect) {
  return {
    id: r.id,
    scope: r.scope,
    scopeId: r.scopeId,
    title: r.title,
    summary: r.summary,
    body: r.body,
    format: r.format,
    injectionMode: r.injectionMode,
    tags: parseTags(r.tags),
    estimatedTokens: r.estimatedTokens,
    createdAt: r.createdAt ? new Date(r.createdAt as unknown as number).toISOString() : null,
    updatedAt: r.updatedAt ? new Date(r.updatedAt as unknown as number).toISOString() : null,
  }
}

export default app
