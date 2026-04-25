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

interface AssistantEnv {
  AssistantAgent: DurableObjectNamespace<AssistantAgent>
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
  const result = await agent.runOnce(c.req.valid('json'))
  return c.json({ slug, ...result })
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
  if (!validSlug(slug) || !validSlug(name)) return c.json({ error: 'Invalid slug or block name' }, 400)
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
  if (!validSlug(slug) || !validSlug(name)) return c.json({ error: 'Invalid slug or block name' }, 400)
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
    .refine((t) => t < Date.now() + 365 * 24 * 60 * 60 * 1000, 'fireAt cannot be more than 1 year out'),
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
