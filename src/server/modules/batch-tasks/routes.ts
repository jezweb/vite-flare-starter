/**
 * Batch tasks — REST routes.
 *
 * Mounted at /api/jobs:
 *   GET    /              list current user's jobs (most recent first)
 *   GET    /:id           job + items for the detail page
 *   POST   /:id/cancel    set status to cancelled (running steps continue,
 *                         but the run-loop bails between windows)
 *
 * Job CREATION lives in the chat tool — `start_batch_task` is the only
 * supported entry point in v1. Adding a generic POST is a one-liner if
 * a fork wants to kick off batches from elsewhere.
 */
import { Hono } from 'hono'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { getJob, listItems, listJobs, setJobStatus } from './storage'

interface BatchEnv {
  DB: D1Database
}

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

app.get('/', async (c) => {
  const userId = c.get('userId')
  const env = c.env as unknown as BatchEnv
  const jobs = await listJobs(env.DB, userId)
  return c.json({ jobs })
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const env = c.env as unknown as BatchEnv
  const job = await getJob(env.DB, userId, id)
  if (!job) return c.json({ error: 'Not found' }, 404)
  const items = await listItems(env.DB, id)
  return c.json({ job, items })
})

app.post('/:id/cancel', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const env = c.env as unknown as BatchEnv
  const job = await getJob(env.DB, userId, id)
  if (!job) return c.json({ error: 'Not found' }, 404)
  if (job.status !== 'running' && job.status !== 'queued') {
    return c.json({ error: 'Job not cancellable in its current state' }, 400)
  }
  await setJobStatus(env.DB, id, 'cancelled')
  return c.json({ ok: true })
})

export default app
