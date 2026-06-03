/**
 * Inbox routes
 *
 *   GET    /api/inbox            — list items + pending approvals (unified)
 *   GET    /api/inbox/:id        — get one item
 *   PATCH  /api/inbox/:id        — mark read / decide
 *   DELETE /api/inbox/:id        — dismiss (archive)
 *
 * Filters: ?status=unread|undecided|all (default undecided)
 *          ?importance=high|medium|low (optional)
 *
 * The list endpoint joins inbox_items + pending_approvals into a single
 * shape the UI renders uniformly. This is decision A from issue #50:
 * "Approvals folds into Inbox UI as a saved filter — render unified."
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { inboxItems } from './db/schema'
import { pendingApprovals } from '@/server/modules/approvals/db/schema'
import type { InboxImportance, UnifiedRow } from '@/shared/schemas/inbox.schema'

const ListSchema = z.object({
  status: z.enum(['unread', 'undecided', 'all']).optional().default('undecided'),
  importance: z.enum(['high', 'medium', 'low']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

const PatchSchema = z.object({
  read: z.boolean().optional(),
  decided: z.boolean().optional(),
  decisionText: z.string().max(500).optional(),
})

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

app.get('/', zValidator('query', ListSchema), async (c) => {
  const userId = c.get('userId')
  const { status, importance, limit } = c.req.valid('query')
  const db = drizzle(c.env.DB)

  // 1) inbox_items query
  const inboxConds = [eq(inboxItems.userId, userId)]
  if (status === 'unread') inboxConds.push(isNull(inboxItems.readAt))
  if (status === 'undecided') inboxConds.push(isNull(inboxItems.decidedAt))
  if (importance) inboxConds.push(eq(inboxItems.importance, importance as InboxImportance))

  const items = await db
    .select()
    .from(inboxItems)
    .where(and(...inboxConds))
    .orderBy(desc(inboxItems.createdAt))
    .limit(limit)

  // 2) pending_approvals — same user, status=pending unless 'all'
  const approvalsConds = [eq(pendingApprovals.userId, userId)]
  if (status !== 'all') {
    approvalsConds.push(eq(pendingApprovals.status, 'pending'))
  }
  const approvals = await db
    .select()
    .from(pendingApprovals)
    .where(and(...approvalsConds))
    .orderBy(desc(pendingApprovals.createdAt))
    .limit(limit)

  // Project both shapes onto UnifiedRow.
  const rows: UnifiedRow[] = [
    ...items.map((i) => ({
      id: i.id,
      source: 'inbox' as const,
      kind: i.kind,
      summary: i.summary,
      importance: i.importance ?? null,
      agentClass: i.agentClass ?? null,
      createdAt: i.createdAt,
      dueAt: i.dueAt ?? null,
      decidedAt: i.decidedAt ?? null,
      readAt: i.readAt ?? null,
    })),
    ...approvals.map((a) => ({
      id: a.id,
      source: 'approval' as const,
      kind: a.action,
      summary: a.summary || a.action,
      importance: null,
      agentClass: a.agentClass,
      createdAt: a.createdAt,
      dueAt: null,
      decidedAt: a.resolvedAt ?? null,
      readAt: null,
      status: a.status,
    })),
  ]

  // Sort by importance (high first, then medium, then low/null), then by
  // dueAt (sooner first, null last), then by createdAt (newer first).
  const importanceWeight = (i: InboxImportance | null) =>
    i === 'high' ? 0 : i === 'medium' ? 1 : 2
  rows.sort((a, b) => {
    const dw = importanceWeight(a.importance) - importanceWeight(b.importance)
    if (dw !== 0) return dw
    const aDue = a.dueAt ?? Number.MAX_SAFE_INTEGER
    const bDue = b.dueAt ?? Number.MAX_SAFE_INTEGER
    if (aDue !== bDue) return aDue - bDue
    return b.createdAt - a.createdAt
  })

  return c.json({ total: rows.length, items: rows.slice(0, limit) })
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const [row] = await db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, id)))
    .limit(1)
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

app.patch('/:id', zValidator('json', PatchSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const db = drizzle(c.env.DB)
  const updates: Record<string, unknown> = {}
  if (body.read === true) updates['readAt'] = Math.floor(Date.now() / 1000)
  if (body.read === false) updates['readAt'] = null
  if (body.decided === true) updates['decidedAt'] = Math.floor(Date.now() / 1000)
  if (body.decided === false) updates['decidedAt'] = null
  if (body.decisionText !== undefined) updates['decisionText'] = body.decisionText
  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields to update' }, 400)
  }
  await db
    .update(inboxItems)
    .set(updates)
    .where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, id)))
  const [row] = await db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, id)))
    .limit(1)
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  await db.delete(inboxItems).where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, id)))
  return c.json({ deleted: true })
})

// Reference unused helper to silence TS.
void or

export default app
