/**
 * mirror routes — admin surface for the D1 mirror pattern (issue #90).
 *
 *   GET  /api/mirror          — freshness summary + first rows (admin)
 *   POST /api/mirror/refresh  — kick a sync Workflow now (admin)
 *
 * Reads of the mirrored data itself belong in YOUR domain routes / agent
 * tools (e.g. a read-only SQL tool over reference data, issue #77) — this
 * module only manages the sync.
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { desc } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { adminMiddleware } from '@/server/middleware/admin'
import { mirrorRecords } from './db/schema'
import { mirrorFreshness } from './workflow'

// Binding is optional — forks that don't want the pattern just don't add
// the workflows[] entry; routes then 503 instead of crashing at import.
interface MirrorWorkflowInstance {
  id: string
  status(): Promise<{ status: string; error?: unknown; output?: unknown }>
}
interface MirrorEnv {
  DB: D1Database
  MIRROR_WORKFLOW?: {
    create(options?: { params?: unknown }): Promise<MirrorWorkflowInstance>
    get(id: string): Promise<MirrorWorkflowInstance>
  }
}

const app = new Hono<AuthContext & { Bindings: MirrorEnv }>()
app.use('*', authMiddleware)
app.use('*', adminMiddleware)

app.get('/', async (c) => {
  const freshness = await mirrorFreshness(c.env.DB)
  const db = drizzle(c.env.DB)
  const rows = await db
    .select()
    .from(mirrorRecords)
    .orderBy(desc(mirrorRecords.syncedAt))
    .limit(10)
  return c.json({
    ...freshness,
    workflowConfigured: !!c.env.MIRROR_WORKFLOW,
    sample: rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) })),
  })
})

// Poll a sync run kicked by /refresh — surfaces step errors that would
// otherwise only exist in the Workflows dashboard.
app.get('/status/:instanceId', async (c) => {
  if (!c.env.MIRROR_WORKFLOW) {
    return c.json({ error: 'MIRROR_WORKFLOW binding not configured' }, 503)
  }
  const instance = await c.env.MIRROR_WORKFLOW.get(c.req.param('instanceId'))
  return c.json(await instance.status())
})

app.post('/refresh', async (c) => {
  if (!c.env.MIRROR_WORKFLOW) {
    return c.json(
      { error: 'MIRROR_WORKFLOW binding not configured — see wrangler.jsonc workflows[]' },
      503
    )
  }
  const prune = c.req.query('prune') === 'true'
  const instance = await c.env.MIRROR_WORKFLOW.create({ params: { prune } })
  return c.json({ started: true, instanceId: instance.id, prune })
})

export default app
