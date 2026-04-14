/**
 * Image Processing API Routes
 *
 * On-the-fly image transforms via Cloudflare Images binding.
 * All operations run at the edge — no external APIs needed.
 *
 * Endpoints:
 * - POST /api/images/transform — transform an uploaded image
 * - POST /api/images/info — get image metadata
 * - POST /api/images/remove-bg — remove background (AI)
 * - POST /api/images/thumbnail — generate thumbnail
 * - POST /api/images/optimize — optimize for web (WebP/AVIF)
 * - GET  /api/images/r2/:key — serve + transform an R2-stored image via query params
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { transformImage, getImageInfo, type TransformOptions } from './transform'

// Extend env with IMAGES binding
type ImageEnv = AuthContext & {
  Bindings: AuthContext['Bindings'] & {
    IMAGES?: unknown
    FILES?: R2Bucket
  }
}

const app = new Hono<ImageEnv>()
app.use('*', authMiddleware)

/** Middleware: check IMAGES binding is available */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const requireImages = async (c: any, next: any) => {
  if (!c.env.IMAGES) {
    return c.json({ error: 'Cloudflare Images binding not configured. Add "images": { "binding": "IMAGES" } to wrangler.jsonc.' }, 501)
  }
  await next()
}

app.use('*', requireImages)

/**
 * POST /api/images/transform — full transform with any options
 *
 * Accepts multipart form: file + JSON options
 */
app.post('/transform', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    const optionsJson = formData.get('options') as string

    if (!file) return c.json({ error: 'file required' }, 400)

    const options: TransformOptions = optionsJson ? JSON.parse(optionsJson) : {}
    const imageData = await file.arrayBuffer()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await transformImage(c.env.IMAGES as any, imageData, options)
    return response
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Transform failed' }, 500)
  }
})

/**
 * POST /api/images/info — get image metadata
 */
app.post('/info', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    if (!file) return c.json({ error: 'file required' }, 400)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = await getImageInfo(c.env.IMAGES as any, await file.arrayBuffer())
    return c.json({ info })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Info failed' }, 500)
  }
})

/**
 * POST /api/images/remove-bg — AI background removal
 *
 * Returns PNG with transparent background.
 */
app.post('/remove-bg', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    const bgColor = formData.get('background') as string | null

    if (!file) return c.json({ error: 'file required' }, 400)

    const options: TransformOptions = {
      segment: 'foreground',
      format: 'png',
      ...(bgColor ? { background: bgColor } : {}),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await transformImage(c.env.IMAGES as any, await file.arrayBuffer(), options)
    return response
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Background removal failed' }, 500)
  }
})

/**
 * POST /api/images/thumbnail — generate a thumbnail
 *
 * Smart cropping with face detection when applicable.
 */
app.post(
  '/thumbnail',
  zValidator('query', z.object({
    size: z.coerce.number().min(16).max(2000).optional().default(200),
    format: z.enum(['webp', 'jpeg', 'avif', 'png']).optional().default('webp'),
  })),
  async (c) => {
    try {
      const { size, format } = c.req.valid('query')
      const formData = await c.req.formData()
      const file = formData.get('file') as File
      if (!file) return c.json({ error: 'file required' }, 400)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await transformImage(c.env.IMAGES as any, await file.arrayBuffer(), {
        width: size,
        height: size,
        fit: 'cover',
        gravity: 'face', // AI face detection — falls back to center if no face
        format,
        quality: 80,
      })
      return response
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Thumbnail failed' }, 500)
    }
  }
)

/**
 * POST /api/images/optimize — optimize for web delivery
 *
 * Converts to modern format (WebP/AVIF) with quality optimization.
 */
app.post(
  '/optimize',
  zValidator('query', z.object({
    format: z.enum(['webp', 'avif', 'auto']).optional().default('webp'),
    quality: z.coerce.number().min(1).max(100).optional().default(80),
    maxWidth: z.coerce.number().min(1).max(8000).optional(),
  })),
  async (c) => {
    try {
      const { format, quality, maxWidth } = c.req.valid('query')
      const formData = await c.req.formData()
      const file = formData.get('file') as File
      if (!file) return c.json({ error: 'file required' }, 400)

      const options: TransformOptions = {
        format: format === 'auto' ? 'webp' : format,
        quality,
        metadata: 'copyright', // strip most metadata, keep copyright
        ...(maxWidth ? { width: maxWidth, fit: 'scale-down' } : {}),
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await transformImage(c.env.IMAGES as any, await file.arrayBuffer(), options)
      return response
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Optimize failed' }, 500)
    }
  }
)

/**
 * GET /api/images/r2/:key+ — serve + transform R2 images on the fly
 *
 * Query params map to transform options:
 * ?w=800&h=600&fit=cover&format=webp&q=80&blur=5&segment=foreground
 */
app.get('/r2/*', async (c) => {
  try {
    const key = c.req.path.replace('/api/images/r2/', '')
    if (!c.env.FILES) return c.json({ error: 'FILES R2 bucket not configured' }, 501)

    const object = await c.env.FILES.get(key)
    if (!object) return c.json({ error: 'Image not found' }, 404)

    const query = c.req.query()
    const hasTransforms = Object.keys(query).length > 0

    // No transforms — serve directly from R2
    if (!hasTransforms) {
      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }

    // Build transform options from query params
    const options: TransformOptions = {}
    if (query['w']) options.width = Number(query['w'])
    if (query['h']) options.height = Number(query['h'])
    if (query['fit']) options.fit = query['fit'] as TransformOptions['fit']
    if (query['gravity']) options.gravity = query['gravity'] as TransformOptions['gravity']
    if (query['format']) options.format = query['format'] as TransformOptions['format']
    if (query['q']) options.quality = Number(query['q'])
    if (query['blur']) options.blur = Number(query['blur'])
    if (query['sharpen']) options.sharpen = Number(query['sharpen'])
    if (query['brightness']) options.brightness = Number(query['brightness'])
    if (query['contrast']) options.contrast = Number(query['contrast'])
    if (query['saturation']) options.saturation = Number(query['saturation'])
    if (query['gamma']) options.gamma = Number(query['gamma'])
    if (query['rotate']) options.rotate = Number(query['rotate']) as 90 | 180 | 270
    if (query['flip']) options.flip = query['flip'] as TransformOptions['flip']
    if (query['segment']) options.segment = query['segment'] as 'foreground'
    if (query['bg']) options.background = query['bg']
    if (query['dpr']) options.dpr = Number(query['dpr'])
    if (query['zoom']) options.zoom = Number(query['zoom'])

    // Default format to webp if not specified
    if (!options.format) options.format = 'webp'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await transformImage(c.env.IMAGES as any, await object.arrayBuffer(), options)

    // Add cache headers
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'public, max-age=86400')

    return new Response(response.body, { headers })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Transform failed' }, 500)
  }
})

export default app
