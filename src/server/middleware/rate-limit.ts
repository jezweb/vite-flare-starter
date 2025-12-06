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
}

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
function getClientIdentifier(c: any): string {
  // Cloudflare sets CF-Connecting-IP header
  const cfIp = c.req.header('CF-Connecting-IP')
  if (cfIp) return cfIp

  // Fallback for local development
  const xForwardedFor = c.req.header('X-Forwarded-For')
  if (xForwardedFor) return xForwardedFor.split(',')[0]?.trim() || 'localhost'

  return 'localhost'
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

  // Check if this endpoint has rate limiting configured
  const config = ENDPOINT_LIMITS[endpointKey]
  if (!config) {
    // No rate limiting for this endpoint
    await next()
    return
  }

  const limit = RATE_LIMITS[config.key]
  const identifier = getClientIdentifier(c)
  const storeKey = `${endpointKey}:${identifier}`
  const now = Date.now()

  // Get or create rate limit entry
  let entry = rateLimitStore.get(storeKey)
  if (!entry || entry.resetAt < now) {
    // Create new entry or reset expired one
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    }
  }

  // Increment count
  entry.count++
  rateLimitStore.set(storeKey, entry)

  // Check if limit exceeded
  if (entry.count > limit) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)

    return c.json(
      {
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${formatRetryAfter(retryAfterSeconds)}.`,
        retryAfter: retryAfterSeconds,
      },
      429,
      {
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(entry.resetAt / 1000)),
      }
    )
  }

  // Continue with request
  await next()

  // Add rate limit headers to response
  c.res.headers.set('X-RateLimit-Limit', String(limit))
  c.res.headers.set('X-RateLimit-Remaining', String(Math.max(0, limit - entry.count)))
  c.res.headers.set('X-RateLimit-Reset', String(Math.floor(entry.resetAt / 1000)))
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
