/**
 * backups routes — admin surface for D1 backup runs (docs/BACKUPS.md).
 *
 *   GET  /api/backups              — list stored backups (R2 _backups/)
 *   POST /api/backups/run          — kick a backup Workflow now
 *   GET  /api/backups/status/:id   — poll a run
 *   GET  /api/backups/download/:key — stream one backup dump (admin)
 */
import { Hono } from 'hono'
import type { R2Bucket } from '@cloudflare/workers-types'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { adminMiddleware } from '@/server/middleware/admin'
import { BACKUP_PREFIX } from './workflow'

interface BackupWorkflowInstance {
  id: string
  status(): Promise<{ status: string; error?: unknown; output?: unknown }>
}
interface BackupsEnv {
  FILES: R2Bucket
  BACKUP_WORKFLOW?: {
    create(options?: { params?: unknown }): Promise<BackupWorkflowInstance>
    get(id: string): Promise<BackupWorkflowInstance>
  }
}

const app = new Hono<AuthContext & { Bindings: BackupsEnv }>()
app.use('*', authMiddleware)
app.use('*', adminMiddleware)

app.get('/', async (c) => {
  const listing = await c.env.FILES.list({ prefix: BACKUP_PREFIX })
  return c.json({
    workflowConfigured: !!c.env.BACKUP_WORKFLOW,
    backups: listing.objects
      .sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
      .map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() })),
  })
})

app.post('/run', async (c) => {
  if (!c.env.BACKUP_WORKFLOW) {
    return c.json(
      { error: 'BACKUP_WORKFLOW binding not configured — see docs/BACKUPS.md' },
      503
    )
  }
  const instance = await c.env.BACKUP_WORKFLOW.create()
  return c.json({ started: true, instanceId: instance.id })
})

app.get('/status/:instanceId', async (c) => {
  if (!c.env.BACKUP_WORKFLOW) {
    return c.json({ error: 'BACKUP_WORKFLOW binding not configured' }, 503)
  }
  const instance = await c.env.BACKUP_WORKFLOW.get(c.req.param('instanceId'))
  return c.json(await instance.status())
})

// Key arrives URL-encoded (contains a slash). Constrained to the backup
// prefix so this can never serve user files.
app.get('/download/:key{.+}', async (c) => {
  const key = decodeURIComponent(c.req.param('key'))
  if (!key.startsWith(BACKUP_PREFIX) || key.includes('..')) {
    return c.json({ error: 'Invalid backup key' }, 400)
  }
  const object = await c.env.FILES.get(key)
  if (!object) return c.json({ error: 'Not found' }, 404)
  return new Response(object.body, {
    headers: {
      'content-type': 'application/sql',
      'content-disposition': `attachment; filename="${key.slice(BACKUP_PREFIX.length)}"`,
    },
  })
})

export default app
