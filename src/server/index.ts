import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { D1Database } from '@cloudflare/workers-types'
import { createAuthFromEnv } from './modules/auth'
import settingsRoutes from './modules/settings/routes'
import onboardingRoutes from './modules/onboarding/routes'
import sessionsRoutes from './modules/settings/sessions'
import exportRoutes from './modules/settings/export'
import apiTokensRoutes from './modules/api-tokens/routes'
import organizationRoutes from './modules/organization/routes'
import activityRoutes from './modules/activity/routes'
import { featuresPublicRoutes, featuresAdminRoutes } from './modules/feature-flags/routes'
import notificationsRoutes from './modules/notifications/routes'
import chatRoutes from './modules/chat/routes'
import chatArtifactsRoutes from './modules/chat/artifacts-routes'
import audioRoutes from './modules/audio/routes'
import filesRoutes from './modules/files/routes'
import dataRoutes from './modules/data/routes'
import adminRoutes from './modules/admin/routes'
import webhookRoutes from './modules/webhooks/routes'
import userMetaRoutes from './modules/user-meta/routes'
import skillsRoutes from './modules/skills/routes'
import configDiffRoutes from './modules/config-diff/routes'
import conversationsRoutes from './modules/conversations/routes'
import projectsRoutes from './modules/projects/routes'
import memoriesRoutes from './modules/memories/routes'
import knowledgeRoutes from './modules/knowledge/routes'
import voiceRoutes from './modules/voice/voice-routes'
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
import connectorsRoutes from './modules/connectors/routes'
import scheduledAgentsRoutes from './modules/scheduled-agents/routes'
import autonomousAgentsRoutes from './modules/autonomous-agents/routes'
import approvalsRoutes from './modules/approvals/routes'
import routinesRoutes from './modules/routines/routes'
import inboxRoutes from './modules/inbox/routes'
import agentsRoutes from './lib/agents/routes'
import testAuthRoutes from './modules/test-auth/routes'
import webhookAgentsRoutes from './modules/webhook-agents/routes'
import agentObservabilityRoutes from './modules/agent-observability/routes'
import entitiesRoutes from './modules/entities/routes'
import findingsRoutes, { learningsApp as learningsRoutes } from './modules/findings/routes'
import organizationsRoutes from './modules/organizations/routes'
import credentialsRoutes from './modules/credentials/routes'
import walkaboutRoutes from './modules/walkabout/routes'
import spacesRoutes from './modules/spaces/routes'
import adminAgentRoutes from './modules/admin-tools/routes'
import agentInstancesRoutes from './modules/agent-instances/routes'
import messagesRoutes from './modules/spaces/messages-routes'
import globalSearchRoutes from './modules/spaces/global-search'
import batchJobsRoutes from './modules/batch-tasks/routes'
import { routeAgentRequest } from 'agents'
import { ScratchpadMcpAgent } from './modules/mcp-agents/scratchpad-mcp-agent'
// Re-export DO class(es) so wrangler migrations can locate them. Every DO
// referenced in `durable_objects.bindings` must be exported from the
// Worker entry module.
// See CLAUDE.md → "Pattern 10: Durable Object Agent (voice / streaming WS)".
export { VoiceInputExample } from './modules/voice/voice-agent'
export { VideoInputExample } from './modules/video/video-agent'
export { ReminderAgent } from './modules/scheduled-agents/reminder-agent'
export { AssistantAgent } from './modules/autonomous-agents/assistant-agent'
export { ResearcherAgent } from './modules/autonomous-agents/researcher-agent'
export { WriterAgent } from './modules/autonomous-agents/writer-agent'
export { SweeperAgent } from './modules/autonomous-agents/sweeper-agent'
export { AdminAgent } from './modules/autonomous-agents/admin-agent'
export { ScratchpadMcpAgent }
export { SpaceAgent } from './modules/spaces/space-agent'
// SDK-aligned chat DO. Routed via `routeAgentRequest` at
// /agents/chat-agent/user-{userId}-conv-{conversationId}.
// See src/server/modules/chat/chat-agent.ts.
export { ChatAgent } from './modules/chat/chat-agent'
// Cloudflare Workflow class for the batch-tasks module. Bound at
// `BATCH_WORKFLOW` (see wrangler.jsonc → workflows[]).
export { ProcessBatchWorkflow } from './modules/batch-tasks/workflows/process-batch'
import { securityHeaders } from './middleware/security'
import { rateLimiter } from './middleware/rate-limit'
import { authMiddleware, requireScopes } from './middleware/auth'
import { requestIdMiddleware } from './middleware/request-id'
import { captureServerException } from './lib/sentry'
import { AVATAR, APP_VERSION } from '@/shared/config/constants'
import { listModels, DEFAULT_MODEL, getAvailableProviders, routeFor } from './lib/ai'

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

  // Cloudflare Workflows — batch-tasks fan-out runner.
  // See src/server/modules/batch-tasks/workflows/process-batch.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BATCH_WORKFLOW?: any

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

  // Reference MCP server. Disabled by default because the scratchpad
  // example is intentionally unauthenticated unless a fork adds OAuth.
  ENABLE_SCRATCHPAD_MCP?: string

  // API token prefix (optional, for rebranding)
  // Default: "vfs_" - change to hide framework identity
  // Example: "myapp_" (3-4 chars + underscore)
  TOKEN_PREFIX?: string

  // AI Provider API keys (optional — set for the providers you want to use)
  // Workers AI is free and needs no key (uses env.AI binding)
  ANTHROPIC_API_KEY?: string // Claude models
  OPENAI_API_KEY?: string // GPT models
  GOOGLE_AI_API_KEY?: string // Gemini models
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
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      // Credentialed CORS is deny-by-default. Same-origin browser requests do
      // not need CORS headers; cross-origin callers must be explicitly listed.
      const trusted =
        (c.env.TRUSTED_ORIGINS as string | undefined)?.split(',').map((s) => s.trim()) ?? []
      if (trusted.length === 0) return null
      return trusted.includes(origin) ? origin : null
    },
    credentials: true,
  })
)
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
  const auth = createAuthFromEnv(c.env.DB, c.env as unknown as Record<string, unknown>)
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
app.route('/api/onboarding', onboardingRoutes)
app.route('/api/settings/export', exportRoutes)
app.route('/api/api-tokens', apiTokensRoutes)
app.route('/api/organization', organizationRoutes)
app.route('/api/activity', activityRoutes)
app.route('/api/features', featuresPublicRoutes)
app.route('/api/admin/feature-flags', featuresAdminRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/notifications', notificationsRoutes)
app.route('/api/chat/artifacts', chatArtifactsRoutes)
app.route('/api/chat', chatRoutes)
app.route('/api/audio', audioRoutes)
app.route('/api/files', filesRoutes)
app.route('/api/data', dataRoutes)
app.route('/api/scheduled-agents', scheduledAgentsRoutes)
app.route('/api/autonomous-agents', autonomousAgentsRoutes)
app.route('/api/approvals', approvalsRoutes)
app.route('/api/routines', routinesRoutes)
app.route('/api/inbox', inboxRoutes)
app.route('/api/jobs', batchJobsRoutes)
app.route('/api/agents', agentsRoutes)
app.route('/api/webhooks', webhookAgentsRoutes)
app.route('/api/agent-observability', agentObservabilityRoutes)
app.route('/api/entities', entitiesRoutes)
app.route('/api/findings', findingsRoutes)
app.route('/api/learnings', learningsRoutes)
app.route('/api/organizations', organizationsRoutes)
app.route('/api/credentials', credentialsRoutes)
app.route('/api/walkabout', walkaboutRoutes)
app.route('/api/webhooks', webhookRoutes)
app.route('/api/user-meta', userMetaRoutes)
app.route('/api/skills', skillsRoutes)
app.route('/api/config-diff', configDiffRoutes)
app.route('/api/conversations', conversationsRoutes)
app.route('/api/spaces', spacesRoutes)
app.route('/api/admin-agent', adminAgentRoutes)
app.route('/api/agent-instances', agentInstancesRoutes)
app.route('/api/messages', messagesRoutes)
app.route('/api/search', globalSearchRoutes)
// Test-auth lives behind a TEST_AUTH_TOKEN env gate; if the secret
// isn't set, every endpoint here returns 404. See module docstring.
app.route('/api/test-auth', testAuthRoutes)
app.route('/api/projects', projectsRoutes)
app.route('/api/memories', memoriesRoutes)
app.route('/api/knowledge', knowledgeRoutes)
app.route('/api/voice', voiceRoutes)
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
app.route('/api/connectors', connectorsRoutes)

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
      // Which network path this model takes — driven by which API keys
      // the operator configured. Lets the client show a "direct" or
      // "via OpenRouter" chip per row in the picker.
      //   'workers-ai' | 'anthropic-direct' | 'openai-direct' |
      //   'google-direct' | 'openrouter' | 'unknown'
      route: routeFor(c.env, m.id),
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
      // Fail safe: only expose the raw message when explicitly in development.
      // NODE_ENV is usually UNSET on Workers, so `=== 'production'` leaked
      // internal errors by default. Default (unset/anything else) → generic.
      error: c.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
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
// MCP server handler — exposes the ScratchpadMcpAgent over
// Streamable-HTTP at /mcp/scratchpad/<sessionId>. Built once at
// module load. See src/server/modules/mcp-agents/scratchpad-mcp-agent.ts
// for the worked example pattern.
const scratchpadMcpHandler = ScratchpadMcpAgent.serve('/mcp/scratchpad', {
  binding: 'ScratchpadMcpAgent',
})

type RequestSession = {
  userId: string
  sessionId: string | null
}

async function getRequestSession(env: Env, headers: Headers): Promise<RequestSession | null> {
  try {
    const auth = createAuthFromEnv(env.DB, env as unknown as Record<string, unknown>)
    const session = await auth.api.getSession({ headers })
    const userId = session?.user?.id
    if (!userId) return null
    return {
      userId,
      sessionId: (session as unknown as { session?: { id?: string } }).session?.id ?? null,
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'agent_route_auth_error', error: String(err) }))
    return null
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function parseAgentRoute(pathname: string): { agentName: string; instanceName: string } | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'agents' || !parts[1] || !parts[2]) return null
  return {
    agentName: parts[1],
    instanceName: decodeURIComponent(parts[2]),
  }
}

