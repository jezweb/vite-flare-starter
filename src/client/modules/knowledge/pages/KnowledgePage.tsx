/**
 * KnowledgePage — browse + create long-form reference docs.
 *
 * Mirrors SkillsPage shape (cards/list toggle, filter, page-level actions)
 * but adds knowledge-specific concerns:
 *   - injection-mode chip (always / on_demand / disabled) per row
 *   - estimated-token count + total always-active budget warning
 *   - tag pills under each row's summary
 *
 * Knowledge docs are purely user-owned data — no bundled defaults, no
 * R2-override staging — so saves go direct (PATCH) without the
 * config-diff approval flow that skills use.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Plus,
  Search,
  LayoutGrid,
  List as ListIcon,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/client/components/EmptyState'
import { PageLoading } from '@/client/components/PageState'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { useViewPreference } from '@/client/lib/use-view-preference'
import { useSession } from '@/client/lib/auth'
import {
  useKnowledgeList,
  useKnowledgeBudget,
  type KnowledgeRow,
  type InjectionMode,
} from '../hooks/useKnowledge'

// Soft cap for total always-active tokens across user scope. Above this, show
// the warning banner so the user can spot prompt-bloat before it bites.
const ALWAYS_BUDGET_SOFT_CAP = 10_000

const MODE_LABEL: Record<InjectionMode, string> = {
  always: 'Always active',
  on_demand: 'On demand',
  disabled: 'Disabled',
}

const MODE_VARIANT: Record<InjectionMode, 'default' | 'secondary' | 'outline'> = {
  always: 'default',
  on_demand: 'secondary',
  disabled: 'outline',
}

export function KnowledgePage() {
  const { data: session } = useSession()
  const userId = session?.user?.id ?? null
  const navigate = useNavigate()

  const list = useKnowledgeList('user', userId)
  const budget = useKnowledgeBudget()

  const [view, setView] = useViewPreference<'cards' | 'list'>('knowledge', 'cards')
  const [filter, setFilter] = useState('')

  const all = list.data?.knowledge ?? []
  const filtered = filter.trim()
    ? all.filter((k) => {
        const q = filter.trim().toLowerCase()
        return (
          k.title.toLowerCase().includes(q) ||
          k.summary.toLowerCase().includes(q) ||
          k.tags.some((t) => t.toLowerCase().includes(q))
        )
      })
    : all

  const overBudget = useMemo(
    () => (budget.data?.total ?? 0) > ALWAYS_BUDGET_SOFT_CAP,
    [budget.data?.total],
  )

  return (
    <PageContainer type="catalog">
      <PageHeader
        title="Knowledge"
        subtitle="Long-form reference documents the AI can apply during chat. Always-active docs bake into every prompt; on-demand docs surface in a catalog the agent can search."
        trailing={
          <Button asChild>
            <Link to="/dashboard/knowledge/new">
              <Plus className="mr-2 size-4" /> New doc
            </Link>
          </Button>
        }
      />

      {budget.data && budget.data.count > 0 && (
        <div
          className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
            overBudget
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-100 dark:text-amber-200'
              : 'border-border bg-muted/30 text-muted-foreground'
          }`}
        >
          {overBudget && <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <div>
            <strong className="font-medium">
              {budget.data.count} always-active{' '}
              {budget.data.count === 1 ? 'doc' : 'docs'} ·{' '}
              ~{budget.data.total.toLocaleString()} tokens
            </strong>{' '}
            baked into every chat's system prompt.
            {overBudget && (
              <>
                {' '}
                Over the {ALWAYS_BUDGET_SOFT_CAP.toLocaleString()}-token soft
                cap — switch some docs to on-demand to keep prompts lean.
              </>
            )}
          </div>
        </div>
      )}

      {list.isLoading ? (
        <PageLoading variant="grid" count={6} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No knowledge docs yet"
          description="Add a reference document the AI should know — schema notes, glossaries, runbooks, FAQ corpora."
          tips={[
            'Always-active docs bake into every chat\'s system prompt',
            'On-demand docs surface in a catalog the agent searches',
            'Up to 100KB of markdown per doc (≈ 25K tokens)',
          ]}
          action={{
            label: 'New doc',
            onClick: () => navigate('/dashboard/knowledge/new'),
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter docs…"
                className="pl-9"
              />
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">
              {filtered.length}
              {filter.trim() && filtered.length !== all.length
                ? ` / ${all.length}`
                : ''}{' '}
              {all.length === 1 ? 'doc' : 'docs'}
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={view}
              onValueChange={(v) => v && setView(v as 'cards' | 'list')}
              aria-label="Layout view"
            >
              <ToggleGroupItem value="cards" aria-label="Card view">
                <LayoutGrid className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view">
                <ListIcon className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {view === 'cards' ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((k) => (
                <KnowledgeCard key={k.id} doc={k} />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <ul className="divide-y divide-border">
                {filtered.map((k) => (
                  <KnowledgeListRow key={k.id} doc={k} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}

function KnowledgeCard({ doc }: { doc: KnowledgeRow }) {
  return (
    <Item className="border bg-card transition-colors hover:bg-muted/30">
      <Link
        to={`/dashboard/knowledge/${doc.id}`}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      >
        <ItemMedia variant="icon">
          <BookOpen className="size-4" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="truncate" title={doc.title}>
            {doc.title}
          </ItemTitle>
          <ItemDescription className="line-clamp-2">
            {doc.summary}
          </ItemDescription>
          {doc.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {doc.tags.slice(0, 4).map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {t}
                </Badge>
              ))}
              {doc.tags.length > 4 && (
                <span className="text-[10px] text-muted-foreground">
                  +{doc.tags.length - 4}
                </span>
              )}
            </div>
          )}
        </ItemContent>
      </Link>
      <ItemActions className="shrink-0 flex-col items-end gap-1.5 self-start">
        <Badge
          variant={MODE_VARIANT[doc.injectionMode]}
          className="text-[10px]"
        >
          {MODE_LABEL[doc.injectionMode]}
        </Badge>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          ~{doc.estimatedTokens.toLocaleString()} tok
        </span>
      </ItemActions>
    </Item>
  )
}

function KnowledgeListRow({ doc }: { doc: KnowledgeRow }) {
  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
      <Link
        to={`/dashboard/knowledge/${doc.id}`}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      >
        <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-medium" title={doc.title}>
              {doc.title}
            </span>
          </div>
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {doc.summary}
          </p>
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <Badge
          variant={MODE_VARIANT[doc.injectionMode]}
          className="text-[10px]"
        >
          {MODE_LABEL[doc.injectionMode]}
        </Badge>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          ~{doc.estimatedTokens.toLocaleString()} tok
        </span>
      </div>
    </li>
  )
}

export default KnowledgePage
