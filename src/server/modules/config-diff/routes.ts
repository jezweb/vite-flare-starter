/**
 * config-diff routes — the user-facing API for staged config changes.
 *
 *   POST   /               create a proposal (user-initiated)
 *   GET    /:id            fetch a proposal by id
 *   GET    /for-resource   list proposals for a resource (audit trail)
 *   POST   /:id/apply      approve + execute
 *   POST   /:id/reject     reject
 *
 * The chat agent's `propose_patch` tool calls `createProposal` directly
 * from its execute function — it does NOT go through these HTTP routes.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import type { ConfigDiffKind } from '@/shared/config/diff-proposal'
import { applyProposal, loadCurrentContent } from './apply'
import {
  createProposal,
  getProposal,
  listProposalsForResource,
  markProposal,
} from './storage'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const kindSchema = z.enum([
  'skill',
  'system-prompt',
  'setting',
  'connector-tool-policy',
]) satisfies z.ZodType<ConfigDiffKind>

const createSchema = z.object({
  resource: z.object({
    kind: kindSchema,
    id: z.string().min(1),
    label: z.string().min(1),
  }),
  after: z.string(),
  summary: z.string().min(1).max(500),
  reason: z.string().optional().nullable(),
  format: z.enum(['markdown', 'json', 'yaml', 'plain']).optional(),
})

app.post('/', zValidator('json', createSchema), async (c) => {
  const input = c.req.valid('json')
  const userId = c.get('userId')
  const before = await loadCurrentContent(
    c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket },
    input.resource,
  )
  if (before === input.after) {
    return c.json(
      { error: 'No changes — before and after are identical.' },
      400,
    )
  }
  const proposal = await createProposal(c.env.DB, userId, {
    resource: input.resource,
    before,
    after: input.after,
    summary: input.summary,
    reason: input.reason ?? null,
    format: input.format ?? 'markdown',
    createdBy: { type: 'user', userId },
  })
  return c.json({ proposal }, 201)
})

app.get('/for-resource', async (c) => {
  const kind = c.req.query('kind') as ConfigDiffKind | undefined
  const id = c.req.query('id')
  if (!kind || !id) {
    return c.json({ error: 'kind and id query params required' }, 400)
  }
  const userId = c.get('userId')
  const items = await listProposalsForResource(c.env.DB, userId, { kind, id })
  return c.json({ proposals: items, count: items.length })
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const proposal = await getProposal(c.env.DB, userId, c.req.param('id'))
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)
  return c.json({ proposal })
})

app.post('/:id/apply', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const existing = await getProposal(c.env.DB, userId, id)
  if (!existing) return c.json({ error: 'Proposal not found' }, 404)
  if (existing.status !== 'pending') {
    return c.json(
      { error: `Proposal already ${existing.status}.`, proposal: existing },
      409,
    )
  }
  try {
    await applyProposal(
      c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket },
      existing,
    )
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    )
  }
  const updated = await markProposal(c.env.DB, userId, id, 'applied')
  return c.json({ proposal: updated })
})

app.post('/:id/reject', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const existing = await getProposal(c.env.DB, userId, id)
  if (!existing) return c.json({ error: 'Proposal not found' }, 404)
  if (existing.status !== 'pending') {
    return c.json(
      { error: `Proposal already ${existing.status}.`, proposal: existing },
      409,
    )
  }
  const updated = await markProposal(c.env.DB, userId, id, 'rejected')
  return c.json({ proposal: updated })
})

export default app
