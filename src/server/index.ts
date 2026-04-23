import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { D1Database } from '@cloudflare/workers-types'
import { createAuth } from './modules/auth'
import settingsRoutes from './modules/settings/routes'
import sessionsRoutes from './modules/settings/sessions'
import exportRoutes from './modules/settings/export'
import apiTokensRoutes from './modules/api-tokens/routes'
import organizationRoutes from './modules/organization/routes'
import activityRoutes from './modules/activity/routes'
import { featuresPublicRoutes, featuresAdminRoutes } from './modules/feature-flags/routes'
import notificationsRoutes from './modules/notifications/routes'
import chatRoutes from './modules/chat/routes'
import audioRoutes from './modules/audio/routes'
import filesRoutes from './modules/files/routes'
import adminRoutes from './modules/admin/routes'
import webhookRoutes from './modules/webhooks/routes'
import userMetaRoutes from './modules/user-meta/routes'
import skillsRoutes from './modules/skills/routes'
import conversationsRoutes from './modules/conversations/routes'
import projectsRoutes from './modules/projects/routes'
import commentsRoutes from './modules/comments/routes'
import tagsRoutes from './modules/tags/routes'
import watchersRoutes from './modules/watchers/routes'
import favouritesRoutes from './modules/favourites/routes'
import recentViewsRoutes from './modules/recent-views/routes'
import imagesRoutes from './modules/images/routes'
import mediaRoutes from './modules/media/routes'
import emailRoutes from './modules/email/routes'
import mcpConnectionsRoutes from './modules/mcp-connections/routes'
import googleWorkspaceRoutes from './modules/google-workspace/routes'
import microsoftWorkspaceRoutes from './modules/microsoft-workspace/routes'
import slackRoutes from './modules/slack/routes'
import notionRoutes from './modules/notion/routes'
import atlassianRoutes from './modules/atlassian/routes'
import { routeAgentRequest } from 'agents'
// Re-export DO class(es) so wrangler migrations can locate them. Every DO
// referenced in `durable_objects.bindings` must be exported from the
// Worker entry module.
// See CLAUDE.md → "Pattern 10: Durable Object Agent (voice / streaming WS)".
export { VoiceInputExample } from './modules/voice/voice-agent'
export { VideoInputExample } from './modules/video/video-agent'
import { securityHeaders } from './middleware/security'
import { rateLimiter } from './middleware/rate-limit'
import { authMiddleware, requireScopes } from './middleware/auth'
import { requestIdMiddleware } from './middleware/request-id'
import { captureServerException } from './lib/sentry'
import { AVATAR, APP_VERSION } from '@/shared/config/constants'
import { listModels, DEFAULT_MODEL, getAvailableProviders } from './lib/ai'

// Define Cloudflare Workers environment bindings
export interface Env {
  // D1 Database
  DB: D1Database

  // R2 Storage
  AVATARS: R2Bucket
  FILES: R2Bucket
  /** Optional — for storing Claude Agent Skills uploaded via API */
  SKILLS?: R2Bucket

  // Workers AI
  AI: Ai

  // Cloudflare Images (resize, crop, background removal, format conversion)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  IMAGES?: any

  // Cloudflare Media Transformations (video resize, clip, frame/audio extraction)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MEDIA?: any

  // Environment variables
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  EMAIL_API_KEY?: string
  EMAIL_FROM?: string
  APP_NAME?: string
  NODE_ENV?: string

  // Email auth control - DISABLED BY DEFAULT (OAuth-only mode)
  // See CLAUDE.md for full auth configuration docs
  // Google OAuth domain restrictions: use Google Cloud Console, not these vars
  ENABLE_EMAIL_LOGIN?: string // Set to 'true' to allow email/password login (default: disabled)
  ENABLE_EMAIL_SIGNUP?: string // Set to 'true' to allow email signups (requires ENABLE_EMAIL_LOGIN=true)

  // Trusted origins for auth (comma-separated list)
  // Example: "http://localhost:5173,https://myapp.workers.dev,https://myapp.com"
  TRUSTED_ORIGINS?: string

  // Admin emails (comma-separated list)
  // Users matching these emails are automatically promoted to admin role
  // Example: "admin@example.com,jeremy@jezweb.net"
  ADMIN_EMAILS?: string

  // Sentry error tracking (optional)
  SENTRY_DSN?: string
  SENTRY_ENVIRONMENT?: string

