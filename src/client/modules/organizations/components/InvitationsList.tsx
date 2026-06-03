/**
 * InvitationsList — pending invitations panel for the org's Members tab.
 *
 * Shows email, role, expiry, and a "Copy link" / "Cancel" pair per row.
 * Hidden entirely when there are no pending invitations.
 */
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { CopyButton } from '@/components/ui/copy-button'
import { Time } from '@/components/ui/time'
import { useOrgInvitations, useCancelInvitation } from '../hooks/useOrganizations'

interface Props {
  organizationId: string
}

export function InvitationsList({ organizationId }: Props) {
  const { data, isLoading } = useOrgInvitations(organizationId)
  const cancel = useCancelInvitation()
  const invitations = data?.invitations ?? []
  const pending = invitations.filter((i) => i.status === 'pending')

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner size="xs" />
        Loading invitations…
      </div>
    )
  }
  if (pending.length === 0) return null

  const handleCancel = async (id: string, email: string) => {
    try {
      await cancel.mutateAsync(id)
      toast.success(`Invitation to ${email} cancelled`)
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Cancel failed')
    }
  }

  const linkFor = (id: string) => `${window.location.origin}/accept-invitation/${id}`

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pending invitations</CardTitle>
        <CardDescription className="text-[11px]">
          Invitees can accept the link any time before the expiry. Email delivery lands in Phase 5 —
          copy the link and share manually.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {pending.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{inv.email}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                    {inv.role}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Expires <Time value={inv.expiresAt} display="relative" />
                </p>
              </div>
              <CopyButton
                value={linkFor(inv.id)}
                label="Copy link"
                successMessage="Invitation link copied"
                size="xs"
                aria-label={`Copy invitation link for ${inv.email}`}
              />
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => handleCancel(inv.id, inv.email)}
                disabled={cancel.isPending}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Cancel invitation to ${inv.email}`}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
