import { createMiddleware } from 'hono/factory'
import type { Env } from '../index'
import { RATE_LIMITS } from '@/shared/config/constants'

/**
 * Rate limit configuration by endpoint
 */
interface RateLimitConfig {
  key: keyof typeof RATE_LIMITS
  windowMs: number // Time window in milliseconds
}

/**
 * Map of endpoints to their rate limit configuration
 */
const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  // Password changes: 3 per 24 hours
  'POST:/api/settings/password': {
    key: 'PASSWORD_CHANGE',
    windowMs: 24 * 60 * 60 * 1000,
  },
  // Email changes: 5 per 24 hours
  'POST:/api/settings/email': {
    key: 'EMAIL_CHANGE',
    windowMs: 24 * 60 * 60 * 1000,
  },
  // Account deletion: 1 per 24 hours
  'DELETE:/api/settings/account': {
    key: 'ACCOUNT_DELETION',
    windowMs: 24 * 60 * 60 * 1000,
  },
  // Avatar uploads: 10 per hour
  'POST:/api/settings/avatar': {
    key: 'AVATAR_UPLOAD',
    windowMs: 60 * 60 * 1000,
  },
  // API token creation: 10 per day
  'POST:/api/api-tokens': {
    key: 'TOKEN_CREATION',
    windowMs: 24 * 60 * 60 * 1000,
  },
  // AI chat: 60 per hour (cost protection — one OPENROUTER_API_KEY unlocks paid models)
  'POST:/api/chat': {
    key: 'CHAT',
    windowMs: 60 * 60 * 1000,
  },
  // Structured extraction: 30 per hour
  'POST:/api/chat/extract': {
    key: 'EXTRACT',
    windowMs: 60 * 60 * 1000,
  },
  'POST:/api/chat/stream-extract': {
    key: 'EXTRACT',
    windowMs: 60 * 60 * 1000,
  },
  // Walkabout Guide: 40 questions per hour (one AI call each)
  'POST:/api/walkabout/ask': {
    key: 'WALKABOUT_ASK',
    windowMs: 60 * 60 * 1000,
  },
}

/**
 * Rate limits that apply to URL patterns with dynamic segments. Checked
 * after exact-path lookup fails — the first matching regex wins.
 *
 * Keep the patterns specific — overly broad regexes will hit unintended
 * endpoints.
 */
const PATTERN_LIMITS: Array<{
  method: string
  pattern: RegExp
  config: RateLimitConfig
  displayPath: string
}> = [
  {
    method: 'POST',
    pattern: /^\/api\/skills\/[^/]+\/ai-edit$/,
    config: { key: 'SKILL_AI_EDIT', windowMs: 60 * 60 * 1000 },
    displayPath: 'POST:/api/skills/:name/ai-edit',
  },
]

/**
 * In-memory rate limit store
 *
 * NOTE: This is per-Worker instance. On Cloudflare Workers, each request
 * may hit a different isolate, so limits aren't perfectly enforced but
 * still provide basic protection against obvious abuse.
 *
 * For distributed rate limiting, use Cloudflare Durable Objects or KV.
 */
interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

export interface RateLimitCheck {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds?: number
}

/**
 * Clean up expired entries periodically (every 60 seconds)
 */
let lastCleanup = Date.now()
function cleanupExpiredEntries() {
  const now = Date.now()
  if (now - lastCleanup < 60000) return

  lastCleanup = now
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}

/**
 * Get client identifier for rate limiting
 * Uses CF-Connecting-IP header (set by Cloudflare) or fallback
 */
function getClientIdentifier(c: { req: { header: (name: string) => string | undefined } }): string {
  // Cloudflare sets CF-Connecting-IP header
  const cfIp = c.req.header('CF-Connecting-IP')
  if (cfIp) return cfIp

  // Fallback for local development
  const xForwardedFor = c.req.header('X-Forwarded-For')
  if (xForwardedFor) return xForwardedFor.split(',')[0]?.trim() || 'localhost'

  return 'localhost'
}

export function consumeRateLimit({
  key,
  windowMs,
  identifier,
  routeKey,
}: {
  key: keyof typeof RATE_LIMITS
  windowMs: number
  identifier: string
  routeKey: string
}): RateLimitCheck {
  cleanupExpiredEntries()

  const limit = RATE_LIMITS[key]
  const storeKey = `${routeKey}:${identifier}`
  const now = Date.now()

  let entry = rateLimitStore.get(storeKey)
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    }
  }

  entry.count++
  rateLimitStore.set(storeKey, entry)

  const remaining = Math.max(0, limit - entry.count)
  if (entry.count > limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  return {
    allowed: true,
    limit,
    remaining,
    resetAt: entry.resetAt,
  }
}

export function rateLimitHeaders(check: RateLimitCheck): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(check.limit),
    'X-RateLimit-Remaining': String(check.remaining),
    'X-RateLimit-Reset': String(Math.floor(check.resetAt / 1000)),
    ...(check.retryAfterSeconds ? { 'Retry-After': String(check.retryAfterSeconds) } : {}),
  }
}

export function rateLimitErrorBody(check: RateLimitCheck) {
  const retryAfterSeconds = check.retryAfterSeconds ?? 0
  return {
    error: 'Too many requests',
    message: `Rate limit exceeded. Try again in ${formatRetryAfter(retryAfterSeconds)}.`,
    retryAfter: retryAfterSeconds,
  }
}

/**
 * Rate limiting middleware
 *
 * Checks if the current request exceeds rate limits for the endpoint.
 * Returns 429 Too Many Requests if limit exceeded.
 *
 * Rate limit headers are added to all responses:
 * - X-RateLimit-Limit: Maximum requests allowed
 * - X-RateLimit-Remaining: Requests remaining in window
 * - X-RateLimit-Reset: Unix timestamp when limit resets
 */
export const rateLimiter = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  // Clean up expired entries periodically
  cleanupExpiredEntries()

  // Build endpoint key
  const method = c.req.method
  const path = c.req.path
  const endpointKey = `${method}:${path}`

  // Check if this endpoint has rate limiting configured. Exact-path
  // match first (common case), then regex patterns for dynamic routes.
  let config = ENDPOINT_LIMITS[endpointKey]
  let patternKey = endpointKey
  if (!config) {
    const patternHit = PATTERN_LIMITS.find((p) => p.method === method && p.pattern.test(path))
    if (patternHit) {
      config = patternHit.config
      patternKey = `${method}:${patternHit.displayPath}`
    }
  }
  if (!config) {
    // No rate limiting for this endpoint
    await next()
    return
  }

  const identifier = getClientIdentifier(c)
  const check = consumeRateLimit({
    key: config.key,
    windowMs: config.windowMs,
    identifier,
    routeKey: patternKey,
  })

  // Check if limit exceeded
  if (!check.allowed) {
    return c.json(rateLimitErrorBody(check), 429, rateLimitHeaders(check))
  }

  // Continue with request
  await next()

  // Add rate limit headers to response
  for (const [name, value] of Object.entries(rateLimitHeaders(check))) {
    c.res.headers.set(name, value)
  }
})

/**
 * Format retry-after seconds into human readable string
 */
function formatRetryAfter(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`
  }
  if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60)
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }
  const hours = Math.ceil(seconds / 3600)
  return `${hours} hour${hours === 1 ? '' : 's'}`
}
