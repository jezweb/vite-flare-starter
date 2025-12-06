import type { ErrorInfo } from 'react'

/**
 * Error reporting interface
 *
 * Currently logs to console. Replace with Sentry, LogRocket,
 * or your preferred error tracking service.
 */
interface ErrorReport {
  error: Error
  errorInfo?: ErrorInfo
  context?: Record<string, unknown>
  userId?: string
}

/**
 * Report an error to the error tracking service
 *
 * @example
 * reportError({
 *   error: new Error('Something went wrong'),
 *   context: { page: 'settings' },
 *   userId: '123'
 * })
 */
export function reportError(report: ErrorReport): void {
  // Log to console in development
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

  // TODO: Send to error tracking service
  // Example Sentry integration:
  // Sentry.captureException(report.error, {
  //   contexts: {
  //     react: { componentStack: report.errorInfo?.componentStack },
  //   },
  //   extra: report.context,
  //   user: report.userId ? { id: report.userId } : undefined,
  // })
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
