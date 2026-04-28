/**
 * MembersList — table of an org's members with role display + actions.
 *
 * Owners can change a member's role, remove members, or transfer
 * ownership. Admins can remove members but not change roles. Members
 * see read-only.
 *
 * "You" row is identified by the active session's user id and pinned
 * with a "(you)" suffix; can leave (unless sole owner) but can't remove
 * self via the kebab menu.
 */
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, MoreVertical, Trash2, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useSession } from '@/client/lib/auth'
import {
  useOrgMembers,
  useRemoveMember,
  useUpdateMemberRole,
  type OrgMember,
  type OrgRole,
} from '../hooks/useOrganizations'
import { cn } from '@/lib/utils'
import { formatRole } from '@/shared/format/agent'

interface Props {
  organizationId: string
  myRole: OrgRole
}

export function MembersList({ organizationId, myRole }: Props) {
  const { data, isLoading } = useOrgMembers(organizationId)
  const { data: session } = useSession()
  const myUserId = session?.user?.id
  const removeMember = useRemoveMember()
  const updateRole = useUpdateMemberRole()
  const [confirmRemove, setConfirmRemove] = useState<OrgMember | null>(null)

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  const members = data?.members ?? []
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">No members yet.</p>
  }

  const ownerCount = members.filter((m) => m.role === 'owner').length
  const canManage = myRole === 'owner' || myRole === 'admin'

  const handleRemove = async () => {
    if (!confirmRemove) return
    try {
      await removeMember.mutateAsync({
        organizationId,
        memberIdOrEmail: confirmRemove.id,
      })
      toast.success(`Removed ${confirmRemove.user.name ?? confirmRemove.user.email}`)
      setConfirmRemove(null)
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Remove failed')
    }
  }

  const handleRoleChange = async (member: OrgMember, role: OrgRole) => {
    try {
      await updateRole.mutateAsync({
        organizationId,
        memberId: member.id,
        role,
      })
      toast.success(`${member.user.name ?? member.user.email} is now ${formatRole(role)}`)
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Role change failed')
    }
  }

  return (
    <>
      <ul className="divide-y rounded-md border">
        {members.map((m) => {
          const isMe = m.userId === myUserId
          const isLastOwner = m.role === 'owner' && ownerCount === 1
          const canRemoveThisMember = canManage && !isMe && !isLastOwner
          const canChangeRole = myRole === 'owner' && !isLastOwner
          return (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar member={m} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">
                    {m.user.name ?? m.user.email}
                  </span>
                  {isMe && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      you
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{m.user.email}</p>
              </div>
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                {formatRole(m.role)}
              </Badge>
              <span className="hidden sm:inline text-[11px] text-muted-foreground tabular-nums">
                joined {formatDistanceToNow(parseDate(m.createdAt), { addSuffix: true })}
              </span>
              {(canChangeRole || canRemoveThisMember) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      aria-label={`Manage ${m.user.name ?? m.user.email}`}
                    >
                      <MoreVertical className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canChangeRole && (
                      <>
                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          Role
                        </DropdownMenuLabel>
                        {(['owner', 'admin', 'member'] as OrgRole[]).map((role) => (
                          <DropdownMenuItem
                            key={role}
                            onClick={() => handleRoleChange(m, role)}
                            disabled={m.role === role}
                          >
                            <UserCog className="size-3.5" />
                            {role === m.role ? `${formatRole(role)} (current)` : formatRole(role)}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                    {canChangeRole && canRemoveThisMember && <DropdownMenuSeparator />}
                    {canRemoveThisMember && (
                      <DropdownMenuItem
                        onClick={() => setConfirmRemove(m)}
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                        Remove from org
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="w-7" aria-hidden /> /* spacer to keep cols aligned */
              )}
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
        title="Remove member?"
        description={`${confirmRemove?.user.name ?? confirmRemove?.user.email ?? 'This member'} will lose access to the organisation immediately. They can be re-invited later.`}
        confirmLabel="Remove member"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </>
  )
}

/**
 * Better-auth's adapter returns createdAt as either a Unix integer
 * (when the row was inserted by raw SQL — e.g. our backfill migration)
 * OR an ISO 8601 string (when inserted via the plugin's adapter).
 * Normalise to Date.
 */
function parseDate(raw: number | string): Date {
  if (typeof raw === 'number') return new Date(raw * 1000)
  return new Date(raw)
}

function Avatar({ member }: { member: OrgMember }) {
  const letter = (member.user.name ?? member.user.email).trim()[0]?.toUpperCase() ?? '?'
  if (member.user.image) {
    return (
      <img
        src={member.user.image}
        alt=""
        className={cn('size-8 shrink-0 rounded-full object-cover')}
      />
    )
  }
  return (
    <div className="size-8 shrink-0 rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-semibold">
      {letter}
    </div>
  )
}
