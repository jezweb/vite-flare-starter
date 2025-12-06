import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Custom fallback UI to render on error */
  fallback?: ReactNode
  /** Callback when an error is caught (for error reporting services) */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  retryCount: number
}

/**
 * React Error Boundary with retry mechanism
 *
 * Catches JavaScript errors in child components and displays
 * a user-friendly error UI with retry option.
 *
 * @example
 * <ErrorBoundary onError={reportToSentry}>
 *   <App />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private maxRetries = 3

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    // Store error info for display
    this.setState({ errorInfo })

    // Call optional error handler (for error reporting services)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    const { retryCount } = this.state

    if (retryCount < this.maxRetries) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: retryCount + 1,
      })
    }
  }

  handleRefresh = () => {
    window.location.reload()
  }

  handleGoBack = () => {
    window.history.back()
  }

  render() {
    const { hasError, error, retryCount } = this.state
    const { children, fallback } = this.props

    if (hasError) {
      // Custom fallback if provided
      if (fallback) {
        return fallback
      }

      const canRetry = retryCount < this.maxRetries

      return (
        <div className="min-h-[400px] flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>We encountered an unexpected error. Please try again.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error details (development only) */}
              {import.meta.env.DEV && error && (
                <div className="rounded-md bg-muted p-3 text-sm font-mono text-muted-foreground overflow-auto max-h-32">
                  {error.message}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {canRetry ? (
                  <Button onClick={this.handleRetry} className="w-full">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again ({this.maxRetries - retryCount} attempts left)
                  </Button>
                ) : (
                  <Button onClick={this.handleRefresh} className="w-full">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Page
                  </Button>
                )}

                <Button variant="outline" onClick={this.handleGoBack} className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Go Back
                </Button>
              </div>

              {!canRetry && (
                <p className="text-center text-sm text-muted-foreground">
                  If the problem persists, please contact support.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )
    }

    return children
  }
}
