/**
 * Autonomous Agents — REST surface
 *
 * Per-user persistent assistants. Each user can hold multiple named
 * assistants (e.g. "morning-brief", "research", "writing"); the slug
 * determines the partition. All operations scoped to the
 * authenticated user via `${userId}:${slug}` partitioning.
 *
 * Routes:
 *   POST   /api/autonomous-agents/:slug              — chat (run one turn)
 *   GET    /api/autonomous-agents/:slug              — get status
 *   PATCH  /api/autonomous-agents/:slug/persona      — set persona
 *   PUT    /api/autonomous-agents/:slug/blocks/:name — set / replace a memory block
 *   DELETE /api/autonomous-agents/:slug/blocks/:name — delete a block
 *   POST   /api/autonomous-agents/:slug/schedule     — schedule self-run
 *   DELETE /api/autonomous-agents/:slug/history      — clear conversation
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { getAgentByName } from 'agents'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import type { AssistantAgent } from './assistant-agent'
import type { ResearcherAgent } from './researcher-agent'
import type { SweeperAgent } from './sweeper-agent'

interface AssistantEnv {
  AssistantAgent: DurableObjectNamespace<AssistantAgent>
  ResearcherAgent: DurableObjectNamespace<ResearcherAgent>
  SweeperAgent: DurableObjectNamespace<SweeperAgent>
}

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const SLUG_RE = /^[a-zA-Z0-9_-]+$/
const validSlug = (slug: string) => SLUG_RE.test(slug) && slug.length <= 60

async function getAssistant(env: AssistantEnv, userId: string, slug: string) {
  return getAgentByName(env.AssistantAgent, `${userId}:${slug}`)
}

// ─── Chat ────────────────────────────────────────────────────────

const ChatInputSchema = z.object({
  input: z.string().min(1).max(10_000),
  model: z.string().optional(),
  systemPromptOverride: z.string().max(5000).optional(),
  maxSteps: z.number().int().min(1).max(20).optional(),
})

app.post('/:slug', zValidator('json', ChatInputSchema), async (c) => {
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.AssistantAgent) return c.json({ error: 'AssistantAgent binding not configured' }, 503)

  const agent = await getAssistant(env, userId, slug)
  // Bind owner on first interaction. setOwner is idempotent for the
  // same user; throws on attempted reassignment to a different user.
  await agent.setOwner(userId, slug)
  try {
    const result = await agent.runOnce(c.req.valid('json'))
    return c.json({ slug, ...result })
  } catch (err) {
    // BudgetExceededError surfaces as 429. Distinct status from
    // generic 500 so clients can show a meaningful "agent paused —
    // daily budget reached" message.
    if (err instanceof Error && err.name === 'BudgetExceededError') {
      return c.json({ error: err.message, code: 'budget_exceeded' }, 429)
    }
    throw err
  }
})

// ─── Budget management ───────────────────────────────────────────

const BudgetSchema = z.object({
  dailyUsd: z.number().positive().nullable().describe('Daily USD cap, or null to remove'),
})

app.put('/:slug/budget', zValidator('json', BudgetSchema), async (c) => {
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.AssistantAgent) return c.json({ error: 'AssistantAgent binding not configured' }, 503)

  const agent = await getAssistant(env, userId, slug)
  await agent.setOwner(userId, slug)
  await agent.setDailyBudget(c.req.valid('json').dailyUsd)
  const spent = await agent.todaysSpendUsd()
  return c.json({
    success: true,
    slug,
    dailyUsd: c.req.valid('json').dailyUsd,
    spentToday: spent,
  })
})

// ─── Status / introspection ──────────────────────────────────────

app.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.AssistantAgent) return c.json({ error: 'AssistantAgent binding not configured' }, 503)

  const agent = await getAssistant(env, userId, slug)
  const status = await agent.getStatus()
  // Defensive: if the user is somehow asking about an agent owned by
  // someone else (shouldn't happen with userId-prefixed partitions
  // but belt-and-braces), refuse.
  if (status.userId && status.userId !== userId) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json({ slug, ...status })
})

// ─── Persona ─────────────────────────────────────────────────────

const PersonaSchema = z.object({
  persona: z.string().min(1).max(8000),
})

app.patch('/:slug/persona', zValidator('json', PersonaSchema), async (c) => {
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.AssistantAgent) return c.json({ error: 'AssistantAgent binding not configured' }, 503)

  const agent = await getAssistant(env, userId, slug)
  await agent.setOwner(userId, slug)
  await agent.setPersona(c.req.valid('json').persona)
  return c.json({ success: true, slug })
})

// ─── Blocks ──────────────────────────────────────────────────────

const BlockSchema = z.object({
  value: z.string().max(8000),
})

app.put('/:slug/blocks/:name', zValidator('json', BlockSchema), async (c) => {
  const slug = c.req.param('slug')
  const name = c.req.param('name')
  if (!validSlug(slug) || !validSlug(name))
    return c.json({ error: 'Invalid slug or block name' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.AssistantAgent) return c.json({ error: 'AssistantAgent binding not configured' }, 503)

  const agent = await getAssistant(env, userId, slug)
  await agent.setOwner(userId, slug)
  await agent.setBlock(name, c.req.valid('json').value)
  return c.json({ success: true, slug, name })
})

app.delete('/:slug/blocks/:name', async (c) => {
  const slug = c.req.param('slug')
  const name = c.req.param('name')
  if (!validSlug(slug) || !validSlug(name))
    return c.json({ error: 'Invalid slug or block name' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.AssistantAgent) return c.json({ error: 'AssistantAgent binding not configured' }, 503)

  const agent = await getAssistant(env, userId, slug)
  // setBlock with empty value deletes — single code path on the agent.
  await agent.setBlock(name, '')
  return c.json({ success: true, slug, name })
})

// ─── Schedule self-run ───────────────────────────────────────────

const ScheduleSchema = z.object({
  fireAt: z
    .number()
    .int()
    .refine((t) => t > Date.now() + 1000, 'fireAt must be at least 1 second in the future')
    .refine(
      (t) => t < Date.now() + 365 * 24 * 60 * 60 * 1000,
      'fireAt cannot be more than 1 year out'
    ),
  input: z.string().min(1).max(10_000).optional(),
  model: z.string().optional(),
})

app.post('/:slug/schedule', zValidator('json', ScheduleSchema), async (c) => {
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.AssistantAgent) return c.json({ error: 'AssistantAgent binding not configured' }, 503)

  const { fireAt, input, model } = c.req.valid('json')
  const agent = await getAssistant(env, userId, slug)
  await agent.setOwner(userId, slug)
  const result = await agent.scheduleSelfRun(fireAt, {
    ...(input !== undefined && { input }),
    ...(model !== undefined && { model }),
  })
  return c.json({ slug, ...result, fireAt, fireAtIso: new Date(fireAt).toISOString() })
})

// ─── History ─────────────────────────────────────────────────────

// ─── Multi-agent handoff (researcher + writer) ──────────────────
//
// Worked example of agents-as-tools handoff. Researcher uses
// web_search, then delegates prose to Writer via an inline
// `delegate_to_writer` tool. See researcher-agent.ts for the
// pattern; writer-agent.ts for the receiving end.

const ResearchInputSchema = z.object({
  topic: z.string().min(3).max(2000),
  /** Optional researcher-side model override. Writer's model is
   *  decided per-tool-call by the researcher. */
  model: z.string().optional(),
  maxSteps: z.number().int().min(1).max(20).optional(),
})

