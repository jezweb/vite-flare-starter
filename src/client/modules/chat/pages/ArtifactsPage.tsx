/**
 * ArtifactsPage — `/dashboard/artifacts`
 *
 * Lists all AI-generated artifacts (HTML / SVG / Mermaid) the user has
 * created in any conversation. Reached via the user-menu → "My artifacts".
 *
 * Each artifact card links back to the source conversation where it
 * appears inline; click → /dashboard/chat/:conversationId.
 *
 * Phase 1 ships the list view + search + type filter. A future enhancement
 * could add a per-artifact preview pane.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, Search, MessageSquare, Code2, Image as ImageIcon, GitBranch } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'
import { EmptyState as SharedEmptyState } from '@/client/components/EmptyState'

interface Artifact {
  conversationId: string
  conversationTitle: string | null
  messageId: string
  artifactId: string
  type: string
  title: string
  height: number
  createdAt: string
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'just now'
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString()
}

const TYPE_ICONS: Record<string, typeof Code2> = {
  html: Code2,
  svg: ImageIcon,
  mermaid: GitBranch,
}

const TYPE_LABELS: Record<string, string> = {
  html: 'HTML',
  svg: 'SVG',
  mermaid: 'Mermaid diagram',
}

export function ArtifactsPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['artifacts', { search, typeFilter }],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      const qs = params.toString()
      return apiClient.get<{ artifacts: Artifact[] }>(`/api/chat/artifacts${qs ? `?${qs}` : ''}`)
    },
  })

  const artifacts = data?.artifacts ?? []

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="size-6 text-primary" />
          My artifacts
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-generated visual content from your conversations.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search artifacts…"
            className="pl-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
        >
          <option value="all">All types</option>
          <option value="html">HTML</option>
          <option value="svg">SVG</option>
          <option value="mermaid">Mermaid</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Spinner size="lg" className="mr-2" />
          Loading artifacts…
        </div>
      ) : artifacts.length === 0 ? (
        <EmptyState search={search} typeFilter={typeFilter} />
      ) : (
        <ul className="space-y-2">
          {artifacts.map((a) => {
            const Icon = TYPE_ICONS[a.type] ?? Code2
            return (
              <li key={`${a.messageId}-${a.artifactId}`}>
                <Link
                  to={`/dashboard/chat/${a.conversationId}`}
                  className={cn(
                    'group flex items-start gap-3 rounded-lg border bg-card p-4 transition-all',
                    'hover:border-primary/40 hover:shadow-sm',
                  )}
                >
                  <div className="size-10 shrink-0 rounded-md bg-muted flex items-center justify-center">
                    <Icon className="size-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold truncate">{a.title}</h3>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeAgo(a.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {TYPE_LABELS[a.type] ?? a.type}
                      </span>
                      <span className="flex items-center gap-1 truncate">
                        <MessageSquare className="size-3 shrink-0" />
                        <span className="truncate">{a.conversationTitle ?? 'Untitled conversation'}</span>
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function EmptyState({ search, typeFilter }: { search: string; typeFilter: string }) {
  const navigate = useNavigate()
  if (search || typeFilter !== 'all') {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No artifacts match your filters.</p>
      </div>
    )
  }
  return (
    <SharedEmptyState
      icon={Sparkles}
      title="No artifacts yet"
      description="The AI can build interactive HTML pages, SVG illustrations, and Mermaid diagrams right inside a chat."
      tips={[
        'Try: "Make me a Mermaid diagram of our auth flow"',
        'Try: "Build an SVG icon for a coffee cup"',
      ]}
      action={{ label: 'Open chat', onClick: () => navigate('/dashboard/chat') }}
    />
  )
}

export default ArtifactsPage
