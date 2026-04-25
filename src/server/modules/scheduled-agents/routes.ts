/**
 * Scheduled Agents — REST surface
 *
 * Companion to the ReminderAgent worked example. The same shape
 * generalises to any ScheduledAgent subclass — point the routes at a
 * different DO binding and you get the same admin surface for free.
 *
 * Routes:
 *   POST   /api/scheduled-agents/reminders
 *     { message, title?, link?, fireAt: <ms> }
 *     Schedules a reminder for the authenticated user.
 *
 *   GET    /api/scheduled-agents/reminders/:slug/status
 *     Returns the current schedule state (if any) for a named slot.
 *
 *   DELETE /api/scheduled-agents/reminders/:slug
 *     Cancels a pending reminder.
 *
 *   GET    /api/scheduled-agents/runs
 *     ?className=&limit=&onlyErrors=
 *     Lists recent run telemetry. Scoped to the authenticated user.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { scheduledRuns } from './db/schema'

interface SchedulerEnv {
  ReminderAgent: DurableObjectNamespace
}

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const ScheduleReminderSchema = z.object({
  message: z.string().min(1).max(500),
  title: z.string().min(1).max(120).optional(),
  link: z.string().min(1).max(500).optional(),
  /** Unix ms timestamp. Must be in the future. Capped at 1 year out. */
  fireAt: z
    .number()
    .int()
    .refine((t) => t > Date.now() + 1000, 'fireAt must be at least 1 second in the future')
    .refine((t) => t < Date.now() + 365 * 24 * 60 * 60 * 1000, 'fireAt cannot be more than 1 year out'),
  /** Optional slot name for the reminder. Lets the user have multiple
   *  active reminders (e.g. "morning-news", "evening-tasks"). Defaults
   *  to a UUID. */
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
})

app.post('/reminders', zValidator('json', ScheduleReminderSchema), async (c) => {
  const userId = c.get('userId')
  const { message, title, link, fireAt, slug } = c.req.valid('json')
  const env = c.env as unknown as SchedulerEnv
  if (!env.ReminderAgent) return c.json({ error: 'ReminderAgent binding not configured' }, 503)

  const finalSlug = slug ?? crypto.randomUUID()
  const partition = `${userId}:${finalSlug}`
  const id = env.ReminderAgent.idFromName(partition)
  const stub = env.ReminderAgent.get(id) as unknown as {
    schedule: (when: number, payload: { message: string; title?: string; link?: string }, opts?: { userId?: string }) => Promise<void>
  }
  await stub.schedule(fireAt, { message, title, link }, { userId })

  return c.json({
    success: true,
    slug: finalSlug,
    fireAt,
    fireAtIso: new Date(fireAt).toISOString(),
  })
})

app.get('/reminders/:slug/status', async (c) => {
  const userId = c.get('userId')
  const slug = c.req.param('slug')
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const env = c.env as unknown as SchedulerEnv
  if (!env.ReminderAgent) return c.json({ error: 'ReminderAgent binding not configured' }, 503)

  const partition = `${userId}:${slug}`
  const id = env.ReminderAgent.idFromName(partition)
  const stub = env.ReminderAgent.get(id) as unknown as {
    getSchedule: () => Promise<{ scheduledAt: number | null; state: { attempt: number; payload: unknown } | null }>
  }
  const schedule = await stub.getSchedule()
  return c.json({
    slug,
    scheduledAt: schedule.scheduledAt,
    scheduledAtIso: schedule.scheduledAt ? new Date(schedule.scheduledAt).toISOString() : null,
    pending: !!schedule.scheduledAt,
    attempt: schedule.state?.attempt ?? null,
    payload: schedule.state?.payload ?? null,
  })
})

app.delete('/reminders/:slug', async (c) => {
  const userId = c.get('userId')
  const slug = c.req.param('slug')
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const env = c.env as unknown as SchedulerEnv
  if (!env.ReminderAgent) return c.json({ error: 'ReminderAgent binding not configured' }, 503)

  const partition = `${userId}:${slug}`
  const id = env.ReminderAgent.idFromName(partition)
  const stub = env.ReminderAgent.get(id) as unknown as { cancel: () => Promise<void> }
  await stub.cancel()
  return c.json({ success: true, slug })
})

app.get('/runs', async (c) => {
  const userId = c.get('userId')
  const className = c.req.query('className')
  const onlyErrors = c.req.query('onlyErrors') === '1' || c.req.query('onlyErrors') === 'true'
  const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200)

  const db = drizzle(c.env.DB)
  const conditions = [eq(scheduledRuns.userId, userId)]
  if (className) conditions.push(eq(scheduledRuns.className, className))
  // SQL: outcome IN ('error', 'final_error') — Drizzle's `inArray`
  // works but for two values an OR via two eq's keeps the index path
  // simpler. We use the `outcome != 'ok'` shape via a raw fragment.
  const rows = await db
    .select()
    .from(scheduledRuns)
    .where(and(...conditions))
    .orderBy(desc(scheduledRuns.firedAt))
    .limit(limit)

  const filtered = onlyErrors ? rows.filter((r) => r.outcome !== 'ok') : rows
  return c.json({
    total: filtered.length,
    runs: filtered.map((r) => ({
      id: r.id,
      className: r.className,
      name: r.name,
      scheduledAt: r.scheduledAt,
      firedAt: r.firedAt,
      durationMs: r.durationMs,
      outcome: r.outcome,
      attempt: r.attempt,
      errorMessage: r.errorMessage,
      result: r.resultJson ? JSON.parse(r.resultJson) : null,
    })),
  })
})

export default app
