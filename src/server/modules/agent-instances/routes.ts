/**
 * Agent instances — list / read / edit per-user agent state.
 *
 * Per-user agent INSTANCES live as Durable Objects partitioned by
 * `${userId}:${name}`. Their state (persona, modelId, dailyBudgetUsd,
 * blocks) lives in DO storage — not in the main D1 database.
 *
 * To LIST a user's instances, we query `agent_runs` for the distinct
 * (agentClass, agentName) tuples that user has run. That covers the
 * "agents I've actually used" set. Untouched-but-defined classes are
 * visible via /api/agents/registered (the catalogue).
 *
 * To READ one instance's state, we resolve the DO via `getAgentByName`
 * and call its `getStatus()` RPC method (already exposed on
 * AutonomousAgent base).
 *
 * To EDIT, we call `setPersona() / setModel() / setDailyBudget()` on
 * the same RPC stub.
 *
 *   GET    /api/agent-instances                — list user's instances + state
 *   GET    /api/agent-instances/:class/:name   — one instance with full state
 *   PATCH  /api/agent-instances/:class/:name   — edit persona / model / budget
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { getAgentByName } from 'agents'
import { drizzle } from 'drizzle-orm/d1'
import { eq, sql } from 'drizzle-orm'

import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { agentRuns } from '@/server/modules/agent-observability/db/schema'
import { getAgentMetadata, listRegisteredAgents } from '@/server/lib/agents/registry'
import type { AssistantAgent } from '@/server/modules/autonomous-agents/assistant-agent'
import type { ResearcherAgent } from '@/server/modules/autonomous-agents/researcher-agent'
import type { WriterAgent } from '@/server/modules/autonomous-agents/writer-agent'
import type { SweeperAgent } from '@/server/modules/autonomous-agents/sweeper-agent'
import type { AdminAgent } from '@/server/modules/autonomous-agents/admin-agent'

interface AgentInstancesEnv {
  AssistantAgent?: DurableObjectNamespace<AssistantAgent>
  ResearcherAgent?: DurableObjectNamespace<ResearcherAgent>
  WriterAgent?: DurableObjectNamespace<WriterAgent>
  SweeperAgent?: DurableObjectNamespace<SweeperAgent>
  AdminAgent?: DurableObjectNamespace<AdminAgent>
  DB: D1Database
}

/**
 * Dispatch agentClass string → DurableObjectNamespace binding. Switch
 * statement (not dynamic env[class]) so missing bindings surface a
 * clear error instead of "undefined.idFromName" cryptic crash. Returns
 * the union widened to AutonomousAgentRpc — sufficient for management
 * RPCs (getStatus / setPersona / setModel / setDailyBudget).
 */
function getNamespace(
  env: AgentInstancesEnv,
  agentClass: string
): DurableObjectNamespace<AssistantAgent> | undefined {
  // All AutonomousAgent subclasses share the management RPC methods we
  // call (getStatus / setOwner / setPersona / setModel / setDailyBudget).
  // We cast through `unknown` to AssistantAgent's namespace type — that
  // type satisfies getAgentByName's `Agent<Env, ...>` constraint and the
  // RPC stub will resolve to a real method on whichever class is bound.
  // The cast is sound because we never call subclass-only methods here.
  let ns: unknown
  switch (agentClass) {
    case 'AssistantAgent':
      ns = env.AssistantAgent
      break
    case 'ResearcherAgent':
      ns = env.ResearcherAgent
      break
    case 'WriterAgent':
      ns = env.WriterAgent
      break
    case 'SweeperAgent':
      ns = env.SweeperAgent
      break
    case 'AdminAgent':
      ns = env.AdminAgent
      break
    default:
      return undefined
  }
  return ns as DurableObjectNamespace<AssistantAgent> | undefined
}

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

// ─── List ───────────────────────────────────────────────────────────

/**
 * Default slug per registered class for dormant placeholders. The
 * convention is lowercase-class-name minus the `Agent` suffix:
 *
 *   AssistantAgent → assistant   (matches existing `${userId}:assistant`)
 *   ResearcherAgent → researcher
 *   WriterAgent → writer         (matches researcher delegate slug)
 *   SweeperAgent → sweeper
 *   AdminAgent → admin           (matches /api/admin-agent/ensure-space)
 */
function defaultSlugForClass(className: string): string {
  return className.replace(/Agent$/, '').toLowerCase()
}

