/**
 * Agent observability — query the agent_runs audit log
 *
 * Routes scoped to the authenticated user (no admin check; users
 * see only their own agent runs). Forks wanting cross-tenant
 * visibility add the admin gate at the route layer.
 *
 * Routes:
 *   GET /api/agent-observability/runs
 *     ?class=&name=&trigger=&outcome=&limit=&since=
 *
 *   GET /api/agent-observability/runs/:id
 *
 *   GET /api/agent-observability/summary
 *     Cost + count per agent class for the user, last 30 days.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { agentRuns } from './db/schema'
import { aiToolCalls } from '@/server/modules/chat/db/schema'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const ListSchema = z.object({
  class: z.string().optional(),
  name: z.string().optional(),
  trigger: z.enum(['rest', 'schedule', 'webhook', 'inter_agent']).optional(),
  outcome: z.enum(['started', 'ok', 'error', 'budget_exceeded']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  /** Unix seconds — only return runs started after this time. */
  since: z.coerce.number().int().optional(),
})

app.get('/runs', zValidator('query', ListSchema), async (c) => {
  const userId = c.get('userId')
  const { class: agentClass, name, trigger, outcome, limit = 100, since } = c.req.valid('query')
  const db = drizzle(c.env.DB)
  const conditions = [eq(agentRuns.userId, userId)]
  if (agentClass) conditions.push(eq(agentRuns.agentClass, agentClass))
  if (name) conditions.push(eq(agentRuns.agentName, name))
  if (trigger) conditions.push(eq(agentRuns.trigger, trigger))
  if (outcome) conditions.push(eq(agentRuns.outcome, outcome))
  if (since) conditions.push(gte(agentRuns.startedAt, since))

  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(...conditions))
    .orderBy(desc(agentRuns.startedAt))
    .limit(limit)
  return c.json({ total: rows.length, runs: rows })
})

app.get('/runs/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const [row] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, id), eq(agentRuns.userId, userId)))
    .limit(1)
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

/**
 * Chart-friendly aggregates. Two series:
 *   - runsByAgent: bar chart "how many runs per agent class"
 *   - costByDay:   area chart "cost trend day by day"
 *
 * Range capped at 90 days so the date-bucket loop on the client stays
 * cheap and queries stay index-only on `agent_runs_started_at_idx`.
 */
const StatsSchema = z.object({
  range: z
    .enum(['7d', '14d', '30d', '90d'])
    .optional()
    .default('7d'),
})

app.get('/stats', zValidator('query', StatsSchema), async (c) => {
  const userId = c.get('userId')
  const { range } = c.req.valid('query')
  const db = drizzle(c.env.DB)

  const days = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 }[range]
  const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60

  const [runsByAgent, costRows] = await Promise.all([
    db
      .select({
        agentClass: agentRuns.agentClass,
        count: sql<number>`COUNT(*)`,
      })
      .from(agentRuns)
      .where(and(eq(agentRuns.userId, userId), gte(agentRuns.startedAt, since)))
      .groupBy(agentRuns.agentClass)
      .orderBy(desc(sql`COUNT(*)`)),
    db
      .select({
        // SQLite epoch-second → ISO date string. Aggregating with strftime
        // is index-friendly when started_at has its dedicated index.
        date: sql<string>`strftime('%Y-%m-%d', ${agentRuns.startedAt}, 'unixepoch')`,
        cost: sql<number | null>`SUM(${agentRuns.costUsd})`,
        runs: sql<number>`COUNT(*)`,
      })
      .from(agentRuns)
      .where(and(eq(agentRuns.userId, userId), gte(agentRuns.startedAt, since)))
      .groupBy(sql`strftime('%Y-%m-%d', ${agentRuns.startedAt}, 'unixepoch')`)
      .orderBy(sql`strftime('%Y-%m-%d', ${agentRuns.startedAt}, 'unixepoch')`),
  ])

  // Fill date gaps so the area chart doesn't compress non-contiguous
  // days. Client charts look weird when the X axis skips empty days.
  const costByDay: Array<{ date: string; cost: number; runs: number }> = []
  const costMap = new Map(costRows.map((r) => [r.date, r]))
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    const iso = d.toISOString().slice(0, 10)
    const found = costMap.get(iso)
    costByDay.push({
      date: iso,
      cost: found?.cost ?? 0,
      runs: found?.runs ?? 0,
    })
  }

  return c.json({
    range,
    sinceSeconds: since,
    runsByAgent,
    costByDay,
  })
})

