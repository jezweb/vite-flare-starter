import { useState } from 'react'
import { authClient, useSession } from '@/client/lib/auth'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Mail, X, CheckCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

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
      <Alert className="rounded-none border-x-0 border-t-0 bg-green-500/10 dark:bg-green-500/15 border-green-500/20 dark:border-green-500/30">
        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-green-700 dark:text-green-300">
            Verification email sent! Check your inbox.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSuccess(false)}
            className="h-6 px-2 text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200 hover:bg-green-500/10 dark:hover:bg-green-500/20"
          >
            <X className="h-4 w-4" />
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/20 dark:border-amber-500/30">
      <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-amber-700 dark:text-amber-300">
          Please verify your email address to access all features.
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResend}
            disabled={resending}
            className="h-7 border-amber-500/30 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 dark:hover:bg-amber-500/20"
          >
            {resending ? (
              <>
                <Spinner size="xs" className="mr-1" />
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
            className="h-7 px-2 text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 hover:bg-amber-500/10 dark:hover:bg-amber-500/20"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
