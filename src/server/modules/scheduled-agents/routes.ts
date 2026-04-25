/**
 * Scheduled Agents — REST surface
 *
 * Companion to the ReminderAgent worked example. Demonstrates the
 * canonical pattern for talking to a Cloudflare `agents` SDK Agent
 * from a Hono route:
 *
 *   1. Get a typed agent stub via `getAgentByName(env.MyAgent, partition)`
 *   2. Call `@callable` methods on the stub (RPC over the DO transport)
 *
 * The same shape generalises to any Agent subclass — point at a
 * different binding and you get the same admin surface for free.
 *
 * Routes:
 *   POST   /api/scheduled-agents/reminders
 *     { message, title?, link?, fireAt: <ms>, slug? }
 *
 *   GET    /api/scheduled-agents/reminders/:slug
 *     Lists pending reminders for the authenticated user's partition.
 *
 *   DELETE /api/scheduled-agents/reminders/:slug/:scheduleId
 *     Cancels a specific scheduled reminder.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { getAgentByName } from 'agents'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import type { ReminderAgent, ReminderPayload, ReminderInfo } from './reminder-agent'

interface SchedulerEnv {
  ReminderAgent: DurableObjectNamespace<ReminderAgent>
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
  /** Slot name for the reminder. Lets one user hold multiple active
   *  reminders ("morning-news", "evening-tasks"). Defaults to a UUID. */
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
})

/** Resolve the per-user agent stub. Each `${userId}:${slug}` partition
 *  maps to one DO instance — same partition = same agent across calls. */
async function getReminderAgent(env: SchedulerEnv, userId: string, slug: string) {
  const partition = `${userId}:${slug}`
  // getAgentByName returns a typed RPC stub. Methods marked `@callable`
  // on the agent class are directly callable over this stub.
  return getAgentByName(env.ReminderAgent, partition)
}

app.post('/reminders', zValidator('json', ScheduleReminderSchema), async (c) => {
  const userId = c.get('userId')
  const { message, title, link, fireAt, slug } = c.req.valid('json')
  const env = c.env as unknown as SchedulerEnv
  if (!env.ReminderAgent) return c.json({ error: 'ReminderAgent binding not configured' }, 503)

  const finalSlug = slug ?? crypto.randomUUID()
  const agent = await getReminderAgent(env, userId, finalSlug)
  const payload: ReminderPayload = { message, userId, ...(title && { title }), ...(link && { link }) }
  const result = await agent.scheduleReminder(fireAt, payload)

  return c.json({
    success: true,
    slug: finalSlug,
    scheduleId: result.scheduleId,
    fireAt: result.fireAt,
    fireAtIso: new Date(result.fireAt).toISOString(),
  })
})

app.get('/reminders/:slug', async (c) => {
  const userId = c.get('userId')
  const slug = c.req.param('slug')
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const env = c.env as unknown as SchedulerEnv
  if (!env.ReminderAgent) return c.json({ error: 'ReminderAgent binding not configured' }, 503)

  const agent = await getReminderAgent(env, userId, slug)
  const pending: ReminderInfo[] = await agent.listPendingReminders()
  return c.json({
    slug,
    pending: pending.map((p) => ({
      id: p.id,
      fireAt: p.fireAt,
      fireAtIso: new Date(p.fireAt).toISOString(),
      payload: p.payload,
    })),
    count: pending.length,
  })
})

app.delete('/reminders/:slug/:scheduleId', async (c) => {
  const userId = c.get('userId')
  const slug = c.req.param('slug')
  const scheduleId = c.req.param('scheduleId')
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const env = c.env as unknown as SchedulerEnv
  if (!env.ReminderAgent) return c.json({ error: 'ReminderAgent binding not configured' }, 503)

  const agent = await getReminderAgent(env, userId, slug)
  const result = await agent.cancelReminder(scheduleId)
  return c.json({ success: result.cancelled, slug, scheduleId })
})

export default app
