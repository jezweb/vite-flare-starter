/**
 * Entities API — generic typed entity CRUD
 *
 * Routes scoped to the authenticated user. Forks adapting this for
 * multi-tenant CRM / project management add an `org_id` column +
 * scope queries on org membership instead of (or alongside) userId.
 *
 * Routes:
 *   GET    /api/entities?type=&status=&assignee=&q=&limit=
 *   POST   /api/entities                 — create
 *   GET    /api/entities/:id             — single
 *   PATCH  /api/entities/:id             — partial update (fields, status, etc)
 *   DELETE /api/entities/:id
 *
 * `q` is a basic LIKE search across `title` + `external_id`. For
 * full-text over `fields` JSON, fork in FTS5 — patterns documented
 * in the conversations module.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { getActiveOrg } from '@/server/modules/organizations/helpers'
import { entities } from './db/schema'

/**
 * Org-scoping visibility filter. When `orgId` is set, the user sees
 * entities in that org PLUS legacy entities with no org (so existing
 * pre-multi-tenant data stays visible to its owner). When `orgId` is
 * null (no active org), only personal entities (org IS NULL) are
 * visible. A backfill is a separate decision — keep this filter
 * additive so it can't accidentally hide rows.
 */
function orgScopeWhere(orgId: string | null) {
  if (orgId) {
    return or(eq(entities.organizationId, orgId), isNull(entities.organizationId))
  }
  return isNull(entities.organizationId)
}

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const NAME_RE = /^[a-zA-Z0-9_-]+$/

// ─── List ─────────────────────────────────────────────────────────

