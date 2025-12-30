/**
 * Sentry Client Configuration
 *
 * Initializes Sentry for client-side error tracking.
 * Only initializes if VITE_SENTRY_DSN is set.
 *
 * ⚠️  SECURITY: The release name can identify framework identity.
 * Set VITE_APP_ID env var to customize (see src/shared/config/app.ts)
 */
import * as Sentry from '@sentry/react'
import { getSentryRelease } from '@/shared/config/app'

const SENTRY_DSN = import.meta.env['VITE_SENTRY_DSN']
const SENTRY_ENVIRONMENT = import.meta.env['VITE_SENTRY_ENVIRONMENT'] || 'development'
const APP_VERSION = import.meta.env['VITE_APP_VERSION'] || '0.0.0'

/**
 * Whether Sentry is enabled (DSN is configured)
 */
export const isSentryEnabled = !!SENTRY_DSN

/**
 * Initialize Sentry for client-side error tracking
 * Should be called once at app startup
 */
export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.info('[Sentry] DSN not configured, error tracking disabled')
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: getSentryRelease(APP_VERSION),

    // Performance monitoring
    tracesSampleRate: SENTRY_ENVIRONMENT === 'production' ? 0.1 : 1.0,

    // Session replay for errors
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: SENTRY_ENVIRONMENT === 'production' ? 1.0 : 0,

    // Only send errors in production, or if explicitly enabled
    enabled: SENTRY_ENVIRONMENT === 'production' || import.meta.env['VITE_SENTRY_DEBUG'] === 'true',

    // Filter out known non-errors
    beforeSend(event, hint) {
      const error = hint.originalException

      // Ignore cancelled requests
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return null
        }
        // Ignore network errors that are likely user connectivity issues
        if (error.message.includes('Failed to fetch') || error.message.includes('Load failed')) {
          return null
        }
      }

      return event
    },

    // Don't send breadcrumbs for console logs in development
    beforeBreadcrumb(breadcrumb) {
      if (SENTRY_ENVIRONMENT !== 'production' && breadcrumb.category === 'console') {
        return null
      }
      return breadcrumb
    },

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  })

  console.info('[Sentry] Initialized for environment:', SENTRY_ENVIRONMENT)
}

/**
 * Set the current user context for Sentry
 */
export function setUser(user: { id: string; email?: string; name?: string } | null): void {
  if (!isSentryEnabled) return

  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
    })
  } else {
    Sentry.setUser(null)
  }
}

/**
 * Add extra context to future error reports
 */
export function setContext(name: string, context: Record<string, unknown>): void {
  if (!isSentryEnabled) return
  Sentry.setContext(name, context)
}

/**
 * Set a tag for filtering in Sentry
 */
export function setTag(key: string, value: string): void {
  if (!isSentryEnabled) return
  Sentry.setTag(key, value)
}

/**
 * Capture an error and send to Sentry
 */
export function captureError(
  error: Error,
  context?: {
    tags?: Record<string, string>
    extra?: Record<string, unknown>
    level?: 'fatal' | 'error' | 'warning' | 'info'
  }
): string | undefined {
  if (!isSentryEnabled) {
    console.error('[Sentry disabled]', error, context)
    return undefined
  }

  return Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra,
    level: context?.level || 'error',
  })
}

/**
 * Capture a message (non-error) and send to Sentry
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  extra?: Record<string, unknown>
): string | undefined {
  if (!isSentryEnabled) {
    console.log(`[Sentry disabled] ${level}:`, message, extra)
    return undefined
  }

  return Sentry.captureMessage(message, {
    level,
    extra,
  })
}

/**
 * Add a breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
  message: string
  category?: string
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug'
  data?: Record<string, unknown>
}): void {
  if (!isSentryEnabled) return
  Sentry.addBreadcrumb(breadcrumb)
}

// Re-export Sentry's ErrorBoundary for use with React
export { ErrorBoundary as SentryErrorBoundary } from '@sentry/react'
