/**
 * Request ID Middleware
 *
 * Generates a unique request ID for each request and includes it in
 * the response headers. Useful for correlating logs, error reports,
 * and support requests.
 */
import type { MiddlewareHandler } from 'hono'
import type { Env } from '../index'

// Custom context variables
declare module 'hono' {
  interface ContextVariableMap {
    requestId: string
    requestStartTime: number
  }
}

/**
 * Generate a short unique request ID
 * Format: timestamp-random (e.g., "1703123456789-a1b2c3")
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${random}`
}

/**
 * Request ID middleware
 *
 * - Generates a unique ID for each request
 * - Sets it in context for use in logging/error reporting
 * - Returns it in X-Request-ID response header
 * - Tracks request timing
 *
 * @example
 * app.use('*', requestIdMiddleware)
 *
 * // Access in handlers:
 * const requestId = c.get('requestId')
 * console.log(`[${requestId}] Processing request...`)
 */
export const requestIdMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  // Check for incoming request ID (for distributed tracing)
  const incomingRequestId = c.req.header('X-Request-ID')

  // Use incoming ID or generate a new one
  const requestId = incomingRequestId || generateRequestId()
  const startTime = Date.now()

  // Set in context for use throughout the request
  c.set('requestId', requestId)
  c.set('requestStartTime', startTime)

  // Continue processing
  await next()

  // Calculate request duration
  const duration = Date.now() - startTime

  // Add response headers
  c.header('X-Request-ID', requestId)
  c.header('X-Response-Time', `${duration}ms`)
}

/**
 * Get the current request ID from context
 * Returns 'unknown' if middleware hasn't run
 */
export function getRequestId(c: { get: (key: 'requestId') => string | undefined }): string {
  return c.get('requestId') || 'unknown'
}

/**
 * Create a prefixed logger for a request
 * Includes request ID in all log messages
 */
export function createRequestLogger(requestId: string) {
  const prefix = `[${requestId}]`

  return {
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
  }
}
