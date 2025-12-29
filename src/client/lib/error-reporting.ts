import type { ErrorInfo } from 'react'
import { captureError, setContext, isSentryEnabled } from './sentry'

/**
 * Error reporting interface
 *
 * Sends errors to Sentry when configured, otherwise logs to console.
 */
interface ErrorReport {
  error: Error
  errorInfo?: ErrorInfo
  context?: Record<string, unknown>
  userId?: string
}

/**
 * Report an error to the error tracking service (Sentry)
 *
 * @example
 * reportError({
 *   error: new Error('Something went wrong'),
 *   context: { page: 'settings' },
 *   userId: '123'
 * })
 */
export function reportError(report: ErrorReport): string | undefined {
  // Always log to console in development
  if (import.meta.env.DEV) {
    console.error('[Error Report]', {
      message: report.error.message,
      stack: report.error.stack,
      componentStack: report.errorInfo?.componentStack,
      context: report.context,
      userId: report.userId,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    })
  }

  // Set React component stack as context if available
  if (report.errorInfo?.componentStack) {
    setContext('react', {
      componentStack: report.errorInfo.componentStack,
    })
  }

  // Capture in Sentry
  return captureError(report.error, {
    extra: {
      ...report.context,
      userId: report.userId,
      url: window.location.href,
    },
  })
}

/**
 * Create error handler for ErrorBoundary
 *
 * @example
 * const handleError = useErrorReporting()
 * <ErrorBoundary onError={handleError}>
 */
export function createErrorHandler(userId?: string) {
  return (error: Error, errorInfo: ErrorInfo) => {
    reportError({ error, errorInfo, userId })
  }
}

/**
 * Check if error tracking is enabled
 */
export { isSentryEnabled }
