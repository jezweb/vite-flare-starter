/**
 * SpacesIndexPage — `/dashboard/spaces`
 *
 * Index of multi-user multi-agent rooms. Pinned spaces float to the
 * top; everything else sorts by recent activity. "+ New space"
 * launches the create modal.
 */
import { useEffect, useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Pin, Users, Bot, Hash, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSpacesList, type SpaceSummary } from '../hooks/useSpaces'
import { CreateSpaceModal } from '../components/CreateSpaceModal'
import { EmptyState as SharedEmptyState } from '@/client/components/EmptyState'
import { cn } from '@/lib/utils'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { PageLoading } from '@/client/components/PageState'

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
  const [searchParams, setSearchParams] = useSearchParams()

  // ?new=1 from the command palette opens the create modal on mount.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreateOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <PageContainer type="index">
      <PageHeader
        title="Spaces"
        subtitle="Group chats with the AI. Invite teammates, mix in different AI agents (researcher, writer, support), and keep the history in one place. Type @ to call an agent into the chat."
        trailing={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1.5" />
            New space
          </Button>
        }
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Filter spaces…"
        showClearButton
        className="max-w-md"
      />

      {isLoading ? (
        <PageLoading variant="list" count={4} />
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
    </PageContainer>
  )
}
