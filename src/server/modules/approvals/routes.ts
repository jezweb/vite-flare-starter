/**
 * Approvals API — human-in-the-loop queue for autonomous agents
 *
 * Routes:
 *   GET    /api/approvals                  — list (filter by status)
 *   GET    /api/approvals/:id              — single approval
 *   PATCH  /api/approvals/:id              — edit payload before approve
 *   POST   /api/approvals/:id/approve      — approve + execute
 *   POST   /api/approvals/:id/reject       — reject (no execute)
 *
 * The `approve` route routes back to the originating agent class
 * via `getAgentByName(env[approval.agentClass], approval.agentName)`
 * and calls its `executeApproved(action, payload)`. The agent uses
 * its full env access (Gmail tokens, Calendar, etc) to perform the
 * action — the approver doesn't need to know how the action works.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq } from 'drizzle-orm'
import { getAgentByName } from 'agents'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { pendingApprovals } from './db/schema'

interface ApprovalEnv {
  DB: D1Database
  // Agent bindings are dynamic — we look them up by string. Cast
  // through `unknown` at call time below.
  [key: string]: unknown
}

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

// ─── List ─────────────────────────────────────────────────────────

const ListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'executed', 'failed', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

app.get('/', zValidator('query', ListQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { status = 'pending', limit = 100 } = c.req.valid('query')
  const db = drizzle(c.env.DB)
  const conditions = [eq(pendingApprovals.userId, userId)]
  if (status !== 'all') conditions.push(eq(pendingApprovals.status, status))
  const rows = await db
    .select()
    .from(pendingApprovals)
    .where(and(...conditions))
    .orderBy(desc(pendingApprovals.createdAt))
    .limit(limit)
  return c.json({
    total: rows.length,
    approvals: rows.map(serialiseApproval),
  })
})

// ─── Single ───────────────────────────────────────────────────────

app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const row = await loadOwned(c.env.DB, userId, id)
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(serialiseApproval(row))
})

// ─── Edit payload (only allowed while pending) ────────────────────

const EditSchema = z.object({
  payload: z.unknown(),
  summary: z.string().max(500).optional(),
})

app.patch('/:id', zValidator('json', EditSchema), async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const { payload, summary } = c.req.valid('json')
  const row = await loadOwned(c.env.DB, userId, id)
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.status !== 'pending') {
    return c.json({ error: `Cannot edit — already ${row.status}` }, 409)
  }
  const db = drizzle(c.env.DB)
  await db
    .update(pendingApprovals)
    .set({
      payloadOverrideJson: JSON.stringify(payload),
      ...(summary !== undefined && { summary }),
    })
    .where(eq(pendingApprovals.id, id))
  return c.json({ success: true })
})

// ─── Approve + execute ────────────────────────────────────────────

const ApproveSchema = z.object({
  note: z.string().max(1000).optional(),
})

app.post('/:id/approve', zValidator('json', ApproveSchema), async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const { note } = c.req.valid('json')
  const row = await loadOwned(c.env.DB, userId, id)
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.status !== 'pending') {
    return c.json({ error: `Already ${row.status}` }, 409)
  }
  const db = drizzle(c.env.DB)
  const now = Math.floor(Date.now() / 1000)
  // Mark approved BEFORE executing — if execute throws, the row's
  // status reflects "approved but failed" rather than "still pending".
  await db
    .update(pendingApprovals)
    .set({
      status: 'approved',
      ...(note !== undefined && { note }),
      resolvedAt: now,
    })
    .where(eq(pendingApprovals.id, id))

  // Resolve the agent binding by class name. Bindings are exposed
  // on env at the upper-case class name (matching the wrangler.jsonc
  // `name` field convention).
  const env = c.env as unknown as ApprovalEnv
  const binding = env[row.agentClass] as DurableObjectNamespace | undefined
  if (!binding) {
    await markFailed(db, id, `Unknown agent class: ${row.agentClass}`)
    return c.json({ error: `Agent binding not found for ${row.agentClass}` }, 503)
  }

  // The payload to execute is the override (if user edited) or the
  // original payload the agent stored.
  const payload = row.payloadOverrideJson
    ? safeParseJson(row.payloadOverrideJson)
    : safeParseJson(row.payloadJson)

  // Cast through unknown — agent classes have varied executeApproved
  // signatures and this is intentionally a string-keyed dispatch.
  // The DO namespace lookup is dynamic-by-string so the SDK's typed
  // Agent constraint can't apply; cast to satisfy getAgentByName.
  type ExecutorAgent = { executeApproved(action: string, payload: unknown): Promise<unknown> }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent = await getAgentByName(binding as any, row.agentName)
    const result = await (agent as unknown as ExecutorAgent).executeApproved(row.action, payload)
    await db
      .update(pendingApprovals)
      .set({
        status: 'executed',
        resultJson: result === undefined ? null : safeStringify(result),
        executedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(pendingApprovals.id, id))
    return c.json({ success: true, status: 'executed', result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await markFailed(db, id, message)
    return c.json({ success: false, status: 'failed', error: message }, 500)
  }
})

// ─── Reject (no execute) ──────────────────────────────────────────

app.post('/:id/reject', zValidator('json', ApproveSchema), async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const { note } = c.req.valid('json')
  const row = await loadOwned(c.env.DB, userId, id)
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.status !== 'pending') {
    return c.json({ error: `Already ${row.status}` }, 409)
  }
  const db = drizzle(c.env.DB)
  await db
    .update(pendingApprovals)
    .set({
      status: 'rejected',
      ...(note !== undefined && { note }),
      resolvedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(pendingApprovals.id, id))
  return c.json({ success: true, status: 'rejected' })
})

// ─── Helpers ──────────────────────────────────────────────────────

async function loadOwned(dbBinding: D1Database, userId: string, id: string) {
  const db = drizzle(dbBinding)
  const [row] = await db
    .select()
    .from(pendingApprovals)
    .where(and(eq(pendingApprovals.id, id), eq(pendingApprovals.userId, userId)))
    .limit(1)
  return row ?? null
}

async function markFailed(db: ReturnType<typeof drizzle>, id: string, message: string) {
  await db
    .update(pendingApprovals)
    .set({
      status: 'failed',
      errorMessage: message,
      executedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(pendingApprovals.id, id))
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return JSON.stringify({ _stringifyError: 'non-serialisable result' })
  }
}

function serialiseApproval(row: typeof pendingApprovals.$inferSelect) {
  return {
    id: row.id,
    agentClass: row.agentClass,
    agentName: row.agentName,
    action: row.action,
    summary: row.summary,
    payload: safeParseJson(row.payloadJson),
    payloadOverride: row.payloadOverrideJson ? safeParseJson(row.payloadOverrideJson) : null,
    status: row.status,
    note: row.note,
    result: row.resultJson ? safeParseJson(row.resultJson) : null,
    error: row.errorMessage,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    executedAt: row.executedAt,
  }
}

export default app
