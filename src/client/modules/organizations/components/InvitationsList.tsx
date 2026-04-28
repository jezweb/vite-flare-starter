/**
 * InvitationsList — pending invitations panel for the org's Members tab.
 *
 * Shows email, role, expiry, and a "Copy link" / "Cancel" pair per row.
 * Hidden entirely when there are no pending invitations.
 */
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Loader2, Copy, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
        <Loader2 className="size-3 animate-spin" />
        Loading invitations…
      </div>
    )
  }
  if (pending.length === 0) return null

  const copyLink = async (id: string) => {
    const url = `${window.location.origin}/accept-invitation/${id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error('Copy failed — long-press to copy manually')
    }
  }

  const handleCancel = async (id: string, email: string) => {
    try {
      await cancel.mutateAsync(id)
      toast.success(`Cancelled invitation to ${email}`)
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Cancel failed')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pending invitations</CardTitle>
        <CardDescription className="text-[11px]">
          Invitees can accept the link any time before the expiry. Email
          delivery lands in Phase 5 — copy the link and share manually.
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
                  Expires {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyLink(inv.id)}
                className="gap-1 h-7"
                aria-label={`Copy invitation link for ${inv.email}`}
              >
                <Copy className="size-3" />
                Copy link
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleCancel(inv.id, inv.email)}
                disabled={cancel.isPending}
                className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
