/**
 * MessageReactions — quick-emoji bar + tally row.
 *
 * Phase 1: 3 fixed quick emojis (👍 ✅ ❤️). Bots and humans share the
 * same icons. Tally chips show per-emoji counts with a "you reacted"
 * highlight. Click toggles the reaction.
 */
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useReactToMessage } from '../hooks/useReactions'

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
      </div>
    )
  }

  if (entries.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
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
    </div>
  )
}
