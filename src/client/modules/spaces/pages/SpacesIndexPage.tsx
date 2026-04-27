/**
 * SpacesIndexPage — `/dashboard/spaces`
 *
 * Index of multi-user multi-agent rooms. Pinned spaces float to the
 * top; everything else sorts by recent activity. "+ New space"
 * launches the create modal.
 */
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Pin, Users, Bot, Loader2, Hash, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSpacesList, type SpaceSummary } from '../hooks/useSpaces'
import { CreateSpaceModal } from '../components/CreateSpaceModal'
import { EmptyState as SharedEmptyState } from '@/client/components/EmptyState'
import { cn } from '@/lib/utils'

function relTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`
  return new Date(iso).toLocaleDateString()
}

function SpaceCard({ s }: { s: SpaceSummary }) {
  return (
    <Link
      to={`/dashboard/spaces/${s.id}`}
      className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Hash className="size-4 shrink-0 text-muted-foreground" />
          <h3 className="truncate text-sm font-medium">{s.title || 'Untitled space'}</h3>
        </div>
        {s.pinnedToSidebar ? (
          <Pin className="size-3.5 shrink-0 text-amber-500" />
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="size-3" />
          {s.memberCount}
        </span>
        <span className="flex items-center gap-1">
          <Bot className="size-3" />
          {s.agentCount}
        </span>
        <span>•</span>
        <span>{relTime(s.updatedAt)}</span>
      </div>
    </Link>
  )
}

export function SpacesIndexPage() {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const { data, isLoading } = useSpacesList()
  const spaces = data?.spaces ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q
      ? spaces.filter((s) => (s.title ?? '').toLowerCase().includes(q))
      : spaces
  }, [spaces, search])

  const pinned = filtered.filter((s) => s.pinnedToSidebar)
  const rest = filtered.filter((s) => !s.pinnedToSidebar)

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Spaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-user, multi-agent rooms. @-mention agents to ask them to help.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1.5" />
          New space
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter spaces…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : spaces.length === 0 ? (
        <SharedEmptyState
          icon={Sparkles}
          title="Spaces are multiplayer rooms."
          description="Bring your team and your AI agents into one place. Use @mentions to ask agents to help; they reply when called and stay quiet otherwise."
          action={{ label: 'New space', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pinned
              </h2>
              <div className={cn('grid gap-3', 'sm:grid-cols-2', 'lg:grid-cols-3')}>
                {pinned.map((s) => (
                  <SpaceCard key={s.id} s={s} />
                ))}
              </div>
            </section>
          )}
          {rest.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  All spaces
                </h2>
              )}
              <div className={cn('grid gap-3', 'sm:grid-cols-2', 'lg:grid-cols-3')}>
                {rest.map((s) => (
                  <SpaceCard key={s.id} s={s} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <CreateSpaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