app.get('/summary', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)
  // Last 30 days, grouped by agent class. SUM(cost_usd) is null-safe
  // — null entries (Workers AI / unpriced) just don't contribute.
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
  // Drizzle doesn't have a typed groupBy that infers the alias columns
  // safely without raw SQL — use a tagged template for the aggregate.
  const rows = await db
    .select({
      agentClass: agentRuns.agentClass,
      runCount: sql<number>`COUNT(*)`,
      totalCostUsd: sql<number | null>`SUM(${agentRuns.costUsd})`,
      totalInputTokens: sql<number>`SUM(${agentRuns.inputTokens})`,
      totalOutputTokens: sql<number>`SUM(${agentRuns.outputTokens})`,
      errorCount: sql<number>`SUM(CASE WHEN ${agentRuns.outcome} = 'error' THEN 1 ELSE 0 END)`,
      // Stuck rows: never moved off 'started'. Surfaces missed final
      // updates (process killed, OOM) that previously hid as 'ok'.
      stuckCount: sql<number>`SUM(CASE WHEN ${agentRuns.outcome} = 'started' THEN 1 ELSE 0 END)`,
    })
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), gte(agentRuns.startedAt, thirtyDaysAgo)))
    .groupBy(agentRuns.agentClass)
    .orderBy(desc(sql`COUNT(*)`))

  return c.json({
    sinceSeconds: thirtyDaysAgo,
    classes: rows,
  })
})

/**
 * GET /tool-usage?range=7d|30d|90d
 *
 * Per-tool usage stats from ai_tool_calls. Surfaces:
 *   - which tools fire most often (validation for the chat-tools audit
 *     finding that 70+ tools had unverified activation rates)
 *   - per-tool error counts (catches silently-broken tools)
 *   - last-used timestamp (catches dead tools that never fire)
 *
 * Per-user (no admin gate — users see their own tool usage). Forks
 * wanting cross-tenant visibility add admin check at route layer.
 */
const ToolUsageSchema = z.object({
  range: z.enum(['7d', '30d', '90d']).optional().default('30d'),
})
app.get('/tool-usage', zValidator('query', ToolUsageSchema), async (c) => {
  const userId = c.get('userId')
  const { range } = c.req.valid('query')
  const days = { '7d': 7, '30d': 30, '90d': 90 }[range]
  const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60
  const sinceDate = new Date(since * 1000)
  const db = drizzle(c.env.DB)

  const rows = await db
    .select({
      toolName: aiToolCalls.toolName,
      count: sql<number>`COUNT(*)`,
      errorCount: sql<number>`SUM(CASE WHEN ${aiToolCalls.toolError} IS NOT NULL THEN 1 ELSE 0 END)`,
      lastUsedAt: sql<string>`MAX(${aiToolCalls.createdAt})`,
      totalCostUsd: sql<number | null>`SUM(${aiToolCalls.costUsd})`,
    })
    .from(aiToolCalls)
    .where(and(eq(aiToolCalls.userId, userId), gte(aiToolCalls.createdAt, sinceDate)))
    .groupBy(aiToolCalls.toolName)
    .orderBy(desc(sql`COUNT(*)`))

  return c.json({
    range,
    sinceSeconds: since,
    tools: rows,
  })
})

export default app
