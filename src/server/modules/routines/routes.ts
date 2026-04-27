/**
 * Routines REST routes.
 *
 *   GET    /api/routines                — list user's routines
 *   POST   /api/routines                — create a new routine
 *   GET    /api/routines/:id            — get one routine
 *   PATCH  /api/routines/:id            — update routine config
 *   DELETE /api/routines/:id            — delete (cascades runs + cadence changes)
 *   POST   /api/routines/:id/fire       — manually fire (off-schedule)
 *   GET    /api/routines/:id/runs       — list recent runs
 *   POST   /api/routines/:id/cadence    — propose cadence adjustment
 *
 * The "fire" endpoint reuses the same scheduler.fireRoutine path so
 * manual + cron fires behave identically.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import {
  createRoutine,
  getRoutine,
  listRoutines,
  updateRoutine,
  deleteRoutine,
  adjustRoutineCadence,
} from './storage'
import { fireRoutine } from './scheduler'
import { routineRuns } from './db/schema'

const TriggerKindSchema = z.enum(['schedule', 'webhook', 'event', 'manual'])
const AdjustModeSchema = z.enum(['direct', 'suggested', 'fixed'])

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  agentClass: z.string().min(1).max(80),
  agentName: z.string().min(1).max(120),
  triggerKind: TriggerKindSchema.default('schedule'),
  triggerConfig: z.unknown().optional(),
  inputTemplate: z.unknown().optional(),
  toolsAllowed: z.array(z.string()).optional(),
  skillsLoaded: z.array(z.string()).optional(),
  hooks: z.record(z.string(), z.string()).optional(),
  baseInterval: z.number().int().positive().optional(),
  minInterval: z.number().int().positive().optional(),
  maxInterval: z.number().int().positive().optional(),
  adjustMode: AdjustModeSchema.optional(),
  dailyBudgetUsd: z.number().positive().nullable().optional(),
  enabled: z.boolean().optional(),
})

const PatchSchema = CreateSchema.partial()

const CadenceSchema = z.object({
  proposedSeconds: z.number().int().positive(),
  reason: z.string().max(500).optional(),
})

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

app.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await listRoutines(c.env, userId)
  return c.json({ total: rows.length, routines: rows })
})

app.post('/', zValidator('json', CreateSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const created = await createRoutine(c.env, {
    userId,
    name: body['name'],
    ...(body['description'] !== undefined ? { description: body['description'] } : {}),
    agentClass: body['agentClass'],
    agentName: body['agentName'],
    triggerKind: body['triggerKind'],
    ...(body['triggerConfig'] !== undefined ? { triggerConfig: body['triggerConfig'] } : {}),
    ...(body['inputTemplate'] !== undefined ? { inputTemplate: body['inputTemplate'] } : {}),
    ...(body['toolsAllowed'] !== undefined ? { toolsAllowed: body['toolsAllowed'] } : {}),
    ...(body['skillsLoaded'] !== undefined ? { skillsLoaded: body['skillsLoaded'] } : {}),
    ...(body['hooks'] !== undefined ? { hooks: body['hooks'] } : {}),
    ...(body['baseInterval'] !== undefined ? { baseInterval: body['baseInterval'] } : {}),
    ...(body['minInterval'] !== undefined ? { minInterval: body['minInterval'] } : {}),
    ...(body['maxInterval'] !== undefined ? { maxInterval: body['maxInterval'] } : {}),
    ...(body['adjustMode'] !== undefined ? { adjustMode: body['adjustMode'] } : {}),
    ...(body['dailyBudgetUsd'] !== undefined ? { dailyBudgetUsd: body['dailyBudgetUsd'] } : {}),
    ...(body['enabled'] !== undefined ? { enabled: body['enabled'] } : {}),
  })
  return c.json(created, 201)
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const r = await getRoutine(c.env, c.req.param('id'), userId)
  if (!r) return c.json({ error: 'Not found' }, 404)
  return c.json(r)
})

app.patch('/:id', zValidator('json', PatchSchema), async (c) => {
  const userId = c.get('userId')
  const patch = c.req.valid('json')
  const updated = await updateRoutine(c.env, c.req.param('id'), userId, patch)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  // Verify ownership before delete (DB rule already enforces, but a
  // 404 is friendlier than silent success on someone else's id).
  const existing = await getRoutine(c.env, c.req.param('id'), userId)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await deleteRoutine(c.env, c.req.param('id'), userId)
  return c.json({ deleted: true })
})

app.post('/:id/fire', async (c) => {
  const userId = c.get('userId')
  const r = await getRoutine(c.env, c.req.param('id'), userId)
  if (!r) return c.json({ error: 'Not found' }, 404)
  // Fire async — return immediately so the UI can poll runs.
  c.executionCtx.waitUntil(
    fireRoutine(c.env as unknown as { DB: D1Database; [k: string]: unknown }, r).catch((err) =>
      console.error(JSON.stringify({ event: 'routine_manual_fire_error', routineId: r.id, error: String(err) })),
    ),
  )
  return c.json({ status: 'queued' }, 202)
})

app.get('/:id/runs', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const r = await getRoutine(c.env, id, userId)
  if (!r) return c.json({ error: 'Not found' }, 404)
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200)
  const db = drizzle(c.env.DB)
  const runs = await db
    .select()
    .from(routineRuns)
    .where(eq(routineRuns.routineId, id))
    .orderBy(desc(routineRuns.runNumber))
    .limit(limit)
  return c.json({ total: runs.length, runs })
})

app.post('/seed-examples', async (c) => {
  const userId = c.get('userId')
  const examples = [
    {
      name: 'Routine health (meta)',
      description:
        "Daily watcher that scans every other routine for error rates, drift, and runaway cost. Surfaces issues into your Inbox so you don't have to remember to check.",
      agentClass: 'AssistantAgent',
      agentName: `routine-health-${userId.slice(0, 8)}`,
      triggerKind: 'schedule' as const,
      baseInterval: 24 * 60 * 60, // daily
      adjustMode: 'fixed' as const,
      enabled: false,
      inputTemplate: {
        input:
          'Run a routine health check. Look at the recent runs of all my routines and emit inbox_add findings for any that need attention. Skip if everything is healthy.',
      },
      skillsLoaded: ['routine-health-check', 'score-importance'],
      toolsAllowed: ['inbox_add', 'find_tools'],
      hooks: { SessionEnd: 'route-finding' },
    },
    {
      name: 'YouTube digest (example)',
      description:
        "Watches a Google Chat space for YouTube links, fetches transcripts, summarises, and posts back. Wire your own Google Chat connector + space id to use it.",
      agentClass: 'AssistantAgent',
      agentName: `youtube-digest-${userId.slice(0, 8)}`,
      triggerKind: 'schedule' as const,
      baseInterval: 6 * 60 * 60, // every 6h
      adjustMode: 'suggested' as const,
      enabled: false, // disabled by default — needs user to wire connectors
      inputTemplate: {
        input:
          'Look at the last 24h of messages in my designated Google Chat space. For any YouTube links, fetch the transcript, write a 3-bullet summary, post it back to the space, and emit an inbox_add finding for me with the summary.',
      },
      skillsLoaded: ['summarise-url', 'route-finding'],
      hooks: { SessionEnd: 'route-finding' },
    },
  ]

  const results = []
  for (const ex of examples) {
    try {
      const created = await createRoutine(c.env, { userId, ...ex })
      results.push({ name: ex.name, id: created.id, status: 'created' })
    } catch (err) {
      results.push({
        name: ex.name,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return c.json({ seeded: results }, 201)
})

app.post('/:id/cadence', zValidator('json', CadenceSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const r = await getRoutine(c.env, id, userId)
  if (!r) return c.json({ error: 'Not found' }, 404)
  const { proposedSeconds, reason } = c.req.valid('json')
  const result = await adjustRoutineCadence(c.env, {
    routineId: id,
    proposed: proposedSeconds,
    ...(reason ? { reason } : {}),
  })
  return c.json(result)
})

// Reference unused helper to silence TS6133 in stricter modes.
void and

export default app
