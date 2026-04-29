/**
 * SearchInSpacePane — slide-in side pane for "Search in this space".
 *
 * Phase 1 backed by a LIKE scan on conversation_messages.parts.
 * Future: switch to FTS5 with spaceId filter.
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { apiClient } from '@/client/lib/api-client'
import { Input } from '@/components/ui/input'
import { SpaceMessageView } from './SpaceMessageView'
import type { SpaceMessage, SpaceUserInfo } from '../hooks/useSpaces'

interface Props {
  spaceId: string
  users: SpaceUserInfo[]
  open: boolean
  onClose: () => void
}

export function SearchInSpacePane({ spaceId, users, open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query, 200)
  const { data, isLoading } = useQuery({
    queryKey: ['spaces', spaceId, 'search', debounced],
    queryFn: () =>
      apiClient.get<{ results: SpaceMessage[] }>(
        `/api/spaces/${spaceId}/messages/search?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: !!spaceId && debounced.length >= 2,
  })

  if (!open) return null

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Search className="size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in this space…"
          className="h-8 border-0 bg-transparent px-1 focus-visible:ring-0"
          autoFocus
        />
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
          onClick={onClose}
          aria-label="Close search"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {debounced.length < 2 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Type at least 2 characters.</p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <Spinner size="sm" />
            Searching…
          </div>
        ) : !data || data.results.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">No matches.</p>
        ) : (
          <div className="space-y-1">
            {data.results.map((m) => (
              <SpaceMessageView key={m.id} message={m} users={users} />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}
