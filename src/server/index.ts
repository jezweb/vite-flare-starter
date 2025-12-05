import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { D1Database } from '@cloudflare/workers-types'
import { createAuth } from './modules/auth'
import settingsRoutes from './modules/settings/routes'
import apiTokensRoutes from './modules/api-tokens/routes'
import organizationRoutes from './modules/organization/routes'

// Define Cloudflare Workers environment bindings
export interface Env {
  // D1 Database
  DB: D1Database

  // R2 Storage
  AVATARS: R2Bucket

  // Environment variables
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  EMAIL_API_KEY?: string
  EMAIL_FROM?: string
  APP_NAME?: string
  NODE_ENV?: string

  // Email signup control (doesn't affect Google OAuth)
  DISABLE_EMAIL_SIGNUP?: string
}

// Create Hono app with type-safe environment
const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', logger())
app.use('/api/*', cors())

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    message: 'Vite Flare Starter API is running',
    timestamp: new Date().toISOString(),
    environment: c.env.NODE_ENV || 'development',
  })
})

// Auth routes (better-auth handles all /api/auth/* routes)
app.all('/api/auth/*', async (c) => {
  const auth = createAuth(c.env.DB, {
    BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
    GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
    EMAIL_API_KEY: c.env.EMAIL_API_KEY,
    EMAIL_FROM: c.env.EMAIL_FROM,
    DISABLE_EMAIL_SIGNUP: c.env.DISABLE_EMAIL_SIGNUP,
  })
  return auth.handler(c.req.raw)
})

// Public avatar serving route
// GET /api/avatar/:userId - Serve user avatar from R2
app.get('/api/avatar/:userId', async (c) => {
  const userId = c.req.param('userId')

  try {
    // Try different image formats
    const extensions = ['jpg', 'jpeg', 'png', 'webp']

    for (const ext of extensions) {
      const key = `avatars/${userId}.${ext}`
      const object = await c.env.AVATARS.get(key)

      if (object) {
        // Determine content type from extension
        const contentTypeMap: Record<string, string> = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
        }

        const contentType = contentTypeMap[ext] || 'image/jpeg'

        // Return image with appropriate headers
        return new Response(object.body, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }
    }

    // No avatar found - return 404
    return c.json({ error: 'Avatar not found' }, 404)
  } catch (error) {
    console.error('Serve avatar error:', error)
    return c.json({ error: 'Failed to serve avatar' }, 500)
  }
})

// API routes
app.route('/api/settings', settingsRoutes)
app.route('/api/api-tokens', apiTokensRoutes)
app.route('/api/organization', organizationRoutes)

// 404 handler for API routes
app.notFound((c) => {
  // Only handle 404s for /api/* routes
  // Everything else falls through to static assets
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not Found' }, 404)
  }
  // Return undefined to let the runtime handle it (static assets)
  return undefined as any
})

// Error handler
app.onError((err, c) => {
  console.error('Error:', err)
  return c.json(
    {
      error: c.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    },
    500
  )
})

export default app
