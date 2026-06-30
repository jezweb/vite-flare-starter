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
import { getActiveOrg } from '@/server/modules/organizations/helpers'
import {
  createRoutine,
  getRoutine,
  listRoutines,
  updateRoutine,
  deleteRoutine,
  adjustRoutineCadence,
} from './storage'
import { fireRoutine } from './scheduler'
import { ROUTINE_TEMPLATES, resolveAgentName } from '@/shared/config/routine-templates'
import { getAgentMetadata } from '@/server/lib/agents/registry'
import { routineRuns } from './db/schema'

/**
 * Force an agent instance name to be owned by `userId` (`<userId>:<slug>`),
 * stripping any caller-supplied owner prefix. A routine fires server-side and
 * the scheduler addresses the DO by this name + calls setOwner(routine.userId);
 * without this, a user could set agentName to `<victimId>:slug` and have the
 * cron fire collide with / overwrite the owner of another tenant's agent DO.
 */
/** Agent-instance slug charset — kebab/snake identifiers only. Keeps DO
 *  instance names clean and rejects malformed input early. */
const AGENT_SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Returns the owner-namespaced DO instance name, or null if the slug is
 * malformed. Cross-tenant targeting is already impossible — the slug is always
 * re-prefixed with the CALLER's userId — but we still validate the slug so
 * DO instance names stay well-formed (defense-in-depth; #95 follow-up).
 */
function ownerScopedAgentName(userId: string, agentName: string): string | null {
  const slug = agentName.includes(':') ? agentName.slice(agentName.indexOf(':') + 1) : agentName
  if (!AGENT_SLUG_RE.test(slug)) return null
  return `${userId}:${slug}`
}

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
  localFireHour: z.number().int().min(0).max(23).nullable().optional(),
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
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const rows = await listRoutines(c.env, userId, orgId)
  return c.json({ total: rows.length, routines: rows })
})

app.post('/', zValidator('json', CreateSchema), async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const body = c.req.valid('json')
  // Only allow targeting a registered agent class — never an arbitrary DO
  // binding name (e.g. ScratchpadMcpAgent, ChatAgent) the user shouldn't drive.
  if (!getAgentMetadata(body['agentClass'])) {
    return c.json({ error: `Unknown agent class: ${body['agentClass']}` }, 400)
  }
  const scopedName = ownerScopedAgentName(userId, body['agentName'])
  if (!scopedName) {
    return c.json({ error: 'Invalid agentName — use letters, numbers, _ or - (max 64)' }, 400)
  }
  const created = await createRoutine(c.env, {
    userId,
    organizationId: orgId,
    name: body['name'],
    ...(body['description'] !== undefined ? { description: body['description'] } : {}),
    agentClass: body['agentClass'],
    agentName: scopedName,
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
    ...(body['localFireHour'] !== undefined ? { localFireHour: body['localFireHour'] } : {}),
  })
  return c.json(created, 201)
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const r = await getRoutine(c.env, c.req.param('id'), userId, orgId)
  if (!r) return c.json({ error: 'Not found' }, 404)
  return c.json(r)
})

app.patch('/:id', zValidator('json', PatchSchema), async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const patch = c.req.valid('json')
  // Same guards as create — a PATCH can change agentClass/agentName too.
  if (patch['agentClass'] !== undefined && !getAgentMetadata(patch['agentClass'])) {
    return c.json({ error: `Unknown agent class: ${patch['agentClass']}` }, 400)
  }
  if (patch['agentName'] !== undefined) {
    const scopedName = ownerScopedAgentName(userId, patch['agentName'])
    if (!scopedName) {
      return c.json({ error: 'Invalid agentName — use letters, numbers, _ or - (max 64)' }, 400)
    }
    patch['agentName'] = scopedName
  }
  const updated = await updateRoutine(c.env, c.req.param('id'), userId, patch, orgId)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  // Verify ownership before delete (DB rule already enforces, but a
  // 404 is friendlier than silent success on someone else's id).
  const existing = await getRoutine(c.env, c.req.param('id'), userId, orgId)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await deleteRoutine(c.env, c.req.param('id'), userId, orgId)
  return c.json({ deleted: true })
})

app.post('/:id/fire', async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const r = await getRoutine(c.env, c.req.param('id'), userId, orgId)
  if (!r) return c.json({ error: 'Not found' }, 404)
  // Fire async — return immediately so the UI can poll runs.
  c.executionCtx.waitUntil(
    fireRoutine(c.env as unknown as { DB: D1Database; [k: string]: unknown }, r).catch((err) =>
      console.error(
        JSON.stringify({ event: 'routine_manual_fire_error', routineId: r.id, error: String(err) })
      )
    )
  )
  return c.json({ status: 'queued' }, 202)
})

app.get('/:id/runs', async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const id = c.req.param('id')
  const r = await getRoutine(c.env, id, userId, orgId)
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
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const results = []
  for (const tpl of ROUTINE_TEMPLATES) {
    try {
      const created = await createRoutine(c.env, {
        userId,
        organizationId: orgId,
        name: tpl.name,
        description: tpl.description,
        agentClass: tpl.agentClass,
        agentName: resolveAgentName(tpl, userId),
        triggerKind: 'schedule' as const,
        baseInterval: tpl.baseInterval,
        adjustMode: tpl.adjustMode,
        enabled: tpl.defaultEnabled,
        inputTemplate: { input: tpl.inputText },
        skillsLoaded: tpl.skillsLoaded,
        toolsAllowed: tpl.toolsAllowed,
        ...(tpl.sessionEndSkill ? { hooks: { SessionEnd: tpl.sessionEndSkill } } : {}),
        ...(tpl.localFireHour !== undefined && tpl.localFireHour !== null
          ? { localFireHour: tpl.localFireHour }
          : {}),
      })
      results.push({ name: tpl.name, id: created.id, status: 'created' })
    } catch (err) {
      results.push({
        name: tpl.name,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return c.json({ seeded: results }, 201)
})

app.post('/:id/cadence', zValidator('json', CadenceSchema), async (c) => {
  const userId = c.get('userId')
  const activeOrg = await getActiveOrg(c)
  const orgId = activeOrg?.organizationId ?? null
  const id = c.req.param('id')
  const r = await getRoutine(c.env, id, userId, orgId)
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
