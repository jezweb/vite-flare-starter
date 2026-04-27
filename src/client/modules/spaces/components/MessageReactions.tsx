/**
 * MessageReactions — quick-emoji bar + tally row + full picker.
 *
 * Phase 2: 3 fixed quick emojis (👍 ✅ ❤️) + a "+" button that opens
 * emoji-mart for any emoji. Bots and humans share the same icons.
 * Tally chips show per-emoji counts with a "you reacted" highlight;
 * click toggles the reaction.
 */
import { lazy, Suspense, useMemo, useState } from 'react'
import { Smile } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useReactToMessage } from '../hooks/useReactions'

// Lazy-load the emoji picker — its data bundle is ~150KB. Most chat
// users never open it; loading on click keeps the initial bundle small.
const EmojiPicker = lazy(() => import('./EmojiPicker').then((m) => ({ default: m.EmojiPicker })))

export const QUICK_EMOJIS = ['👍', '✅', '❤️'] as const

interface Props {
  messageId: string
  reactions?: Record<string, string[]>
  /** Current user's id. Used to highlight chips the user has reacted with. */
  currentUserId?: string
  /** When true, render the quick-emoji bar (used in the hover action bar). */
  quickBar?: boolean
}

export function MessageReactions({ messageId, reactions, currentUserId, quickBar }: Props) {
  const react = useReactToMessage()
  const entries = useMemo(() => {
    return Object.entries(reactions ?? {}).filter(([, ids]) => ids.length > 0)
  }, [reactions])

  if (quickBar) {
    return (
      <div className="flex items-center gap-1">
        {QUICK_EMOJIS.map((emoji) => {
          const list = reactions?.[emoji] ?? []
          const hasReacted = currentUserId ? list.includes(`user:${currentUserId}`) : false
          return (
            <button
              key={emoji}
              type="button"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors',
                hasReacted ? 'bg-primary/10' : 'hover:bg-accent',
              )}
              onClick={() =>
                react.mutate({ messageId, emoji, action: hasReacted ? 'remove' : 'add' })
              }
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          )
        })}
        <PickerButton onPick={(emoji) => react.mutate({ messageId, emoji, action: 'add' })} />
      </div>
    )
  }

  if (entries.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {entries.map(([emoji, ids]) => {
        const hasReacted = currentUserId ? ids.includes(`user:${currentUserId}`) : false
        return (
          <button
            key={emoji}
            type="button"
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors',
              hasReacted
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-background text-foreground hover:bg-accent',
            )}
            onClick={() =>
              react.mutate({ messageId, emoji, action: hasReacted ? 'remove' : 'add' })
            }
          >
            <span>{emoji}</span>
            <span className="font-medium">{ids.length}</span>
          </button>
        )
      })}
      <PickerButton onPick={(emoji) => react.mutate({ messageId, emoji, action: 'add' })} compact />
    </div>
  )
}

function PickerButton({
  onPick,
  compact,
}: {
  onPick: (emoji: string) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
            compact ? 'size-6' : 'size-7',
          )}
          aria-label="Pick a reaction"
        >
          <Smile className={compact ? 'size-3' : 'size-3.5'} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Suspense fallback={<div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>}>
          <EmojiPicker
            onPick={(emoji) => {
              onPick(emoji)
              setOpen(false)
            }}
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  )
}
