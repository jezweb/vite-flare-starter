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
import {
  Moon,
  Sun,
  LogOut,
  Settings,
  MessagesSquare,
  FolderKanban,
  Plus,
  MessageSquare,
  Repeat,
  Plug,
  CheckSquare,
  Inbox,
  Hash,
  FileSearch,
} from 'lucide-react'
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
        `/api/conversations/search?q=${encodeURIComponent(deferredQuery)}`
      ),
    enabled: open && deferredQuery.length >= 2,
    staleTime: 5_000,
  })
  const conversationHits = searchResults?.results ?? []

  // Project search — uses the existing list endpoint with q= param
  const { data: projectsData } = useQuery({
    queryKey: ['cmd-palette', 'projects', deferredQuery],
    queryFn: () =>
      apiClient.get<{ projects: { id: string; name: string; description: string | null }[] }>(
        `/api/projects?q=${encodeURIComponent(deferredQuery)}`
      ),
    enabled: open && deferredQuery.length >= 2,
    staleTime: 5_000,
  })
  const projectHits = projectsData?.projects ?? []

  // Entity (content) search — FTS5 across the user's entities table.
  // Indexes title + fields.body, so findings/learnings/notes/etc all
  // become searchable. Backed by /api/search/entities and migration
  // 20260504140000_entities_fts.sql.
  const { data: entitiesData } = useQuery({
    queryKey: ['cmd-palette', 'entities', deferredQuery],
    queryFn: () =>
      apiClient.get<{
        results: { id: string; type: string; title: string; snippet: string; rank: number }[]
      }>(`/api/search/entities?q=${encodeURIComponent(deferredQuery)}`),
    enabled: open && deferredQuery.length >= 2,
    staleTime: 5_000,
    placeholderData: (prev) => prev,
  })
  const entityHits = entitiesData?.results ?? []

  // Where to send the user when they pick an entity hit. Findings +
  // learnings have a dedicated page; everything else falls back to
  // the inbox where the row will surface alongside other items.
  const entityHref = useCallback((type: string) => {
    if (type === 'finding' || type === 'learning') return '/dashboard/findings'
    return '/dashboard/inbox'
  }, [])

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

  // Filter nav items by feature flags (same logic as sidebar).
  // Drop /dashboard/inbox + /dashboard/approvals because they're already
  // surfaced verb-led in the Review group above — duplicating them in
  // Navigation just dilutes the filter (typing "inbox" hit two rows).
  const NAV_DEDUP_BLOCKLIST = new Set(['/dashboard/inbox', '/dashboard/approvals'])
  const featureFlags = features as unknown as Record<string, boolean>
  const navItems = NAV_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => !item.feature || featureFlags[item.feature])
      .filter((item) => !NAV_DEDUP_BLOCKLIST.has(item.to))
      .map((item) => ({ ...item, section: section.label }))
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search content, conversations, or run a command..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Create / setup actions — surface high-value verbs above
            navigation so the palette behaves like an action layer, not
            just a navigator. Each Create item lands the user on the
            destination ready to start; Setup items deep-link into
            settings flows. */}
        <CommandGroup heading="Create">
          <CommandItem
            value="new chat new conversation create chat ai start"
            onSelect={() => runCommand(() => navigate('/dashboard/chat?new=1'))}
          >
            <Plus className="mr-2 h-4 w-4" />
            New chat
            <CommandShortcut>⌘ ⇧ N</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="new project new folder create project workspace"
            onSelect={() => runCommand(() => navigate('/dashboard/projects?new=1'))}
          >
            <FolderKanban className="mr-2 h-4 w-4" />
            New project
          </CommandItem>
          <CommandItem
            value="new space new room channel create space"
            onSelect={() => runCommand(() => navigate('/dashboard/spaces?new=1'))}
          >
            <Hash className="mr-2 h-4 w-4" />
            New space
          </CommandItem>
          <CommandItem
            value="new routine new automation schedule create routine agent"
            onSelect={() => runCommand(() => navigate('/dashboard/routines/new'))}
          >
            <Repeat className="mr-2 h-4 w-4" />
            New routine
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Review">
          <CommandItem
            value="open inbox findings undecided review triage"
            onSelect={() => runCommand(() => navigate('/dashboard/inbox'))}
          >
            <Inbox className="mr-2 h-4 w-4" />
            Open inbox
          </CommandItem>
          <CommandItem
            value="pending approvals queue review approve reject"
            onSelect={() => runCommand(() => navigate('/dashboard/approvals'))}
          >
            <CheckSquare className="mr-2 h-4 w-4" />
            Pending approvals
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Setup">
          <CommandItem
            value="connect an app integration mcp gmail drive notion slack"
            onSelect={() => runCommand(() => navigate('/dashboard/connections'))}
          >
            <Plug className="mr-2 h-4 w-4" />
            Connect an app
          </CommandItem>
          <CommandItem
            value="browse skills library agent procedures markdown"
            onSelect={() => runCommand(() => navigate('/dashboard/skills'))}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Browse skills
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Content hits — FTS5 across user's entities (findings,
            learnings, notes, anything stored in the entities table).
            Lands the user on the closest existing surface for each
            type. */}
        {deferredQuery.length >= 2 && entityHits.length > 0 && (
          <>
            <CommandGroup heading="Content">
              {entityHits.slice(0, 8).map((hit) => (
                <CommandItem
                  key={`entity-${hit.id}`}
                  value={`entity-${hit.id}-${hit.title}-${hit.snippet}`}
                  onSelect={() => runCommand(() => navigate(entityHref(hit.type)))}
                >
                  <FileSearch className="mr-2 h-4 w-4" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{hit.title}</div>
                    {hit.snippet && (
                      <div className="truncate text-xs text-muted-foreground">{hit.snippet}</div>
                    )}
                  </div>
                  <CommandShortcut>{hit.type}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Project hits (only when the user has typed a real query) */}
        {deferredQuery.length >= 2 && projectHits.length > 0 && (
          <>
            <CommandGroup heading="Projects">
              {projectHits.slice(0, 5).map((p) => (
                <CommandItem
                  key={`project-${p.id}`}
                  value={`project-${p.id}-${p.name}`}
                  onSelect={() => runCommand(() => navigate(`/dashboard/projects/${p.id}`))}
                >
                  <FolderKanban className="mr-2 h-4 w-4" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    {p.description && (
                      <div className="truncate text-xs text-muted-foreground">{p.description}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

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
                  <CommandShortcut>{hit.role === 'title' ? 'title' : 'message'}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem key={item.to} onSelect={() => runCommand(() => navigate(item.to))}>
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
