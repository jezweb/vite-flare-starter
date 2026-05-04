/**
 * Findings + learnings API — read endpoints + manual promote/dismiss
 *
 * The agent writes via the chat tools (`record_finding`, `promote_finding`,
 * `dismiss_finding`). This module exposes the user-facing read views +
 * manual UI controls (click-to-promote, click-to-dismiss).
 *
 * Storage: rows in `entities` with `type='finding'` or `type='learning'`.
 * No new table; see `src/server/modules/chat/tools/findings.ts` for the
 * fields-blob shape.
 *
 * Routes:
 *   GET  /api/findings?status=&agent=&category=&limit=
 *   GET  /api/findings/:id
 *   POST /api/findings/:id/promote      — refinedBody optional in body
 *   POST /api/findings/:id/dismiss      — { reason? } body
 *   POST /api/findings/:id/reopen       — restore a dismissed finding to open/recurred
 *   GET  /api/learnings?agent=&limit=
 *   GET  /api/learnings/:id
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { getActiveOrg } from '@/server/modules/organizations/helpers'
import { entities } from '@/server/modules/entities/db/schema'

/**
 * Org-scoping visibility filter — same shape as entities/routes.ts.
 * Findings + learnings are stored as `entities` rows, so they inherit
 * the same multi-tenant model. NULL `organization_id` rows stay
 * visible (legacy data) until a deliberate backfill.
 */
function orgScopeWhere(orgId: string | null) {
  if (orgId) {
    return or(eq(entities.organizationId, orgId), isNull(entities.organizationId))
  }
  return isNull(entities.organizationId)
}

interface FindingFields {
  body?: string
  /** Seed-data + agent-tool variants store the pattern split across
   *  `observation` (what was noticed) + `recommendation` (what to do
   *  about it). Treated as fallbacks for `body` during promote so a
   *  click never 400s on findings that pre-date the body convention. */
  observation?: string
  recommendation?: string
  category?: string
  tags?: string[]
  agentClass?: string
  agentName?: string
  recurrenceCount?: number
  sourceFindingId?: string
  promotedAt?: number
  dismissedReason?: string
}

function parseFields(raw: string): FindingFields {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as FindingFields) : {}
  } catch {
    return {}
  }
}

