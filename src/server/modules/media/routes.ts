/**
 * Media Processing API Routes
 *
 * Video transforms via Cloudflare Media Transformations binding.
 * All processing runs at the edge — no external APIs needed.
 *
 * Endpoints:
 * - POST /api/media/transform — full video transform
 * - POST /api/media/clip — clip a segment from a video
 * - POST /api/media/frame — extract a still frame
 * - POST /api/media/spritesheet — generate seek preview spritesheet
 * - POST /api/media/audio — extract audio track
 * - GET  /api/media/r2/:key — serve + transform R2-stored video via query params
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { isOwnedR2Key } from '@/server/lib/r2-keys'
import {
  transformVideo,
  extractFrame,
  generateSpritesheet,
  extractAudio,
  clipVideo,
} from './transform'

type MediaEnv = AuthContext & {
  Bindings: AuthContext['Bindings'] & {
    MEDIA?: unknown
    FILES?: R2Bucket
  }
}

const app = new Hono<MediaEnv>()
app.use('*', authMiddleware)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const requireMedia = async (c: any, next: any) => {
  if (!c.env.MEDIA) {
    return c.json(
      {
        error:
          'Cloudflare Media binding not configured. Add "media": { "binding": "MEDIA" } to wrangler.jsonc.',
      },
      501
    )
  }
  await next()
}

app.use('*', requireMedia)

/** POST /api/media/transform — full video transform */
app.post('/transform', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    const optionsJson = formData.get('options') as string

    if (!file) return c.json({ error: 'file required (MP4 with H.264)' }, 400)

    const opts = optionsJson ? JSON.parse(optionsJson) : {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await transformVideo(
      c.env.MEDIA as any,
      await file.arrayBuffer(),
      opts.transform || {},
      opts.output || {}
    )
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Transform failed' }, 500)
  }
})

/** POST /api/media/clip — clip a video segment */
app.post(
  '/clip',
  zValidator(
    'query',
    z.object({
      time: z.string().optional().default('0s'),
      duration: z.string().default('5s'),
      width: z.coerce.number().optional(),
      height: z.coerce.number().optional(),
      removeAudio: z.coerce.boolean().optional(),
    })
  ),
  async (c) => {
    try {
      const params = c.req.valid('query')
      const formData = await c.req.formData()
      const file = formData.get('file') as File
      if (!file) return c.json({ error: 'file required' }, 400)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await clipVideo(c.env.MEDIA as any, await file.arrayBuffer(), params)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Clip failed' }, 500)
    }
  }
)

/** POST /api/media/frame — extract a still frame */
app.post(
  '/frame',
  zValidator(
    'query',
    z.object({
      time: z.string().optional().default('0s'),
      width: z.coerce.number().optional(),
      height: z.coerce.number().optional(),
    })
  ),
  async (c) => {
    try {
      const params = c.req.valid('query')
      const formData = await c.req.formData()
      const file = formData.get('file') as File
      if (!file) return c.json({ error: 'file required' }, 400)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await extractFrame(c.env.MEDIA as any, await file.arrayBuffer(), params)
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : 'Frame extraction failed' },
        500
      )
    }
  }
)

/** POST /api/media/spritesheet — generate seek preview */
app.post('/spritesheet', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    const width = Number(c.req.query('width') || '160')
    const height = Number(c.req.query('height') || '90')
    if (!file) return c.json({ error: 'file required' }, 400)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await generateSpritesheet(c.env.MEDIA as any, await file.arrayBuffer(), {
      width,
      height,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Spritesheet failed' }, 500)
  }
})

/** POST /api/media/audio — extract audio track as M4A */
app.post('/audio', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    if (!file) return c.json({ error: 'file required' }, 400)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await extractAudio(c.env.MEDIA as any, await file.arrayBuffer())
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Audio extraction failed' },
      500
    )
  }
})

/**
 * GET /api/media/r2/:key+ — serve + transform R2 video on the fly
 *
 * Query params: ?w=480&h=270&duration=5s&time=10s&mode=video&audio=false
 */
app.get('/r2/*', async (c) => {
  try {
    const userId = c.get('userId')
    const key = decodeURIComponent(c.req.path.replace('/api/media/r2/', ''))
    if (!c.env.FILES) return c.json({ error: 'FILES R2 bucket not configured' }, 501)
    // Ownership gate: key is caller-supplied — block cross-tenant reads (IDOR).
    if (!isOwnedR2Key(key, userId)) return c.json({ error: 'Access denied' }, 403)

    const object = await c.env.FILES.get(key)
    if (!object) return c.json({ error: 'Video not found' }, 404)

    const query = c.req.query()
    const hasParams = Object.keys(query).length > 0

    if (!hasParams) {
      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'video/mp4',
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }

    const transform: Record<string, unknown> = {}
    if (query['w']) transform['width'] = Number(query['w'])
    if (query['h']) transform['height'] = Number(query['h'])
    if (query['fit']) transform['fit'] = query['fit']

    const output: Record<string, unknown> = { mode: query['mode'] || 'video' }
    if (query['duration']) output['duration'] = query['duration']
    if (query['time']) output['time'] = query['time']
    if (query['audio'] === 'false') output['audio'] = false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await transformVideo(
      c.env.MEDIA as any,
      await object.arrayBuffer(),
      transform,
      output
    )

    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'private, max-age=3600')
    return new Response(response.body, { headers })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Transform failed' }, 500)
  }
})

export default app
