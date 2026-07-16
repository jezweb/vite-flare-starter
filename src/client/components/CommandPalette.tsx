/**
 * Command Palette (Cmd+K)
 *
 * Global search and navigation. Reads nav items from the same config
 * as the sidebar, plus adds quick actions (theme toggle, sign out).
 *
 * Search surfaces (grouped — grouping by type is what makes per-module
 * FTS indexes composable; BM25 scores aren't comparable across separate
 * indexes, so we never interleave-rank across groups):
 *   Content (entities FTS) · Knowledge (knowledge FTS) · Projects ·
 *   Conversations — plus an "Ask AI" escape hatch that hands the query
 *   to the chat agent when search isn't the right tool.
 *
 * Empty state shows Recent destinations (localStorage, per-app-id) —
 * recents do more for perceived speed than any spinner.
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
import { Moon, Sun, SignOut, GearSix, Chats, Kanban, Plus, Chat, Repeat, Plug, CheckSquare, Tray, Hash, FileMagnifyingGlass, Brain, Sparkle, ClockCounterClockwise } from '@phosphor-icons/react'
import { useTheme } from '@/client/components/theme-provider'
import { authClient } from '@/client/lib/auth'
import { apiClient } from '@/client/lib/api-client'
import { NAV_SECTIONS } from '@/shared/config/nav'
import { features } from '@/shared/config/features'
import { appConfig } from '@/shared/config/app'
import { announceGlobalModalOpen, subscribeGlobalModal } from '@/client/lib/global-modals'

// ─── Recents (empty-state group) ──────────────────────────────────────
// Last N destinations chosen from the palette. localStorage per app-id
// (same scoping convention as useViewPreference). Deduped by `to`.

interface RecentEntry {
  to: string
  label: string
}

const RECENTS_KEY = `${appConfig.id}-palette-recents`
const RECENTS_MAX = 6

function readRecents(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is RecentEntry =>
        typeof e === 'object' && e !== null && typeof (e as RecentEntry).to === 'string'
    )
  } catch {
    return []
  }
}

function pushRecent(entry: RecentEntry): void {
  try {
    const next = [entry, ...readRecents().filter((e) => e.to !== entry.to)].slice(0, RECENTS_MAX)
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable — recents just don't persist
  }
}

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

  // Knowledge search — FTS5 across the user's accessible knowledge docs.
  const { data: knowledgeData } = useQuery({
    queryKey: ['cmd-palette', 'knowledge', deferredQuery],
    queryFn: () =>
      apiClient.get<{
        hits: { id: string; title: string; summary?: string | null; snippet?: string | null }[]
      }>(`/api/knowledge/search?q=${encodeURIComponent(deferredQuery)}&limit=5`),
    enabled: open && deferredQuery.length >= 2 && features.knowledge,
    staleTime: 5_000,
    placeholderData: (prev) => prev,
  })
  const knowledgeHits = knowledgeData?.hits ?? []

  // Recent destinations — loaded on open so external tabs' picks show too.
  const [recents, setRecents] = useState<RecentEntry[]>([])
  useEffect(() => {
    if (open) setRecents(readRecents())
  }, [open])

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

  // Programmatic open — the sidebar Quick-search field dispatches this
  // (Cloudflare-style search-first sidebar).
  useEffect(() => {
    const openHandler = () => {
      announceGlobalModalOpen('command-palette')
      setOpen(true)
    }
    window.addEventListener('vfs:open-command-palette', openHandler)
    return () => window.removeEventListener('vfs:open-command-palette', openHandler)
  }, [])

  // Close if any other global modal opens — one-at-a-time policy.
  useEffect(() => subscribeGlobalModal('command-palette', () => setOpen(false)), [])

  const runCommand = useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  // Navigate + record in Recents. Use for destinations (nav, search hits);
  // plain runCommand for verbs (theme toggle, sign out) that shouldn't
  // clutter the recents list.
  const go = useCallback(
    (to: string, label: string) => {
      pushRecent({ to, label })
      runCommand(() => navigate(to))
    },
    [navigate, runCommand]
  )

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

        {/* Recents — empty-state only. The single highest-leverage row
            group for perceived speed: the thing you want is usually the
            thing you wanted five minutes ago. */}
        {deferredQuery.length === 0 && recents.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recents.map((r) => (
                <CommandItem
                  key={`recent-${r.to}`}
                  value={`recent ${r.label} ${r.to}`}
                  onSelect={() => go(r.to, r.label)}
                >
                  <ClockCounterClockwise className="mr-2 h-4 w-4" />
                  {r.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

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
            <Kanban className="mr-2 h-4 w-4" />
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
            <Tray className="mr-2 h-4 w-4" />
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
            <Chat className="mr-2 h-4 w-4" />
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
                  onSelect={() => go(entityHref(hit.type), hit.title)}
                >
                  <FileMagnifyingGlass className="mr-2 h-4 w-4" />
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

        {/* Knowledge hits — long-form reference docs (FTS5). */}
        {deferredQuery.length >= 2 && knowledgeHits.length > 0 && (
          <>
            <CommandGroup heading="Knowledge">
              {knowledgeHits.map((hit) => (
                <CommandItem
                  key={`knowledge-${hit.id}`}
                  value={`knowledge-${hit.id}-${hit.title}`}
                  onSelect={() => go(`/dashboard/knowledge/${hit.id}`, hit.title)}
                >
                  <Brain className="mr-2 h-4 w-4" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{hit.title}</div>
                    {(hit.snippet || hit.summary) && (
                      <div className="truncate text-xs text-muted-foreground">
                        {hit.snippet || hit.summary}
                      </div>
                    )}
                  </div>
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
                  onSelect={() => go(`/dashboard/projects/${p.id}`, p.name)}
                >
                  <Kanban className="mr-2 h-4 w-4" />
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
                    go(`/dashboard/chat/${hit.conversationId}`, hit.snippet.slice(0, 60))
                  }
                >
                  <Chats className="mr-2 h-4 w-4" />
                  <span className="truncate">{hit.snippet}</span>
                  <CommandShortcut>{hit.role === 'title' ? 'title' : 'message'}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Ask AI — the escalation row when search isn't the right tool.
            Lands mid-stream in a fresh chat (ChatPage auto-sends ?q=). */}
        {deferredQuery.length >= 2 && features.chat && (
          <>
            <CommandGroup heading="Ask AI">
              <CommandItem
                value={`ask-ai ${deferredQuery}`}
                onSelect={() =>
                  runCommand(() =>
                    navigate(`/dashboard/chat?new=1&q=${encodeURIComponent(query)}`)
                  )
                }
              >
                <Sparkle className="mr-2 h-4 w-4" />
                <span className="truncate">
                  Ask AI: <span className="text-muted-foreground">“{query}”</span>
                </span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem key={item.to} onSelect={() => go(item.to, item.label)}>
              {item.icon && <item.icon className="mr-2 h-4 w-4" />}
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Quick Actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => navigate('/dashboard/settings'))}>
            <GearSix className="mr-2 h-4 w-4" />
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
            <SignOut className="mr-2 h-4 w-4" />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
