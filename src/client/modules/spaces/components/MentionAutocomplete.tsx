/**
 * MentionAutocomplete — popover that opens on `@` while typing.
 *
 * Filters the space's members by the partial handle, splits into
 * "People" / "Agents" sections, supports keyboard navigation
 * (↑/↓/Enter/Escape) so power users don't reach for the mouse.
 *
 * The picked target is sent back as `{ kind, handle, userId?, agentName? }`
 * so the calling textarea can insert a real pill rather than text.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SpaceMember, SpaceUserInfo } from '../hooks/useSpaces'

export interface MentionPick {
  kind: 'user' | 'agent'
  /** What we render in the pill ("@research" / user.name). */
  label: string
  /** Handle the dispatcher resolves: agentName for bots, userId for people. */
  handle: string
  userId?: string
  agentClass?: string
  agentName?: string
}

interface Props {
  members: SpaceMember[]
  users: SpaceUserInfo[]
  query: string
  onPick: (pick: MentionPick) => void
  onCancel: () => void
}

export function MentionAutocomplete({ members, users, query, onPick, onCancel }: Props) {
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const items = useMemo(() => {
    const q = query.toLowerCase().trim()
    const peopleItems: MentionPick[] = members
      .filter((m) => m.kind === 'user' && m.userId)
      .map((m) => {
        const u = m.userId ? userMap.get(m.userId) : null
        return {
          kind: 'user' as const,
          label: u?.name ?? 'Member',
          handle: m.userId!,
          userId: m.userId!,
        }
      })
      .filter((p) => !q || p.label.toLowerCase().includes(q))
    const agentItems: MentionPick[] = members
      .filter((m) => m.kind === 'agent' && m.agentName)
      .map((m) => ({
        kind: 'agent' as const,
        label: `@${m.agentName}`,
        handle: m.agentName!,
        agentClass: m.agentClass ?? undefined,
        agentName: m.agentName!,
      }))
      .filter((p) => !q || p.handle.toLowerCase().includes(q))
    return [...peopleItems, ...agentItems]
  }, [members, users, userMap, query])
  const [active, setActive] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (items.length === 0) {
        if (e.key === 'Escape') onCancel()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => Math.min(items.length - 1, a + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => Math.max(0, a - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[active]
        if (item) onPick(item)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [items, active, onPick, onCancel])

  if (items.length === 0) {
    return (
      <div
        ref={containerRef}
        className="absolute bottom-full mb-2 max-h-72 w-72 overflow-auto rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
      >
        <div className="px-3 py-2 text-xs text-muted-foreground">No matches.</div>
      </div>
    )
  }

  const peopleCount = items.filter((i) => i.kind === 'user').length

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full mb-2 max-h-72 w-72 overflow-auto rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
    >
      {peopleCount > 0 && (
        <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          People
        </div>
      )}
      {items.slice(0, peopleCount).map((item, i) => (
        <button
          type="button"
          key={`person-${i}`}
          className={cn(
            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left',
            i === active ? 'bg-accent' : 'hover:bg-accent/60',
          )}
          onMouseEnter={() => setActive(i)}
          // Prevent the textarea from blurring before our click handler
          // runs — keeps cursor + selectionStart intact across the pick.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(item)}
        >
          <User className="size-3.5 text-muted-foreground" />
          <span className="flex-1 truncate">{item.label}</span>
        </button>
      ))}
      {peopleCount < items.length && (
        <div className="mt-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Agents
        </div>
      )}
      {items.slice(peopleCount).map((item, idx) => {
        const i = peopleCount + idx
        return (
          <button
            type="button"
            key={`agent-${idx}`}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left',
              i === active ? 'bg-accent' : 'hover:bg-accent/60',
            )}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(item)}
          >
            <Bot className="size-3.5 text-emerald-600" />
            <span className="flex-1 truncate">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