app.post('/researcher/:slug', zValidator('json', ResearchInputSchema), async (c) => {
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.ResearcherAgent) return c.json({ error: 'ResearcherAgent binding not configured' }, 503)

  const { topic, model, maxSteps } = c.req.valid('json')
  const researcher = await getAgentByName(env.ResearcherAgent, `${userId}:${slug}`)
  await researcher.setOwner(userId, slug)
  // Cap the loop at 10 by default — research + handoff fits well
  // within that. Higher caps risk runaway tool loops.
  const result = await researcher.runOnce({
    input: `Research and write up: ${topic}`,
    ...(model && { model }),
    maxSteps: maxSteps ?? 10,
  })
  return c.json({ slug, ...result })
})

// ─── Sweeper agent (cron-driven entity processing) ──────────────
//
// Worked example of recurring AutonomousAgent that scans entities
// table for stale items and queues followup approvals. See
// sweeper-agent.ts for the pattern.

const SweeperConfigureSchema = z.object({
  entityType: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  staleAfterDays: z.number().int().min(1).max(365).optional(),
  maxPerSweep: z.number().int().min(1).max(100).optional(),
  intervalSeconds: z
    .number()
    .int()
    .min(60)
    .max(86400 * 7)
    .optional(),
  actionDescription: z.string().min(10).max(2000),
  statusFilter: z
    .array(z.string().regex(/^[a-zA-Z0-9_-]+$/))
    .max(10)
    .optional(),
})

app.post('/sweepers/:slug', zValidator('json', SweeperConfigureSchema), async (c) => {
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.SweeperAgent) return c.json({ error: 'SweeperAgent binding not configured' }, 503)

  const agent = await getAgentByName(env.SweeperAgent, `${userId}:${slug}`)
  await agent.setOwner(userId, slug)
  const result = await agent.configureAndStart(c.req.valid('json'))
  return c.json({ slug, ...result })
})

app.get('/sweepers/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.SweeperAgent) return c.json({ error: 'SweeperAgent binding not configured' }, 503)

  const agent = await getAgentByName(env.SweeperAgent, `${userId}:${slug}`)
  await agent.setOwner(userId, slug)
  const status = await agent.sweepStatus()
  return c.json({ slug, ...status })
})

app.delete('/sweepers/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.SweeperAgent) return c.json({ error: 'SweeperAgent binding not configured' }, 503)

  const agent = await getAgentByName(env.SweeperAgent, `${userId}:${slug}`)
  await agent.setOwner(userId, slug)
  const result = await agent.stop()
  return c.json({ slug, ...result })
})

// Manual fire — useful for testing / immediate sweep without waiting
// for the next scheduled tick.
app.post('/sweepers/:slug/run-now', async (c) => {
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.SweeperAgent) return c.json({ error: 'SweeperAgent binding not configured' }, 503)

  const agent = await getAgentByName(env.SweeperAgent, `${userId}:${slug}`)
  await agent.setOwner(userId, slug)
  const result = await agent.doSweep()
  return c.json({ slug, ...result })
})

app.delete('/:slug/history', async (c) => {
  const slug = c.req.param('slug')
  if (!validSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  const userId = c.get('userId')
  const env = c.env as unknown as AssistantEnv
  if (!env.AssistantAgent) return c.json({ error: 'AssistantAgent binding not configured' }, 503)

  const agent = await getAssistant(env, userId, slug)
  await agent.clearHistory()
  return c.json({ success: true, slug })
})

export default app
