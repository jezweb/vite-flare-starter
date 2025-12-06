import { createMiddleware } from 'hono/factory'
import type { Env } from '../index'

/**
 * Security headers middleware
 *
 * Applies security headers to all responses:
 * - X-Content-Type-Options: Prevents MIME sniffing
 * - X-Frame-Options: Prevents clickjacking
 * - Referrer-Policy: Controls referrer information
 * - Permissions-Policy: Restricts browser features
 * - CSP: Content Security Policy for HTML responses
 * - HSTS: Strict transport security (production only)
 */
export const securityHeaders = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  await next()

  // Always set these security headers
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.set('X-XSS-Protection', '1; mode=block')

  // Permissions Policy (formerly Feature-Policy)
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // Get content type to determine if CSP should be applied
  const contentType = c.res.headers.get('Content-Type') || ''
  const isHtml = contentType.includes('text/html')
  const isApi = c.req.path.startsWith('/api/')

  // CSP only for HTML responses (not API JSON responses)
  if (isHtml && !isApi) {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // unsafe-inline for Vite HMR in dev
      "style-src 'self' 'unsafe-inline'", // inline styles from components
      "img-src 'self' data: https:", // Allow https images
      "font-src 'self' data:",
      "connect-src 'self' https://accounts.google.com", // Google OAuth
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

    c.res.headers.set('Content-Security-Policy', csp)
  }

  // HSTS - only in production
  if (c.env.NODE_ENV === 'production') {
    c.res.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }
})