function serialiseFinding(row: typeof entities.$inferSelect) {
  const f = parseFields(row.fields)
  return {
    id: row.id,
    type: row.type as 'finding' | 'learning',
    title: row.title,
    status: row.status,
    body: f.body ?? '',
    category: f.category ?? null,
    tags: f.tags ?? [],
    agentClass: f.agentClass ?? null,
    agentName: f.agentName ?? null,
    recurrenceCount: f.recurrenceCount ?? 0,
    sourceFindingId: f.sourceFindingId ?? null,
    promotedAt: f.promotedAt ?? null,
    dismissedReason: f.dismissedReason ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export type FindingDto = ReturnType<typeof serialiseFinding>

const findingsApp = new Hono<AuthContext>()
findingsApp.use('*', authMiddleware)

// ─── List findings ────────────────────────────────────────────────

const ListFindingsQuery = z.object({
  status: z.string().max(50).optional(),
  agent: z.string().max(200).optional(),
  category: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

findingsApp.get('/', zValidator('query', ListFindingsQuery), async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const { status, agent, category, limit = 100 } = c.req.valid('query')
  const db = drizzle(c.env.DB)
  const orgClause = orgScopeWhere(orgId)
  const conditions = [eq(entities.userId, userId), eq(entities.type, 'finding')]
  if (orgClause) conditions.push(orgClause)
  if (status) conditions.push(eq(entities.status, status))

  const rows = await db
    .select()
    .from(entities)
    .where(and(...conditions))
    .orderBy(desc(entities.updatedAt))
    .limit(limit * 2) // pad for in-memory fields filtering
  const serialised = rows.map(serialiseFinding)
  // Filter by agent / category in memory — these live in fields JSON
  // and SQLite JSON_EXTRACT is overkill at this scale.
  const filtered = serialised.filter((row) => {
    if (agent && row.agentName !== agent && row.agentClass !== agent) return false
    if (category && row.category !== category) return false
    return true
  })
  return c.json({
    total: filtered.length,
    findings: filtered.slice(0, limit),
  })
})

// ─── Single finding ───────────────────────────────────────────────

findingsApp.get('/:id', async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const orgClause = orgScopeWhere(orgId)
  const conds = [eq(entities.id, id), eq(entities.userId, userId), eq(entities.type, 'finding')]
  if (orgClause) conds.push(orgClause)
  const [row] = await db
    .select()
    .from(entities)
    .where(and(...conds))
    .limit(1)
  if (!row) return c.json({ error: 'Finding not found' }, 404)
  return c.json({ finding: serialiseFinding(row) })
})

// ─── Promote ──────────────────────────────────────────────────────

const PromoteBody = z.object({
  refinedBody: z.string().max(4000).optional(),
})

findingsApp.post('/:id/promote', zValidator('json', PromoteBody), async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const findingId = c.req.param('id')
  const { refinedBody } = c.req.valid('json')
  const db = drizzle(c.env.DB)
  const orgClause = orgScopeWhere(orgId)
  const findingConds = [
    eq(entities.id, findingId),
    eq(entities.userId, userId),
    eq(entities.type, 'finding'),
  ]
  if (orgClause) findingConds.push(orgClause)
  const [finding] = await db
    .select()
    .from(entities)
    .where(and(...findingConds))
    .limit(1)
  if (!finding) return c.json({ error: 'Finding not found' }, 404)
  if (finding.status === 'promoted') {
    return c.json({ error: 'Finding already promoted' }, 409)
  }

  const findingFields = parseFields(finding.fields)
  // P2-003 — fallback chain handles findings created without an explicit
  // body (seed data, agent tools that wrote a structured shape with
  // `observation` + `recommendation` fields, etc). Title is the last
  // resort so a click never 400s.
  const body =
    refinedBody ??
    findingFields.body ??
    findingFields.observation ??
    findingFields.recommendation ??
    finding.title
  if (!body) return c.json({ error: 'Cannot promote empty finding' }, 400)
  const learningId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const learningTitle = body.split('\n', 1)[0]?.trim().slice(0, 200) || body.slice(0, 200)
  const learningFields: FindingFields = {
    body,
    ...(findingFields.category !== undefined && { category: findingFields.category }),
    ...(findingFields.tags !== undefined && { tags: findingFields.tags }),
    ...(findingFields.agentClass !== undefined && { agentClass: findingFields.agentClass }),
    ...(findingFields.agentName !== undefined && { agentName: findingFields.agentName }),
    sourceFindingId: findingId,
  }
  await db.insert(entities).values({
    id: learningId,
    userId,
    organizationId: finding.organizationId ?? null,
    type: 'learning',
    title: learningTitle,
    status: 'active',
    fields: JSON.stringify(learningFields),
    createdAt: now,
    updatedAt: now,
  })
  await db
    .update(entities)
    .set({
      status: 'promoted',
      fields: JSON.stringify({ ...findingFields, promotedAt: now }),
      updatedAt: now,
    })
    .where(eq(entities.id, findingId))

  const [learning] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, learningId))
    .limit(1)
  const [updated] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, findingId))
    .limit(1)
  return c.json({
    finding: updated ? serialiseFinding(updated) : null,
    learning: learning ? serialiseFinding(learning) : null,
  })
})

// ─── Dismiss ──────────────────────────────────────────────────────

const DismissBody = z.object({
  reason: z.string().max(500).optional(),
})

