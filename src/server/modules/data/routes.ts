/**
 * Data Lake — download routes
 *
 * Companion to the `export_data` chat tool. The tool stores a dataset
 * in R2 and returns a URL pointing here; this route validates
 * ownership, fetches every chunk, and streams CSV / JSON back to the
 * browser as a downloadable file.
 *
 * Routes are auth-gated (the dataset's userId is checked against the
 * caller's session id) — even though dataRefs are unguessable, that's
 * defence in depth.
 */
import { Hono } from 'hono'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import {
  exportDatasetCsv,
  exportDatasetJson,
  isValidDataRef,
  type DataLakeEnv,
} from '@/server/lib/data-lake'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)

/**
 * Stream a dataset as a downloadable CSV or JSON file.
 *
 * GET /api/data/:dataRef/download?format=csv|json
 *
 * Validates the dataRef belongs to the authenticated user. Returns 404
 * for any not-found / not-owned / expired condition (no leaking
 * existence). Sets Content-Disposition with a filename derived from
 * the dataRef so saves go to a reasonable name.
 */
app.get('/:dataRef/download', async (c) => {
  const userId = c.get('userId')
  const dataRef = c.req.param('dataRef')
  if (!isValidDataRef(dataRef)) return c.json({ error: 'Invalid data ref' }, 404)

  const format = (c.req.query('format') || 'csv').toLowerCase()
  const env = c.env as unknown as DataLakeEnv
  if (!env.DATA_LAKE) return c.json({ error: 'Data lake not configured' }, 503)

  if (format === 'csv') {
    const result = await exportDatasetCsv(env, userId, dataRef)
    if (!result) return c.json({ error: 'Dataset not found' }, 404)
    return new Response(result.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="data-${dataRef}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  if (format === 'json') {
    const result = await exportDatasetJson(env, userId, dataRef)
    if (!result) return c.json({ error: 'Dataset not found' }, 404)
    return new Response(result.json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="data-${dataRef}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  return c.json({ error: `Unsupported format: ${format}` }, 400)
})

export default app
