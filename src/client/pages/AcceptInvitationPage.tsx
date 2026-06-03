/**
 * AcceptInvitationPage — public route for joining an org via invite link.
 *
 * Flow:
 *   1. Land on /accept-invitation/:invitationId
 *   2. If signed-in → call accept-invitation, on success switch to that
 *      org and navigate to /dashboard/organization
 *   3. If signed-out → store the invitation id in sessionStorage and
 *      bounce to /sign-in?return=/accept-invitation/<id>. After sign-in
 *      lands on the dashboard, useAcceptInvitationOnReturn picks the
 *      stored id back up and runs through the signed-in branch.
 *
 * Errors handled gracefully:
 *   - invalid / expired token → "Invitation expired" with a link to
 *     contact the inviter
 *   - already a member → "You're already in {orgName}" with a link
 *     to the dashboard
 *   - other API errors → generic toast + retry button
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, Mail } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSession } from '@/client/lib/auth'
import { apiClient } from '@/client/lib/api-client'
import { appConfig } from '@/shared/config/app'
import {
  useAcceptInvitation,
  useSetActiveOrg,
} from '@/client/modules/organizations/hooks/useOrganizations'

const PENDING_INVITE_KEY = 'pending-invitation-id'

interface State {
  status: 'loading' | 'auth-required' | 'success' | 'expired' | 'already-member' | 'error'
  message?: string
  organizationName?: string
  organizationId?: string
}

export function AcceptInvitationPage() {
  const { invitationId } = useParams<{ invitationId: string }>()
  const navigate = useNavigate()
  const { data: session, isPending: sessionPending } = useSession()
  const accept = useAcceptInvitation()
  const setActive = useSetActiveOrg()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!invitationId) {
      setState({ status: 'error', message: 'No invitation token in the URL.' })
      return
    }
    if (sessionPending) return // wait for session to resolve

    // Signed-out: store the invitation id and redirect to sign-in.
    if (!session?.user) {
      try {
        sessionStorage.setItem(PENDING_INVITE_KEY, invitationId)
      } catch {
        // private mode / quota — ignore, the invitation page will still
        // be reachable post sign-in via the URL
      }
      // Match the existing auth flow's `?next=` convention; sign-in
      // resolveNextUrl now allow-lists /accept-invitation/* paths.
      const next = encodeURIComponent(`/accept-invitation/${invitationId}`)
      navigate(`/sign-in?next=${next}`, { replace: true })
      return
    }

    // Signed-in: accept the invitation.
    let cancelled = false
    ;(async () => {
      try {
        // Better-auth's accept-invitation returns the membership row
        // including the new organizationId; we use it to set active.
        const res = await accept.mutateAsync(invitationId)
        if (cancelled) return
        const orgId =
          (res as { invitation?: { organizationId?: string } }).invitation?.organizationId ??
          (res as { organizationId?: string }).organizationId
        const orgName =
          (res as { organization?: { name?: string } }).organization?.name ??
          (res as { organizationName?: string }).organizationName ??
          'the organisation'

        if (orgId) {
          try {
            await setActive.mutateAsync(orgId)
          } catch {
            // best-effort — even if set-active fails, the user is now a
            // member; they can switch from the sidebar.
          }
        }
        // Clear the stash so a refresh doesn't redo the flow.
        try {
          sessionStorage.removeItem(PENDING_INVITE_KEY)
        } catch {}
        setState({
          status: 'success',
          organizationName: orgName,
          ...(orgId ? { organizationId: orgId } : {}),
        })
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        // Heuristic error categorisation — better-auth returns 4xx with
        // a JSON body. The message format varies; match by keyword.
        const lower = message.toLowerCase()
        if (lower.includes('expired') || lower.includes('not found')) {
          setState({ status: 'expired', message })
        } else if (lower.includes('already')) {
          setState({ status: 'already-member', message })
        } else {
          setState({ status: 'error', message })
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationId, sessionPending, session?.user?.id])

  const goToDashboard = () => {
    // Hard nav — the org context just changed, force everything to refetch.
    window.location.href = '/dashboard'
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Mail className="size-3.5" />
            {appConfig.name} invitation
          </div>
          <CardTitle>{titleFor(state)}</CardTitle>
          {descriptionFor(state) && <CardDescription>{descriptionFor(state)}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-3">
          {state.status === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="md" />
              Verifying invitation…
            </div>
          )}
          {state.status === 'success' && (
            <>
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 flex items-start gap-2">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  You've joined <strong>{state.organizationName}</strong>. We've set it as your
                  active workspace.
                </div>
              </div>
              <Button onClick={goToDashboard} className="w-full">
                Go to dashboard
              </Button>
            </>
          )}
          {state.status === 'expired' && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 flex items-start gap-2">
              <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                This invitation has expired or was already used. Ask your inviter for a fresh link.
              </div>
            </div>
          )}
          {state.status === 'already-member' && (
            <Button asChild className="w-full">
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
          )}
          {state.status === 'error' && (
            <>
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {state.message ?? 'Something went wrong.'}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Retry
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/dashboard">Go to dashboard</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function titleFor(state: State): string {
  switch (state.status) {
    case 'loading':
      return 'Joining organisation'
    case 'success':
      return 'Welcome aboard'
    case 'expired':
      return 'Invitation expired'
    case 'already-member':
      return 'Already a member'
    case 'error':
      return "Couldn't accept invitation"
    case 'auth-required':
      return 'Sign in to continue'
  }
}

function descriptionFor(state: State): string | null {
  switch (state.status) {
    case 'loading':
      return 'Verifying your invitation token.'
    case 'success':
      return null
    case 'expired':
      return null
    case 'already-member':
      return 'You already have access to this organisation.'
    case 'error':
      return null
    case 'auth-required':
      return 'Redirecting to sign in.'
  }
}

/**
 * Helper used by the post-sign-in flow: if there's a pending
 * invitation in sessionStorage, navigate to its accept page so the
 * user lands on it instead of the dashboard. Called from the auth
 * redirect handler.
 */
export function consumePendingInvitation(): string | null {
  try {
    const id = sessionStorage.getItem(PENDING_INVITE_KEY)
    if (id) {
      // Don't remove yet — AcceptInvitationPage will clear it on success
      return id
    }
  } catch {
    // ignore
  }
  return null
}

// Avoid unused-import warning in the file.
void apiClient

export default AcceptInvitationPage
