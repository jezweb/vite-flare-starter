/**
 * Sentry Server Configuration (Cloudflare Workers)
 *
 * Provides error tracking for the server-side Hono application.
 * Uses @sentry/cloudflare for Cloudflare Workers compatibility.
 *
 * Note: The Cloudflare SDK doesn't require initialization like other SDKs.
 * The `withSentry` handler wrapper or direct function calls handle setup.
 */
import {
  captureException,
  captureMessage,
  setUser,
  setContext,
  setTag,
  addBreadcrumb,
  type SeverityLevel,
} from '@sentry/cloudflare'
import type { Context } from 'hono'
import type { Env } from '../index'

/**
 * Check if Sentry is enabled (DSN is configured)
 */
export function isSentryEnabled(env?: { SENTRY_DSN?: string }): boolean {
  return !!env?.SENTRY_DSN
}

/**
 * Capture an exception in Sentry with request context
 *
 * @param error - The error to capture
 * @param c - Hono context for extracting request details
 * @param extra - Additional context to attach to the error
 */
export function captureServerException(
  error: Error,
  c?: Context<{ Bindings: Env }>,
  extra?: Record<string, unknown>
): void {
  const env = c?.env

  if (!isSentryEnabled(env)) {
    console.error('[Sentry disabled] Server error:', error.message, extra)
    return
  }

  // Add request context
  const requestContext: Record<string, unknown> = {}

  if (c) {
    requestContext['method'] = c.req.method
    requestContext['url'] = c.req.url
    requestContext['path'] = c.req.path

    // Get request ID if available (set by request-id middleware)
    try {
      const requestId = (c as unknown as { get: (key: string) => unknown }).get('requestId')
      if (requestId) requestContext['requestId'] = requestId
    } catch {
      // requestId not set
    }

    // Get user info if available (set by auth middleware)
    try {
      const userId = (c as unknown as { get: (key: string) => unknown }).get('userId')
      if (userId && typeof userId === 'string') {
        setUser({ id: userId })
      }
    } catch {
      // userId not set
    }
  }

  captureException(error, {
    extra: {
      ...requestContext,
      ...extra,
    },
  })
}

/**
 * Capture a message in Sentry
 *
 * @param message - The message to capture
 * @param level - Severity level
 * @param env - Environment bindings
 * @param extra - Additional context
 */
export function captureServerMessage(
  message: string,
  level: SeverityLevel,
  env?: { SENTRY_DSN?: string },
  extra?: Record<string, unknown>
): void {
  if (!isSentryEnabled(env)) {
    console.log(`[Sentry disabled] ${level}:`, message, extra)
    return
  }

  captureMessage(message, {
    level,
    extra,
  })
}

/**
 * Set user context for Sentry
 */
export function setServerUser(user: { id: string; email?: string } | null): void {
  if (user) {
    setUser({ id: user.id, email: user.email })
  } else {
    setUser(null)
  }
}

/**
 * Set extra context for Sentry
 */
export function setServerContext(name: string, context: Record<string, unknown>): void {
  setContext(name, context)
}

/**
 * Set a tag for filtering in Sentry
 */
export function setServerTag(key: string, value: string): void {
  setTag(key, value)
}

/**
 * Add a breadcrumb for debugging
 */
export function addServerBreadcrumb(breadcrumb: {
  message: string
  category?: string
  level?: SeverityLevel
  data?: Record<string, unknown>
}): void {
  addBreadcrumb(breadcrumb)
}
