/**
 * Command Palette (Cmd+K)
 *
 * Global search and navigation. Reads nav items from the same config
 * as the sidebar, plus adds quick actions (theme toggle, sign out).
 *
 * Keyboard: Cmd+K (Mac) or Ctrl+K (Windows/Linux)
 */
import { useState, useEffect, useCallback, useDeferredValue } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { Moon, Sun, LogOut, Settings, MessagesSquare } from 'lucide-react'
import { useTheme } from '@/client/components/theme-provider'
import { authClient } from '@/client/lib/auth'
import { apiClient } from '@/client/lib/api-client'
import { NAV_SECTIONS } from '@/shared/config/nav'
import { features } from '@/shared/config/features'
import { announceGlobalModalOpen, subscribeGlobalModal } from '@/client/lib/global-modals'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()

  // Conversation search — fires once the user has typed at least 2 chars.
  // Server endpoint already exists at GET /api/conversations/search?q=...
  const { data: searchResults } = useQuery({
    queryKey: ['cmd-palette', 'conversations', deferredQuery],
    queryFn: () =>
      apiClient.get<{ results: { conversationId: string; snippet: string; role: string }[] }>(
        `/api/conversations/search?q=${encodeURIComponent(deferredQuery)}`,
      ),
    enabled: open && deferredQuery.length >= 2,
    staleTime: 5_000,
  })
  const conversationHits = searchResults?.results ?? []

  // Reset query when the palette closes so the next open starts fresh.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => {
          const next = !prev
          if (next) announceGlobalModalOpen('command-palette')
          return next
        })
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Close if any other global modal opens — one-at-a-time policy.
  useEffect(() => subscribeGlobalModal('command-palette', () => setOpen(false)), [])

  const runCommand = useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  // Filter nav items by feature flags (same logic as sidebar)
  const featureFlags = features as unknown as Record<string, boolean>
  const navItems = NAV_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => !item.feature || featureFlags[item.feature])
      .map((item) => ({ ...item, section: section.label }))
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search conversations or run a command..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Conversation hits (only when the user has typed a real query) */}
        {deferredQuery.length >= 2 && conversationHits.length > 0 && (
          <>
            <CommandGroup heading="Conversations">
              {conversationHits.slice(0, 8).map((hit) => (
                <CommandItem
                  key={`${hit.conversationId}-${hit.role}`}
                  value={`${hit.conversationId}-${hit.role}-${hit.snippet}`}
                  onSelect={() =>
                    runCommand(() => navigate(`/dashboard/chat/${hit.conversationId}`))
                  }
                >
                  <MessagesSquare className="mr-2 h-4 w-4" />
                  <span className="truncate">{hit.snippet}</span>
                  <CommandShortcut>
                    {hit.role === 'title' ? 'title' : 'message'}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem
              key={item.to}
              onSelect={() => runCommand(() => navigate(item.to))}
            >
              {item.icon && <item.icon className="mr-2 h-4 w-4" />}
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Quick Actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => navigate('/dashboard/settings'))}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Toggle theme
            <CommandShortcut>Theme</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(async () => {
                await authClient.signOut()
                navigate('/sign-in')
              })
            }
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
