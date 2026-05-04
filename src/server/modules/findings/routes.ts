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
 *   GET  /api/learnings?agent=&limit=
 *   GET  /api/learnings/:id
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { entities } from '@/server/modules/entities/db/schema'

interface FindingFields {
  body?: string
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
  const { status, agent, category, limit = 100 } = c.req.valid('query')
  const db = drizzle(c.env.DB)
  const conditions = [eq(entities.userId, userId), eq(entities.type, 'finding')]
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
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const [row] = await db
    .select()
    .from(entities)
    .where(
      and(eq(entities.id, id), eq(entities.userId, userId), eq(entities.type, 'finding')),
    )
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
  const findingId = c.req.param('id')
  const { refinedBody } = c.req.valid('json')
  const db = drizzle(c.env.DB)
  const [finding] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.id, findingId),
        eq(entities.userId, userId),
        eq(entities.type, 'finding'),
      ),
    )
    .limit(1)
  if (!finding) return c.json({ error: 'Finding not found' }, 404)
  if (finding.status === 'promoted') {
    return c.json({ error: 'Finding already promoted' }, 409)
  }

  const findingFields = parseFields(finding.fields)
  const body = refinedBody ?? findingFields.body ?? ''
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
  const findingId = c.req.param('id')
  const { reason } = c.req.valid('json')
  const db = drizzle(c.env.DB)
  const [finding] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.id, findingId),
        eq(entities.userId, userId),
        eq(entities.type, 'finding'),
      ),
    )
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

// ─── Learnings list ───────────────────────────────────────────────

const learningsApp = new Hono<AuthContext>()
learningsApp.use('*', authMiddleware)

const ListLearningsQuery = z.object({
  agent: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

learningsApp.get('/', zValidator('query', ListLearningsQuery), async (c) => {
  const userId = c.get('userId')
  const { agent, limit = 100 } = c.req.valid('query')
  const db = drizzle(c.env.DB)
  const rows = await db
    .select()
    .from(entities)
    .where(and(eq(entities.userId, userId), eq(entities.type, 'learning')))
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
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const [row] = await db
    .select()
    .from(entities)
    .where(
      and(eq(entities.id, id), eq(entities.userId, userId), eq(entities.type, 'learning')),
    )
    .limit(1)
  if (!row) return c.json({ error: 'Learning not found' }, 404)
  return c.json({ learning: serialiseFinding(row) })
})

export { findingsApp as default, learningsApp }
