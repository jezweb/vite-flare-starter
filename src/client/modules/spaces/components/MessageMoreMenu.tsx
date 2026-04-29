/**
 * MessageMoreMenu — the "⋯" overflow on a message's hover action bar.
 *
 * Phase 2/3 actions:
 *   - Star / Unstar (personal bookmark)
 *   - Pin / Unpin (admin/owner only — pin-to-space shelf)
 *   - Quote in reply (composes a quote chip in the input)
 *   - Forward to space (Phase 3 dialog)
 *   - Copy link
 *   - Delete (author only)
 */
import { useState } from 'react'
import {
  MoreHorizontal,
  Star,
  StarOff,
  Pin,
  PinOff,
  Quote,
  Forward,
  Link as LinkIcon,
  Trash2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSession } from '@/client/lib/auth'
import { useCopy } from '@/client/lib/use-copy'
import { usePinMessage, useStarMessage } from '../hooks/useSpaces'
import { ForwardMessageDialog } from './ForwardMessageDialog'
import type { SpaceMessage } from '../hooks/useSpaces'
import { apiClient } from '@/client/lib/api-client'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  message: SpaceMessage
  /** Caller (SpacePage) opens a quote-reply by setting parent state. */
  onQuote?: (msg: SpaceMessage) => void
  /** True if the current user is owner/admin in this space (controls pin enable). */
  canPin: boolean
}

export function MessageMoreMenu({ message, onQuote, canPin }: Props) {
  const { data: session } = useSession()
  const qc = useQueryClient()
  const sessionUserId = session?.user?.id
  const [forwardOpen, setForwardOpen] = useState(false)
  const pin = usePinMessage()
  const star = useStarMessage()

  const meta = message.metadata ?? {}
  const isAuthor = meta.senderUserId === sessionUserId
  const stars: string[] = Array.isArray((message as unknown as { starredByUserIds?: string[] }).starredByUserIds)
    ? ((message as unknown as { starredByUserIds: string[] }).starredByUserIds)
    : []
  const isStarred = sessionUserId ? stars.includes(sessionUserId) : false
  const isPinned = !!message.pinnedAt

  // Silent copy: dropdown closes immediately, no toast either way.
  const { copy } = useCopy({ toastOnSuccess: false, toastOnError: false })
  const copyLink = () => {
    const url = `${window.location.origin}/dashboard/spaces/${message.conversationId}#m-${message.id}`
    void copy(url)
  }

  const onDelete = async () => {
    if (!confirm('Delete this message? This cannot be undone.')) return
    try {
      await apiClient.delete(`/api/messages/${message.id}`)
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    qc.invalidateQueries({ queryKey: ['spaces'] })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="More actions"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => star.mutate({ messageId: message.id, starred: !isStarred })}>
            {isStarred ? <StarOff className="size-4" /> : <Star className="size-4" />}
            {isStarred ? 'Unstar' : 'Star'}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canPin}
            onClick={() => pin.mutate({ messageId: message.id, pinned: !isPinned })}
          >
            {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            {isPinned ? 'Unpin from space' : 'Pin to space'}
          </DropdownMenuItem>
          {onQuote && (
            <DropdownMenuItem onClick={() => onQuote(message)}>
              <Quote className="size-4" />
              Quote in reply
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setForwardOpen(true)}>
            <Forward className="size-4" />
            Forward to space
          </DropdownMenuItem>
          <DropdownMenuItem onClick={copyLink}>
            <LinkIcon className="size-4" />
            Copy link
          </DropdownMenuItem>
          {isAuthor && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ForwardMessageDialog
        message={message}
        open={forwardOpen}
        onClose={() => setForwardOpen(false)}
      />
    </>
  )
}