app.get('/', async (c) => {
  const userId = c.get('userId')
  const env = c.env as unknown as AgentInstancesEnv
  const db = drizzle(env.DB)

  // Distinct (agentClass, agentName) for this user — these are
  // ACTIVE instances (have run at least once). Run/cost/last-run summary
  // joined so the UI can sort by recency.
  const activeRows = await db
    .select({
      agentClass: agentRuns.agentClass,
      agentName: agentRuns.agentName,
      runs: sql<number>`COUNT(*)`,
      totalCostUsd: sql<number | null>`SUM(${agentRuns.costUsd})`,
      lastRunAt: sql<number>`MAX(${agentRuns.startedAt})`,
    })
    .from(agentRuns)
    .where(eq(agentRuns.userId, userId))
    .groupBy(agentRuns.agentClass, agentRuns.agentName)
    .orderBy(sql`MAX(${agentRuns.startedAt}) DESC`)

  // Augment each row with current DO state via RPC. Best-effort —
  // a stale row whose namespace binding was removed returns the row
  // sans state rather than failing the whole list.
  const activeInstances = await Promise.all(
    activeRows.map(async (r) => {
      const ns = getNamespace(env, r.agentClass)
      const meta = getAgentMetadata(r.agentClass)
      const base = {
        agentClass: r.agentClass,
        agentName: r.agentName,
        displayName: meta?.displayName ?? r.agentClass,
        description: meta?.description ?? '',
        ...(meta?.userPurpose ? { userPurpose: meta.userPurpose } : {}),
        category: meta?.category ?? 'general',
        runs: r.runs,
        totalCostUsd: r.totalCostUsd,
        lastRunAt: r.lastRunAt,
        dormant: false as const,
      }
      if (!ns) return { ...base, state: null }
      try {
        const stub = await getAgentByName(ns, `${userId}:${r.agentName}`)
        const status = await stub.getStatus()
        return { ...base, state: status }
      } catch (err) {
        return {
          ...base,
          state: null,
          stateError: err instanceof Error ? err.message : String(err),
        }
      }
    })
  )

  // Dormant: registered classes with NO active instance for this user.
  // Surfaced so the UI can show one unified card grid (active + dormant)
  // instead of separate "My agents" / "All classes" tabs. Saving on a
  // dormant card from the edit sheet creates the DO via setOwner.
  const activeClasses = new Set(activeInstances.map((i) => i.agentClass))
  const dormantInstances = listRegisteredAgents()
    .filter((cls) => !activeClasses.has(cls.className))
    .map((cls) => ({
      agentClass: cls.className,
      agentName: defaultSlugForClass(cls.className),
      displayName: cls.displayName,
      description: cls.description,
      ...(cls.userPurpose ? { userPurpose: cls.userPurpose } : {}),
      category: cls.category,
      runs: 0,
      totalCostUsd: null as number | null,
      lastRunAt: 0,
      state: null,
      dormant: true as const,
    }))

  return c.json({
    total: activeInstances.length + dormantInstances.length,
    instances: [...activeInstances, ...dormantInstances],
  })
})

// ─── Read one ───────────────────────────────────────────────────────

const ParamsSchema = z.object({
  class: z.string().min(1),
  name: z.string().min(1),
})

app.get('/:class/:name', async (c) => {
  const userId = c.get('userId')
  const params = ParamsSchema.parse({ class: c.req.param('class'), name: c.req.param('name') })
  const env = c.env as unknown as AgentInstancesEnv
  const ns = getNamespace(env, params.class)
  if (!ns) return c.json({ error: `Unknown agentClass: ${params.class}` }, 404)
  try {
    const stub = await getAgentByName(ns, `${userId}:${params.name}`)
    const status = await stub.getStatus()
    return c.json({
      agentClass: params.class,
      agentName: params.name,
      state: status,
      metadata: getAgentMetadata(params.class),
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

// ─── Edit ───────────────────────────────────────────────────────────

const PatchSchema = z.object({
  persona: z.string().min(1).max(20_000).optional(),
  modelId: z.string().min(1).max(120).optional(),
  dailyBudgetUsd: z.number().positive().nullable().optional(),
})

app.patch('/:class/:name', zValidator('json', PatchSchema), async (c) => {
  const userId = c.get('userId')
  const params = ParamsSchema.parse({ class: c.req.param('class'), name: c.req.param('name') })
  const patch = c.req.valid('json')
  const env = c.env as unknown as AgentInstancesEnv
  const ns = getNamespace(env, params.class)
  if (!ns) return c.json({ error: `Unknown agentClass: ${params.class}` }, 404)
  try {
    const stub = await getAgentByName(ns, `${userId}:${params.name}`)
    // Ensure the agent is owned — first-touch path. setOwner is
    // idempotent for the same user.
    await stub.setOwner(userId, params.name)
    if (patch.persona !== undefined) await stub.setPersona(patch.persona)
    if (patch.modelId !== undefined) await stub.setModel(patch.modelId)
    if (patch.dailyBudgetUsd !== undefined) await stub.setDailyBudget(patch.dailyBudgetUsd)
    const status = await stub.getStatus()
    return c.json({ ok: true, state: status })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

export default app
