import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { D1Database } from '@cloudflare/workers-types'
import { createAuth } from './modules/auth'
import settingsRoutes from './modules/settings/routes'
import sessionsRoutes from './modules/settings/sessions'
import apiTokensRoutes from './modules/api-tokens/routes'
import organizationRoutes from './modules/organization/routes'
import activityRoutes from './modules/activity/routes'
import { featuresPublicRoutes, featuresAdminRoutes } from './modules/feature-flags/routes'
import notificationsRoutes from './modules/notifications/routes'
import chatRoutes from './modules/chat/routes'
import { securityHeaders } from './middleware/security'
import { rateLimiter } from './middleware/rate-limit'
import { authMiddleware } from './middleware/auth'
import { AVATAR, APP_VERSION } from '@/shared/config/constants'
import { createAIClient, listModels, getRecommendedModel, resolveModelId } from './lib/ai'

// Define Cloudflare Workers environment bindings
export interface Env {
  // D1 Database
  DB: D1Database

  // R2 Storage
  AVATARS: R2Bucket

  // Workers AI
  AI: Ai

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

  // Trusted origins for auth (comma-separated list)
  // Example: "http://localhost:5173,https://myapp.workers.dev,https://myapp.com"
  TRUSTED_ORIGINS?: string
}

// Create Hono app with type-safe environment
const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', logger())
app.use('*', securityHeaders)
app.use('/api/*', cors())
app.use('/api/*', rateLimiter)

// Health check endpoint
app.get('/api/health', async (c) => {
  const checks: Record<string, 'ok' | 'error'> = {}

  // Optional: Check D1 database connectivity
  try {
    await c.env.DB.prepare('SELECT 1').run()
    checks['database'] = 'ok'
  } catch {
    checks['database'] = 'error'
  }

  // Optional: Check R2 bucket accessibility
  try {
    await c.env.AVATARS.list({ limit: 1 })
    checks['storage'] = 'ok'
  } catch {
    checks['storage'] = 'error'
  }

  const allOk = Object.values(checks).every((v) => v === 'ok')

  return c.json({
    status: allOk ? 'ok' : 'degraded',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    environment: c.env.NODE_ENV || 'development',
    checks,
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
    TRUSTED_ORIGINS: c.env.TRUSTED_ORIGINS,
  })
  return auth.handler(c.req.raw)
})

// Public avatar serving route
// GET /api/avatar/:userId - Serve user avatar from R2
app.get('/api/avatar/:userId', async (c) => {
  const userId = c.req.param('userId')

  try {
    // Try different image formats (from shared constants)
    for (const ext of AVATAR.EXTENSIONS) {
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

        // Return image with appropriate headers (cache duration from constants)
        return new Response(object.body, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': `public, max-age=${AVATAR.CACHE_MAX_AGE}, immutable`,
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
app.route('/api/settings/sessions', sessionsRoutes)
app.route('/api/api-tokens', apiTokensRoutes)
app.route('/api/organization', organizationRoutes)
app.route('/api/activity', activityRoutes)
app.route('/api/features', featuresPublicRoutes)
app.route('/api/admin/feature-flags', featuresAdminRoutes)
app.route('/api/notifications', notificationsRoutes)
app.route('/api/chat', chatRoutes)

// =============================================================================
// AI TEST ENDPOINT
// =============================================================================

// Schema for AI test request
const aiTestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  model: z.string().optional(),
})

// GET /api/ai/models - List available models
app.get('/api/ai/models', authMiddleware, async (c) => {
  const models = listModels()
  const recommended = getRecommendedModel('general')

  return c.json({
    models: models.map((m) => ({
      id: m.id,
      name: m.displayName,
      tier: m.tier,
      contextWindow: m.contextWindow,
      supportsTools: m.supportsTools,
      isReasoning: m.isReasoning,
    })),
    recommended,
  })
})

// POST /api/ai/test - Test AI generation
app.post(
  '/api/ai/test',
  authMiddleware,
  zValidator('json', aiTestSchema),
  async (c) => {
    const { prompt, model } = c.req.valid('json')

    try {
      const ai = createAIClient(c.env.AI)
      // Resolve model alias to full ID if provided
      const modelId = model ? resolveModelId(model) : undefined
      const result = await ai.generate(prompt, { model: modelId })

      return c.json({
        success: true,
        response: result.response,
        model: result.model,
        durationMs: result.durationMs,
        usage: result.usage,
      })
    } catch (error) {
      console.error('AI test error:', error)
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'AI generation failed',
        },
        500
      )
    }
  }
)

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
