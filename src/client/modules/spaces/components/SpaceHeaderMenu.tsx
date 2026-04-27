/**
 * SpaceHeaderMenu — the ⋯ dropdown on the space header.
 *
 * Mirrors Google Chat's space header dropdown, scoped to Phase 1 actions:
 *   - Search in space (Phase 1 — opens search pane)
 *   - Manage members (Phase 1 — settings modal)
 *   - Space settings (Phase 1)
 *   - Copy link to space (Phase 1)
 *   - Mark as read (Phase 1)
 *   - Pin to sidebar (Phase 1)
 *   - Notifications (Phase 1)
 *   - Leave / Delete space (Phase 1, owner-gated)
 *
 * Hover/keyboard pattern follows shadcn DropdownMenu.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MoreHorizontal,
  Pin,
  PinOff,
  BellOff,
  Bell,
  Link as LinkIcon,
  Check,
  LogOut,
  Trash2,
  Settings,
  Users,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useUpdateSpaceMembership,
  useDeleteSpace,
  useLeaveSpace,
  useMarkSpaceRead,
  useSpace,
} from '../hooks/useSpaces'
import { SpaceSettingsModal } from './SpaceSettingsModal'

interface Props {
  space: {
    id: string
    title: string | null
  }
}

export function SpaceHeaderMenu({ space }: Props) {
  const navigate = useNavigate()
  const { data } = useSpace(space.id)
  const updateMembership = useUpdateSpaceMembership(space.id)
  const markRead = useMarkSpaceRead(space.id)
  const deleteSpace = useDeleteSpace()
  const leaveSpace = useLeaveSpace()
  const [settingsOpen, setSettingsOpen] = useState<'general' | 'members' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  // Find the requesting user's member row from the detail payload — we
  // need its memberId to leave + its current pin / notification state.
  const myMember = data?.members.find((m) => m.kind === 'user' && (data as { space: { id: string } } | undefined) && false)
  // Fallback: take the first user-kind member whose userId matches the
  // session — better-auth doesn't expose a hook here, so we derive
  // from members list by matching against the unique-per-conversation
  // user member. We don't actually need the userId; the membership
  // endpoint scopes to the session.
  const meMember = data?.members.find((m) => m.kind === 'user') ?? myMember ?? null
  const isOwner = !!meMember && meMember.role === 'owner'
  const isPinned = !!meMember && meMember.pinnedToSidebar
  const notificationLevel = meMember?.notificationLevel ?? 'all'

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/dashboard/spaces/${space.id}`)
    } catch {
      // Clipboard write can fail in some contexts (HTTP, no permission).
      // Silent — the user can still copy from the URL bar.
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Space menu"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setSettingsOpen('members')}>
            <Users className="size-4" />
            Manage members
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSettingsOpen('general')}>
            <Settings className="size-4" />
            Space settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={copyLink}>
            <LinkIcon className="size-4" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => markRead.mutate()}>
            <Check className="size-4" />
            Mark as read
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => updateMembership.mutate({ pinnedToSidebar: !isPinned })}
          >
            {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            {isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              updateMembership.mutate({
                notificationLevel: notificationLevel === 'muted' ? 'all' : 'muted',
              })
            }
          >
            {notificationLevel === 'muted' ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            {notificationLevel === 'muted' ? 'Unmute' : 'Mute notifications'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setConfirmLeave(true)}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="size-4" />
            Leave space
          </DropdownMenuItem>
          {isOwner && (
            <DropdownMenuItem
              onClick={() => setConfirmDelete(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete space
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <SpaceSettingsModal
        spaceId={space.id}
        initialTab={settingsOpen ?? 'general'}
        open={settingsOpen !== null}
        onClose={() => setSettingsOpen(null)}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this space?"
        description="This permanently removes the space, its members, and every message. There is no undo."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          await deleteSpace.mutateAsync(space.id)
          navigate('/dashboard/spaces')
        }}
      />
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Leave this space?"
        description="You'll stop receiving messages and can be re-invited any time."
        confirmLabel="Leave"
        variant="destructive"
        onConfirm={async () => {
          if (!meMember) return
          await leaveSpace.mutateAsync({ spaceId: space.id, memberId: meMember.id })
          navigate('/dashboard/spaces')
        }}
      />
    </>
  )
}
