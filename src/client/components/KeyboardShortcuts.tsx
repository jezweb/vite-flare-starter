/**
 * Keyboard Shortcuts Help Panel
 *
 * Press ? to show all available keyboard shortcuts.
 * Reads from a central config so shortcuts stay in sync.
 */
import { useState, useEffect } from 'react'
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
    label: 'Navigation',
    shortcuts: [
      { keys: '⌘ K', description: 'Open command palette' },
      { keys: 'G then H', description: 'Go to Home' },
      { keys: 'G then S', description: 'Go to Settings' },
    ],
  },
  {
    label: 'Actions',
    shortcuts: [
      { keys: '?', description: 'Show keyboard shortcuts' },
      { keys: '⌘ ⇧ N', description: 'New chat conversation' },
      { keys: 'T', description: 'Toggle theme (light/dark)' },
      { keys: 'Escape', description: 'Close dialog / cancel' },
    ],
  },
]

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      // Cmd/Ctrl + Shift + N — new chat conversation. Safe inside inputs too
      // since the modifier is unlikely to collide with typing.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault()
        navigate('/dashboard/chat')
        return
      }

      // ? key (shift + /) — only when NOT in an input
      if (inInput) return
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
    return () => document.removeEventListener('keydown', handler)
  }, [navigate])

  // Close if any other global modal opens — one-at-a-time policy.
  useEffect(() => subscribeGlobalModal('keyboard-shortcuts', () => setOpen(false)), [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Quick actions available throughout the app.</DialogDescription>
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