  // API token prefix (optional, for rebranding)
  // Default: "vfs_" - change to hide framework identity
  // Example: "myapp_" (3-4 chars + underscore)
  TOKEN_PREFIX?: string

  // AI Provider API keys (optional — set for the providers you want to use)
  // Workers AI is free and needs no key (uses env.AI binding)
  ANTHROPIC_API_KEY?: string  // Claude models
  OPENAI_API_KEY?: string     // GPT models
  GOOGLE_AI_API_KEY?: string  // Gemini models
  OPENROUTER_API_KEY?: string // Any model via OpenRouter (single key)

  // Browser Rendering (optional — enables browser_* agent tools)
  // Create token at https://dash.cloudflare.com/profile/api-tokens with "Browser Rendering - Edit" permission
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string

  // Web search provider (optional — enables web_search tool)
  // Default: serper (2500 free/month at https://serper.dev)
  // Options: serper | brave | tavily | exa
  SEARCH_PROVIDER?: string
  SERPER_API_KEY?: string
  BRAVE_API_KEY?: string
  TAVILY_API_KEY?: string
  EXA_API_KEY?: string
}

// Create Hono app with type-safe environment
const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', requestIdMiddleware)
app.use('*', logger())
app.use('*', securityHeaders)
app.use('/api/*', cors({
  origin: (origin, c) => {
    // Use TRUSTED_ORIGINS if set, otherwise allow same-origin only
    const trusted = (c.env.TRUSTED_ORIGINS as string | undefined)?.split(',').map(s => s.trim()) ?? []
    if (trusted.length === 0) return origin // Same-origin: reflect the request origin
    return trusted.includes(origin) ? origin : trusted[0]!
  },
  credentials: true,
}))
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