findingsApp.post('/:id/dismiss', zValidator('json', DismissBody), async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const findingId = c.req.param('id')
  const { reason } = c.req.valid('json')
  const db = drizzle(c.env.DB)
  const orgClause = orgScopeWhere(orgId)
  const conds = [
    eq(entities.id, findingId),
    eq(entities.userId, userId),
    eq(entities.type, 'finding'),
  ]
  if (orgClause) conds.push(orgClause)
  const [finding] = await db
    .select()
    .from(entities)
    .where(and(...conds))
    .limit(1)
  if (!finding) return c.json({ error: 'Finding not found' }, 404)

  const fields = parseFields(finding.fields)
  await db
    .update(entities)
    .set({
      status: 'dismissed',
      fields: JSON.stringify({
        ...fields,
        ...(reason !== undefined && { dismissedReason: reason }),
      }),
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(entities.id, findingId))

  const [row] = await db.select().from(entities).where(eq(entities.id, findingId)).limit(1)
  return c.json({ finding: row ? serialiseFinding(row) : null })
})

// ─── Reopen ───────────────────────────────────────────────────────

/**
 * P4-007 / P4-008 — restore a dismissed finding to open. Optional
 * `status` lets the undo path snap back to whatever the row was before
 * dismiss (open or recurred); without it, default to 'open'. The
 * `dismissedReason` field is dropped on reopen so a fresh dismiss
 * later doesn't carry stale text.
 */
const ReopenBody = z.object({
  status: z.enum(['open', 'recurred']).optional(),
})

findingsApp.post('/:id/reopen', zValidator('json', ReopenBody), async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const findingId = c.req.param('id')
  const { status: nextStatus = 'open' } = c.req.valid('json')
  const db = drizzle(c.env.DB)
  const orgClause = orgScopeWhere(orgId)
  const conds = [
    eq(entities.id, findingId),
    eq(entities.userId, userId),
    eq(entities.type, 'finding'),
  ]
  if (orgClause) conds.push(orgClause)
  const [finding] = await db
    .select()
    .from(entities)
    .where(and(...conds))
    .limit(1)
  if (!finding) return c.json({ error: 'Finding not found' }, 404)
  if (finding.status === 'promoted') {
    return c.json({ error: 'Cannot reopen a promoted finding' }, 409)
  }

  const fields = parseFields(finding.fields)
  // Drop dismissedReason on reopen — a stale reason from a prior
  // dismiss shouldn't haunt the row.
  const { dismissedReason: _drop, ...nextFields } = fields
  void _drop
  await db
    .update(entities)
    .set({
      status: nextStatus,
      fields: JSON.stringify(nextFields),
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(entities.id, findingId))

  const [row] = await db.select().from(entities).where(eq(entities.id, findingId)).limit(1)
  return c.json({ finding: row ? serialiseFinding(row) : null })
})

// ─── Learnings list ───────────────────────────────────────────────

const learningsApp = new Hono<AuthContext>()
learningsApp.use('*', authMiddleware)

const ListLearningsQuery = z.object({
  agent: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

learningsApp.get('/', zValidator('query', ListLearningsQuery), async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const { agent, limit = 100 } = c.req.valid('query')
  const db = drizzle(c.env.DB)
  const orgClause = orgScopeWhere(orgId)
  const conds = [eq(entities.userId, userId), eq(entities.type, 'learning')]
  if (orgClause) conds.push(orgClause)
  const rows = await db
    .select()
    .from(entities)
    .where(and(...conds))
    .orderBy(desc(entities.updatedAt))
    .limit(limit * 2)
  const serialised = rows.map(serialiseFinding)
  const filtered = serialised.filter((row) => {
    if (agent && row.agentName !== agent && row.agentClass !== agent) return false
    return true
  })
  return c.json({
    total: filtered.length,
    learnings: filtered.slice(0, limit),
  })
})

learningsApp.get('/:id', async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const orgClause = orgScopeWhere(orgId)
  const conds = [eq(entities.id, id), eq(entities.userId, userId), eq(entities.type, 'learning')]
  if (orgClause) conds.push(orgClause)
  const [row] = await db
    .select()
    .from(entities)
    .where(and(...conds))
    .limit(1)
  if (!row) return c.json({ error: 'Learning not found' }, 404)
  return c.json({ learning: serialiseFinding(row) })
})

export { findingsApp as default, learningsApp }
