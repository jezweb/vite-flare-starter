import { useState } from 'react'
import { authClient, useSession } from '@/client/lib/auth'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Mail, Loader2, X, CheckCircle } from 'lucide-react'

export function EmailVerificationBanner() {
  const { data: session } = useSession()
  const [resending, setResending] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [success, setSuccess] = useState(false)

  // Don't show if user is verified, dismissed, or not logged in
  if (!session?.user || session.user.emailVerified || dismissed) {
    return null
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await authClient.sendVerificationEmail({
        email: session.user.email,
        callbackURL: '/verify-email',
      })
      setSuccess(true)
      // Hide success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000)
    } catch (error) {
      console.error('Failed to resend verification email:', error)
    } finally {
      setResending(false)
    }
  }

  if (success) {
    return (
      <Alert className="rounded-none border-x-0 border-t-0 bg-green-500/10 border-green-500/20">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-green-600">
            Verification email sent! Check your inbox.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSuccess(false)}
            className="h-6 px-2 text-green-600 hover:text-green-700 hover:bg-green-500/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-yellow-500/10 border-yellow-500/20">
      <Mail className="h-4 w-4 text-yellow-600" />
      <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-yellow-600">
          Please verify your email address to access all features.
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResend}
            disabled={resending}
            className="h-7 border-yellow-500/30 text-yellow-600 hover:bg-yellow-500/10"
          >
            {resending ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Sending...
              </>
            ) : (
              'Resend Email'
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="h-7 px-2 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-500/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