/**
 * Per-agent-class access policy for the /agents/* Durable Object surface.
 *
 * FAIL CLOSED: any agent class not listed here is denied (403). When a fork
 * adds a new agent, it must consciously declare how access is proven — the
 * default is "no one but the owner", not "anyone authenticated". This is the
 * whole point: a missing entry can never silently expose a tenant's DO.
 *
 * Policies:
 *   - 'owner-chat'  instance name is `user-<userId>-conv-<id>` (ChatAgent)
 *   - 'owner-colon' instance name is `<userId>[:...]` — owner is the segment
 *     before the first ':'. Used by every AutonomousAgent (assistant, admin,
 *     researcher, writer, sweeper, reminder) and the voice/video example DOs.
 *   - 'do-enforced' access is not owner-scoped (e.g. a Space shared by many
 *     members); the DO MUST verify access itself in onConnect. Only assign this
 *     to a class whose DO actually performs that check (SpaceAgent.onConnect).
 */
type AgentAccessPolicy = 'owner-chat' | 'owner-colon' | 'do-enforced'

const AGENT_ACCESS_POLICY: Record<string, AgentAccessPolicy> = {
  'chat-agent': 'owner-chat',
  'assistant-agent': 'owner-colon',
  'researcher-agent': 'owner-colon',
  'writer-agent': 'owner-colon',
  'sweeper-agent': 'owner-colon',
  'admin-agent': 'owner-colon',
  'reminder-agent': 'owner-colon',
  'voice-input-example': 'owner-colon',
  'video-input-example': 'owner-colon',
  // SpaceAgent is shared across a Space's members; SpaceAgent.onConnect
  // enforces membership, so the route gate only requires authentication.
  'space-agent': 'do-enforced',
}

