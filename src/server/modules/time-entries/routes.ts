/**
 * Time Entries API (#62(3)) — polymorphic time tracking
 *
 * Routes (mounted at /api/time-entries):
 *   GET    /?entityType=&entityId=  — entries + totals for one record
 *   GET    /mine?from=&to=          — the caller's own timesheet rows
 *   POST   /                        — log time
 *   DELETE /:id                     — delete own entry
 *
 * Access mirrors comments: reading/logging against a record requires
 * `canAccessEntity` (the polymorphic IDOR gate from #95), so entries
 * follow the record's visibility in both tenancy modes. Entries
 * themselves are personal facts — only their author can delete them,
 * in every mode.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { canAccessEntity } from '@/server/lib/entity-access'
import { user } from '@/server/modules/auth/db/schema'
import { timeEntries } from './db/schema'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const EntityQuery = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
})

app.get('/', zValidator('query', EntityQuery), async (c) => {
  const { entityType, entityId } = c.req.valid('query')
  if (!(await canAccessEntity(c.env, entityType, entityId, c.get('userId')))) {
    return c.json({ error: 'Not found' }, 404)
  }
  const db = drizzle(c.env.DB)
  const rows = await db
    .select({
      id: timeEntries.id,
      userId: timeEntries.userId,
      durationMinutes: timeEntries.durationMinutes,
      description: timeEntries.description,
      date: timeEntries.date,
      billable: timeEntries.billable,
      createdAt: timeEntries.createdAt,
      userName: user.name,
    })
    .from(timeEntries)
    .leftJoin(user, eq(timeEntries.userId, user.id))
    .where(and(eq(timeEntries.entityType, entityType), eq(timeEntries.entityId, entityId)))
    .orderBy(desc(timeEntries.date), desc(timeEntries.createdAt))
    .limit(200)

  const totalMinutes = rows.reduce((sum, r) => sum + r.durationMinutes, 0)
  const billableMinutes = rows.reduce((sum, r) => sum + (r.billable ? r.durationMinutes : 0), 0)
  return c.json({ entries: rows, totalMinutes, billableMinutes })
})

/** The caller's own rows across all records — timesheet exports/views. */
const MineQuery = z.object({
  from: z.string().regex(ISO_DATE_RE).optional(),
  to: z.string().regex(ISO_DATE_RE).optional(),
})

app.get('/mine', zValidator('query', MineQuery), async (c) => {
  const userId = c.get('userId')
  const { from, to } = c.req.valid('query')
  const db = drizzle(c.env.DB)
  const conditions = [eq(timeEntries.userId, userId)]
  if (from) conditions.push(gte(timeEntries.date, from))
  if (to) conditions.push(lte(timeEntries.date, to))
  const rows = await db
    .select()
    .from(timeEntries)
    .where(and(...conditions))
    .orderBy(desc(timeEntries.date), desc(timeEntries.createdAt))
    .limit(500)
  const [totals] = await db
    .select({
      totalMinutes: sql<number>`COALESCE(SUM(${timeEntries.durationMinutes}), 0)`,
      billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN ${timeEntries.durationMinutes} ELSE 0 END), 0)`,
    })
    .from(timeEntries)
    .where(and(...conditions))
  return c.json({ entries: rows, ...totals })
})

const CreateSchema = z.object({
  entityType: z.string().min(1).max(50),
  entityId: z.string().min(1).max(128),
  durationMinutes: z.number().int().min(1).max(24 * 60),
  description: z.string().max(1000).optional(),
  /** Defaults to today (UTC) when omitted. */
  date: z.string().regex(ISO_DATE_RE).optional(),
  billable: z.boolean().optional(),
})

app.post('/', zValidator('json', CreateSchema), async (c) => {
  const userId = c.get('userId')
  const input = c.req.valid('json')
  if (!(await canAccessEntity(c.env, input.entityType, input.entityId, userId))) {
    return c.json({ error: 'Not found' }, 404)
  }
  const db = drizzle(c.env.DB)
  const [entry] = await db
    .insert(timeEntries)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      userId,
      durationMinutes: input.durationMinutes,
      description: input.description ?? null,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      billable: input.billable ?? false,
    })
    .returning()
  return c.json({ entry }, 201)
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  // Author-only in every tenancy mode — an entry is a personal fact.
  const [existing] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)))
    .limit(1)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.delete(timeEntries).where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)))
  return c.json({ deleted: true })
})

export default app