// Auth config endpoint (public - returns enabled auth methods for UI)
// See CLAUDE.md "Auth Method Control" for configuration details
app.get('/api/auth/config', async (c) => {
  // Email login is DISABLED by default (OAuth-only mode)
  // Set ENABLE_EMAIL_LOGIN=true to allow email/password auth
  const emailLoginEnabled = c.env.ENABLE_EMAIL_LOGIN === 'true'
  const emailSignupEnabled = emailLoginEnabled && c.env.ENABLE_EMAIL_SIGNUP === 'true'
  const googleEnabled = !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET)

  return c.json({
    emailLoginEnabled,
    emailSignupEnabled,
    googleEnabled,
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
    ENABLE_EMAIL_LOGIN: c.env.ENABLE_EMAIL_LOGIN,
    ENABLE_EMAIL_SIGNUP: c.env.ENABLE_EMAIL_SIGNUP,
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
app.route('/api/settings/export', exportRoutes)
app.route('/api/api-tokens', apiTokensRoutes)
app.route('/api/organization', organizationRoutes)
app.route('/api/activity', activityRoutes)
app.route('/api/features', featuresPublicRoutes)
app.route('/api/admin/feature-flags', featuresAdminRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/notifications', notificationsRoutes)
app.route('/api/chat', chatRoutes)
app.route('/api/audio', audioRoutes)
app.route('/api/files', filesRoutes)
app.route('/api/webhooks', webhookRoutes)
app.route('/api/user-meta', userMetaRoutes)
app.route('/api/skills', skillsRoutes)
app.route('/api/conversations', conversationsRoutes)
app.route('/api/projects', projectsRoutes)
app.route('/api/comments', commentsRoutes)
app.route('/api/tags', tagsRoutes)
app.route('/api/watchers', watchersRoutes)
app.route('/api/favourites', favouritesRoutes)
app.route('/api/recent', recentViewsRoutes)
app.route('/api/images', imagesRoutes)
app.route('/api/media', mediaRoutes)
app.route('/api/email', emailRoutes)
app.route('/api/mcp-connections', mcpConnectionsRoutes)
app.route('/api/google-workspace', googleWorkspaceRoutes)
app.route('/api/microsoft-workspace', microsoftWorkspaceRoutes)
app.route('/api/slack', slackRoutes)
app.route('/api/notion', notionRoutes)
app.route('/api/atlassian', atlassianRoutes)

// =============================================================================
// AI TEST ENDPOINT
// =============================================================================

// Schema for AI test request
const aiTestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  model: z.string().optional(),
})

// GET /api/ai/models - List available Workers AI models
// Requires: ai:use scope for API tokens
app.get('/api/ai/models', authMiddleware, requireScopes('ai:use'), async (c) => {
  const models = listModels()

  return Response.json({
    models: models.map((m) => ({
      id: m.id,
      name: m.displayName,
      provider: m.provider,
      tier: m.tier,
      contextWindow: m.contextWindow,
      supportsTools: m.supportsTools,
      supportsVision: m.supportsVision,
      isReasoning: m.isReasoning,
      costTier: m.costTier,
    })),
    defaultModel: DEFAULT_MODEL,
    providers: getAvailableProviders(c.env),
  })
})

// POST /api/ai/test - Test AI text generation
// Requires: ai:use scope for API tokens
app.post(
  '/api/ai/test',
  authMiddleware,
  requireScopes('ai:use'),
  zValidator('json', aiTestSchema),
  async (c) => {
    const { prompt, model } = c.req.valid('json')

    try {
      const { generateText } = await import('ai')
      const { resolveModel } = await import('./lib/ai')

      const modelId = model || DEFAULT_MODEL
      const startTime = Date.now()

      const { text, usage } = await generateText({
        model: resolveModel(c.env, modelId),
        prompt,
      })

      return c.json({
        success: true,
        response: text,
        model: modelId,
        durationMs: Date.now() - startTime,
        usage,
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
  const requestId = c.get('requestId') || 'unknown'

  // Log error with request context
  console.error(`[${requestId}] Error:`, err.message, err.stack)

  // Capture in Sentry with request context
  captureServerException(err, c, {
    requestId,
    path: c.req.path,
    method: c.req.method,
  })

  // Return error response with request ID for support correlation
  return c.json(
    {
      error: c.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
      requestId,
    },
    500
  )
})

// ─── Cron Handler (scheduled tasks) ──────────────────────────────────
// Add a cron trigger in wrangler.jsonc to enable:
//   "triggers": { "crons": ["*/5 * * * *"] }   // every 5 minutes
//
// The handler runs three jobs each tick:
//   1. processDueJobs      — fires AI agent reminders / scheduled tools
//   2. cleanupExpiredAuth  — purges dead sessions + verification tokens
//   3. purgeStaleSessions  — 30-day backstop for orphans (hourly only)
//
// Session cleanup fixes ADM2 (morning audit): "Active Sessions: 8 vs Total
// Users: 4" — better-auth doesn't reap expired rows itself, so without
// this the admin dashboard drifts over time.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Try Durable Object agent routing first — any request matching
    // /agents/{agent-name-kebab-case}/{instance-name} is routed to the
    // corresponding DO by the agents SDK. Falls through to Hono if
    // the path doesn't match.
    // See CLAUDE.md → "Pattern 10: Durable Object Agent (voice / streaming WS)".
    const agentResponse = await routeAgentRequest(request, env)
    if (agentResponse) return agentResponse
    return app.fetch(request, env, ctx)
  },
  async scheduled(event: ScheduledEvent, env: Env) {
    const logs: Record<string, unknown> = { trigger: event.cron }

    // 1. Due agent jobs (existing behaviour)
    try {
      const { processDueJobs } = await import('./modules/chat/tools/schedule')
      const processed = await processDueJobs(env.DB, env as unknown as Record<string, unknown>)
      if (processed > 0) logs['jobsProcessed'] = processed
    } catch (err) {
      logs['jobsError'] = err instanceof Error ? err.message : String(err)
    }

    // 2. Cleanup expired auth rows on every tick — cheap delete, no sweep needed.
    try {
      const { cleanupExpiredAuthRows, purgeStaleSessions } = await import('./modules/auth/cleanup')
      const { sessionsDeleted, verificationsDeleted } = await cleanupExpiredAuthRows(env.DB)
      if (sessionsDeleted > 0) logs['sessionsDeleted'] = sessionsDeleted
      if (verificationsDeleted > 0) logs['verificationsDeleted'] = verificationsDeleted

      // 3. Hourly backstop (minute 0 of the hour) — guards against stuck rows
      // whose expiresAt somehow stayed in the future.
      const now = new Date()
      if (now.getMinutes() < 5) {
        const purged = await purgeStaleSessions(env.DB, 30)
        if (purged > 0) logs['stalePurged'] = purged
      }
    } catch (err) {
      logs['cleanupError'] = err instanceof Error ? err.message : String(err)
    }

    if (Object.keys(logs).length > 1) {
      console.log(JSON.stringify({ event: 'cron_tick', ...logs }))
    }
  },
}