function validateAgentAccess(pathname: string, session: RequestSession): Response | null {
  const route = parseAgentRoute(pathname)
  if (!route) return null

  const policy = AGENT_ACCESS_POLICY[route.agentName]
  // Fail closed: unknown agent class → deny. Previously every class except
  // chat-agent fell through to "allow", so any logged-in user could reach
  // another tenant's assistant/admin/researcher DO over /agents/*.
  if (!policy) return jsonResponse({ error: 'Forbidden' }, 403)

  if (policy === 'do-enforced') return null

  if (policy === 'owner-chat') {
    const routeUserId = route.instanceName.match(/^user-([^-].*?)-conv-(.+)$/)?.[1]
    if (!routeUserId) return jsonResponse({ error: 'Invalid chat agent instance name' }, 400)
    if (routeUserId !== session.userId) return jsonResponse({ error: 'Forbidden' }, 403)
    return null
  }

  // owner-colon: the instance name must be owned by the caller — owner is the
  // segment before the first ':' (AutonomousAgent convention `<userId>:<slug>`),
  // or the whole name when there is no ':' (a bare `<userId>` instance).
  const owner = route.instanceName.split(':')[0]
  if (!owner || owner !== session.userId) return jsonResponse({ error: 'Forbidden' }, 403)
  return null
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // MCP server routing first — /mcp/* paths are MCP protocol
    // traffic and don't go through Hono.
    const url = new URL(request.url)
    if (url.pathname.startsWith('/mcp/scratchpad')) {
      if (env.ENABLE_SCRATCHPAD_MCP !== 'true') {
        return jsonResponse({ error: 'Not Found' }, 404)
      }
      return scratchpadMcpHandler.fetch(request, env, ctx)
    }
    if (url.pathname.startsWith('/agents/')) {
      const session = await getRequestSession(env, request.headers)
      if (!session) return jsonResponse({ error: 'Unauthorized' }, 401)
      const accessError = validateAgentAccess(url.pathname, session)
      if (accessError) return accessError
    }
    // Try Durable Object agent routing — any request matching
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

    // 4. Memory extraction sweep (Phase 3 v2) — picks up conversations that
    // went idle without triggering the reactive path. Caps at 5 per tick
    // to keep wall-clock under the cron budget; the next tick handles
    // any backlog.
    try {
      const { sweepIdleConversationsForMemory } = await import('./modules/memories/triggers')
      const result = await sweepIdleConversationsForMemory(
        env as unknown as { DB: D1Database; AI: Ai }
      )
      if (result.processed > 0) logs['memoryProcessed'] = result.processed
      if (result.errors > 0) logs['memoryErrors'] = result.errors
    } catch (err) {
      logs['memorySweepError'] = err instanceof Error ? err.message : String(err)
    }

    // 5. Routines (issue #50) — fire any due schedule-triggered routines.
    //    Bounded at 5 per tick to keep the cron budget. Each fire records
    //    a routine_runs row + invokes the target agent's DO via setToolsAllowed
    //    (slice 2 contract) + runOnce.
    //
    //    Also sweeps stuck `started` runs older than the grace window and
    //    flips them to 'error' (P2-005 watchdog) so the UI never shows
    //    "Running" forever for a worker-killed run.
    try {
      const { processDueRoutines, sweepStaleRoutineRuns } = await import(
        './modules/routines/scheduler'
      )
      const result = await processDueRoutines(
        env as unknown as { DB: D1Database; [k: string]: unknown }
      )
      if (result.fired > 0) logs['routinesFired'] = result.fired
      if (result.errors > 0) logs['routinesErrors'] = result.errors
      const sweep = await sweepStaleRoutineRuns(
        env as unknown as { DB: D1Database; [k: string]: unknown }
      )
      if (sweep.swept > 0) logs['routinesStaleSwept'] = sweep.swept
    } catch (err) {
      logs['routinesError'] = err instanceof Error ? err.message : String(err)
    }

    // 6. Spaces — turn-off-history sweep. Spaces with historyEnabled=0
    // get their messages auto-deleted after 24h. Bounded delete (50 rows
    // per tick) so we never blow the cron budget.
    try {
      const { sweepHistoryDisabledSpaces } = await import('./modules/spaces/history-sweep')
      const removed = await sweepHistoryDisabledSpaces(env.DB)
      if (removed > 0) logs['spacesHistorySwept'] = removed
    } catch (err) {
      logs['spacesHistoryError'] = err instanceof Error ? err.message : String(err)
    }

    if (Object.keys(logs).length > 1) {
      console.log(JSON.stringify({ event: 'cron_tick', ...logs }))
    }
  },
}