const ListSchema = z.object({
  type: z.string().regex(NAME_RE).optional(),
  status: z.string().regex(NAME_RE).optional(),
  assignee: z.string().optional(),
  q: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

app.get('/', zValidator('query', ListSchema), async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const { type, status, assignee, q, limit = 100 } = c.req.valid('query')
  const db = drizzle(c.env.DB)
  const orgClause = orgScopeWhere(orgId)
  const conditions = orgClause
    ? [eq(entities.userId, userId), orgClause]
    : [eq(entities.userId, userId)]
  if (type) conditions.push(eq(entities.type, type))
  if (status) conditions.push(eq(entities.status, status))
  if (assignee) conditions.push(eq(entities.assigneeId, assignee))
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`
    const titleMatch = like(entities.title, pattern)
    const extMatch = like(entities.externalId, pattern)
    const orClause = or(titleMatch, extMatch)
    if (orClause) conditions.push(orClause)
  }

  const rows = await db
    .select()
    .from(entities)
    .where(and(...conditions))
    .orderBy(desc(entities.updatedAt))
    .limit(limit)
  return c.json({
    total: rows.length,
    entities: rows.map(serialiseEntity),
  })
})

// ─── Create ───────────────────────────────────────────────────────

const CreateSchema = z.object({
  type: z.string().min(1).max(50).regex(NAME_RE),
  title: z.string().min(1).max(500),
  status: z.string().max(50).regex(NAME_RE).optional(),
  externalId: z.string().max(200).optional(),
  assigneeId: z.string().optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
})

app.post('/', zValidator('json', CreateSchema), async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const body = c.req.valid('json')
  const id = crypto.randomUUID()
  const db = drizzle(c.env.DB)
  await db.insert(entities).values({
    id,
    userId,
    organizationId: orgId,
    type: body.type,
    title: body.title,
    ...(body.status !== undefined && { status: body.status }),
    ...(body.externalId !== undefined && { externalId: body.externalId }),
    ...(body.assigneeId !== undefined && { assigneeId: body.assigneeId }),
    ...(body.fields !== undefined && { fields: JSON.stringify(body.fields) }),
  })
  const [row] = await db.select().from(entities).where(eq(entities.id, id))
  return c.json(serialiseEntity(row!))
})

// ─── Single ───────────────────────────────────────────────────────

app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const row = await loadOwned(c.env.DB, userId, id, orgId)
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(serialiseEntity(row))
})

// ─── Update (partial) ─────────────────────────────────────────────

const UpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.string().max(50).regex(NAME_RE).optional(),
  externalId: z.string().max(200).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  /** Merged into existing fields (NOT replaced). To clear a field
   *  pass it as `null`; to clear the whole blob use `replaceFields`. */
  fields: z.record(z.string(), z.unknown()).optional(),
  /** Replace the entire fields blob instead of merging. Useful for
   *  resets / migrations. */
  replaceFields: z.record(z.string(), z.unknown()).optional(),
})

app.patch('/:id', zValidator('json', UpdateSchema), async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const body = c.req.valid('json')
  const existing = await loadOwned(c.env.DB, userId, id, orgId)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const db = drizzle(c.env.DB)
  const updates: Record<string, unknown> = {
    updatedAt: Math.floor(Date.now() / 1000),
  }
  if (body.title !== undefined) updates['title'] = body.title
  if (body.status !== undefined) updates['status'] = body.status
  if (body.externalId !== undefined) updates['externalId'] = body.externalId
  if (body.assigneeId !== undefined) updates['assigneeId'] = body.assigneeId
  if (body.replaceFields !== undefined) {
    updates['fields'] = JSON.stringify(body.replaceFields)
  } else if (body.fields !== undefined) {
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(existing.fields) as Record<string, unknown>
    } catch {
      parsed = {}
    }
    // Merge — null clears keys.
    for (const [k, v] of Object.entries(body.fields)) {
      if (v === null) delete parsed[k]
      else parsed[k] = v
    }
    updates['fields'] = JSON.stringify(parsed)
  }
  await db.update(entities).set(updates).where(eq(entities.id, id))
  const [row] = await db.select().from(entities).where(eq(entities.id, id))
  return c.json(serialiseEntity(row!))
})

// ─── Delete ───────────────────────────────────────────────────────

app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const db = drizzle(c.env.DB)
  // SQLite delete with conditions: if no row matches, no error.
  // We pre-check so the response can be a clean 404.
  const existing = await loadOwned(c.env.DB, userId, id, orgId)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.delete(entities).where(and(eq(entities.id, id), eq(entities.userId, userId)))
  return c.json({ success: true, id })
})

// ─── Stats (per-type counts grouped by status) ────────────────────

app.get('/stats/by-type/:type', async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const type = c.req.param('type')
  if (!NAME_RE.test(type)) return c.json({ error: 'Invalid type' }, 400)
  const db = drizzle(c.env.DB)
  const orgClause = orgScopeWhere(orgId)
  const conditions = orgClause
    ? [eq(entities.userId, userId), eq(entities.type, type), orgClause]
    : [eq(entities.userId, userId), eq(entities.type, type)]
  const rows = await db
    .select({
      status: entities.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(entities)
    .where(and(...conditions))
    .groupBy(entities.status)
  return c.json({ type, byStatus: rows })
})

// ─── Helpers ──────────────────────────────────────────────────────

async function loadOwned(
  dbBinding: D1Database,
  userId: string,
  id: string,
  orgId: string | null = null,
) {
  const db = drizzle(dbBinding)
  const orgClause = orgScopeWhere(orgId)
  const conditions = orgClause
    ? [eq(entities.id, id), eq(entities.userId, userId), orgClause]
    : [eq(entities.id, id), eq(entities.userId, userId)]
  const [row] = await db
    .select()
    .from(entities)
    .where(and(...conditions))
    .limit(1)
  return row ?? null
}

function serialiseEntity(row: typeof entities.$inferSelect) {
  let parsedFields: unknown = {}
  try {
    parsedFields = JSON.parse(row.fields)
  } catch {
    parsedFields = {}
  }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    externalId: row.externalId,
    assigneeId: row.assigneeId,
    fields: parsedFields,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export default app
