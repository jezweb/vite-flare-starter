import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { authClient } from '@/client/lib/auth'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field'
import { CheckCircle, XCircle, Mail, Loader2 } from 'lucide-react'

type VerificationState = 'verifying' | 'success' | 'error' | 'resend'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [state, setState] = useState<VerificationState>('verifying')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)

  // Check for error in URL params (e.g., ?error=invalid_token)
  const urlError = searchParams.get('error')
  const token = searchParams.get('token')

  useEffect(() => {
    // If there's an error param, show error state
    if (urlError) {
      setState('error')
      if (urlError === 'invalid_token') {
        setError('This verification link is invalid or has expired.')
      } else {
        setError('There was a problem verifying your email.')
      }
      return
    }

    // If there's a token, the verification was handled by better-auth
    // and we should show success (user was redirected here after verification)
    if (token) {
      setState('success')
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/dashboard')
      }, 3000)
      return
    }

    // No token and no error - show resend form
    setState('resend')
  }, [urlError, token, navigate])

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setResending(true)
    setError('')
    setResendSuccess(false)

    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: '/verify-email',
      })
      setResendSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification email')
    } finally {
      setResending(false)
    }
  }

  // Verifying state
  if (state === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-lg font-medium">Verifying your email...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Success state
  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader>
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <CardTitle className="text-center">Email Verified!</CardTitle>
              <CardDescription className="text-center">
                Your email has been successfully verified. Redirecting to dashboard...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/dashboard">Go to Dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Error or Resend state
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <div className="flex justify-center mb-4">
              {state === 'error' ? (
                <XCircle className="h-16 w-16 text-destructive" />
              ) : (
                <Mail className="h-16 w-16 text-primary" />
              )}
            </div>
            <CardTitle className="text-center">
              {state === 'error' ? 'Verification Failed' : 'Verify Your Email'}
            </CardTitle>
            <CardDescription className="text-center">
              {state === 'error'
                ? error || 'There was a problem verifying your email.'
                : 'Enter your email address to receive a new verification link.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resendSuccess ? (
              <div className="text-center space-y-4">
                <div className="p-3 bg-green-500/10 text-green-600 rounded-md">
                  Verification email sent! Check your inbox.
                </div>
                <p className="text-sm text-muted-foreground">
                  Didn't receive it? Check your spam folder or try again.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setResendSuccess(false)}
                  className="w-full"
                >
                  Send Another Email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResendVerification}>
                <FieldGroup>
                  {error && state !== 'error' && (
                    <div className="p-3 text-sm text-destructive-foreground bg-destructive/10 border border-destructive rounded-md">
                      {error}
                    </div>
                  )}
                  <Field>
                    <FieldLabel htmlFor="email">Email Address</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={resending}
                    />
                  </Field>
                  <Button type="submit" className="w-full" disabled={resending}>
                    {resending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Verification Email'
                    )}
                  </Button>
                  <div className="text-center text-sm text-muted-foreground">
                    <Link to="/sign-in" className="text-primary hover:underline">
                      Back to Sign In
                    </Link>
                  </div>
                </FieldGroup>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
