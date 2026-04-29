/**
 * Keyboard Shortcuts Help Panel + global key handler.
 *
 * Press ? to open the help panel. The `g <key>` go-to leader pattern
 * (Linear / GitHub / Notion convention) drives quick navigation:
 *
 *   g h — Go to Home          g r — Go to Routines
 *   g i — Go to Inbox         g s — Go to Skills
 *   g c — Go to Chat          g a — Go to Apps (Connections)
 *   g p — Go to Projects      g x — Go to Spaces
 *
 *   ⌘⇧N — New chat
 *   ?    — This help panel
 *   t    — Toggle theme (light/dark)
 *   Esc  — Close dialog / cancel
 *
 * Leader-key state expires after 1.2 seconds so a stray `g` doesn't
 * lock the user out of typing.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { announceGlobalModalOpen, subscribeGlobalModal } from '@/client/lib/global-modals'

interface Shortcut {
  keys: string
  description: string
}

interface ShortcutGroup {
  label: string
  shortcuts: Shortcut[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Go to (press G then…)',
    shortcuts: [
      { keys: 'G H', description: 'Home' },
      { keys: 'G I', description: 'Inbox' },
      { keys: 'G C', description: 'AI Chat' },
      { keys: 'G P', description: 'Projects' },
      { keys: 'G X', description: 'Spaces' },
      { keys: 'G A', description: 'Connections (Apps)' },
      { keys: 'G S', description: 'Skills' },
      { keys: 'G R', description: 'Routines' },
    ],
  },
  {
    label: 'Actions',
    shortcuts: [
      { keys: '⌘ K', description: 'Open command palette' },
      { keys: '?', description: 'Show keyboard shortcuts' },
      { keys: '⌘ ⇧ N', description: 'New chat conversation' },
      { keys: 'Escape', description: 'Close dialog / cancel' },
    ],
  },
  {
    label: 'Inbox (when focused)',
    shortcuts: [
      { keys: 'J / K', description: 'Move focus down / up' },
      { keys: 'X', description: 'Toggle row selection' },
      { keys: 'Enter', description: 'Open focused row' },
      { keys: 'M', description: 'Mark selected as read' },
      { keys: 'A / R', description: 'Approve / reject selected' },
    ],
  },
]

const GO_TO_TARGETS: Record<string, string> = {
  h: '/dashboard',
  i: '/dashboard/inbox',
  c: '/dashboard/chat',
  p: '/dashboard/projects',
  x: '/dashboard/spaces',
  a: '/dashboard/connections',
  s: '/dashboard/skills',
  r: '/dashboard/routines',
}

const LEADER_TIMEOUT_MS = 1200

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  // Leader-key state: when the user presses `g`, we wait briefly for a
  // follow-up key. Stored in a ref so the keydown handler always reads
  // the latest value without re-binding the event listener.
  const leaderRef = useRef<{ key: 'g'; ts: number } | null>(null)
  const leaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clearLeader = () => {
      leaderRef.current = null
      if (leaderTimerRef.current) {
        clearTimeout(leaderTimerRef.current)
        leaderTimerRef.current = null
      }
    }

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      // Cmd/Ctrl + Shift + N — new chat. Works inside inputs too.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault()
        navigate('/dashboard/chat')
        return
      }

      // Don't fire un-modified shortcuts inside inputs.
      if (inInput) return
      // Modifier-keys disable single-letter shortcuts (so Cmd-R reload still works).
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // Leader: G — set leader and start the timeout.
      if ((e.key === 'g' || e.key === 'G') && !leaderRef.current) {
        leaderRef.current = { key: 'g', ts: Date.now() }
        leaderTimerRef.current = setTimeout(clearLeader, LEADER_TIMEOUT_MS)
        return
      }

      // Leader follow-up: G then <key>.
      if (leaderRef.current?.key === 'g') {
        const target = GO_TO_TARGETS[e.key.toLowerCase()]
        if (target) {
          e.preventDefault()
          clearLeader()
          navigate(target)
          return
        }
        // Any non-mapped key cancels the leader so typing isn't blocked.
        clearLeader()
      }

      // ? — toggle help.
      if (e.key === '?') {
        e.preventDefault()
        setOpen((prev) => {
          const next = !prev
          if (next) announceGlobalModalOpen('keyboard-shortcuts')
          return next
        })
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      clearLeader()
    }
  }, [navigate])

  // Close if any other global modal opens — one-at-a-time policy.
  useEffect(() => subscribeGlobalModal('keyboard-shortcuts', () => setOpen(false)), [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-mono">G</kbd>{' '}
            then a destination key to jump anywhere in the app.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="text-muted-foreground">{shortcut.description}</span>
                    <kbd className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
