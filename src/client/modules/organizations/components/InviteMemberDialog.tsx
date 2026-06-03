/**
 * InviteMemberDialog — invite a teammate by email.
 *
 * Sends to better-auth's invite-member endpoint. When SMTP isn't
 * wired (Phase 5 territory), the response includes the invitation
 * link directly — we surface it as a Copy Link affordance so the
 * inviter can share it manually until the email path goes live.
 */
import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { CopyButton } from '@/components/ui/copy-button'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useInviteMember, type OrgRole } from '../hooks/useOrganizations'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
}

export function InviteMemberDialog({ open, onOpenChange, organizationId }: Props) {
  const invite = useInviteMember()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('member')
  const [issuedLink, setIssuedLink] = useState<string | null>(null)

  // Reset state every time the dialog re-opens.
  useEffect(() => {
    if (open) {
      setEmail('')
      setRole('member')
      setIssuedLink(null)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    try {
      const res = await invite.mutateAsync({
        organizationId,
        email: email.trim().toLowerCase(),
        role,
      })
      // The plugin returns an invitation row including its id. Build
      // the public accept-invitation URL from it. Phase 4 ships the
      // public route at /accept-invitation/:token.
      const acceptUrl = `${window.location.origin}/accept-invitation/${(res as { id?: string }).id ?? ''}`
      setIssuedLink(acceptUrl)
      toast.success('Invitation issued')
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Invite failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {!issuedLink ? (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Invite a teammate</DialogTitle>
              <DialogDescription>
                They'll get a link to join your organisation. Email delivery will land in Phase 5;
                for now copy the link from the next screen and share it however you like.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <Field>
                <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  autoFocus
                  autoComplete="off"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member — read + use</SelectItem>
                    <SelectItem value="admin">Admin — manage members</SelectItem>
                    <SelectItem value="owner">Owner — full control</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={invite.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!email.trim() || invite.isPending}>
                {invite.isPending ? (
                  <>
                    <Spinner size="sm" />
                    Inviting…
                  </>
                ) : (
                  'Send invite'
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invitation ready</DialogTitle>
              <DialogDescription>
                Share this link with {email}. It expires in 48 hours by default. Email delivery
                lands in Phase 5.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <div className="rounded-md border bg-muted/30 p-2 break-all text-xs font-mono">
                {issuedLink}
              </div>
              <CopyButton
                value={issuedLink ?? ''}
                label="Copy invitation link"
                successMessage="Link copied"
                variant="outline"
                className="gap-2 w-full"
              />
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
