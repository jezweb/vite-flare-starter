/**
 * TemplateCatalogPage — copy this for a "find-and-act" entity list with
 * 5–30 items where each item has a logo / icon / visual identifier.
 *
 * Use cases: connections, skills, routines, agents, model picker.
 *
 * Default view: card grid. Toggle to list view available; user
 * preference persists per-surface via `useViewPreference`.
 *
 * For a "find-and-edit text-heavy" surface (long descriptions, dense
 * metadata strip), copy `IndexPage.tsx` instead — it uses ListRowGroup
 * directly with no view toggle.
 *
 * For "structured rows that benefit from sort + filter + pagination, 50+
 * items", copy `TablePage.tsx` instead — uses shadcn Data Table.
 */
import { Plus, FileText, LayoutGrid, List as ListIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { EmptyState } from '@/client/components/EmptyState'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  ListRow,
  ListRowGroup,
  ListRowIcon,
  ListRowBody,
  ListRowTitle,
  ListRowMeta,
  ListRowTrailing,
} from '@/components/ui/list-row'
import { useViewPreference } from '@/client/lib/use-view-preference'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Replace with your real hook in hooks/useThings.ts
// import { useThings } from '../hooks/useThings'

interface Thing {
  id: string
  name: string
  description: string
  category: string
  updatedAt: string
}

export function TemplateCatalogPage() {
  // const { data, isLoading } = useThings()
  const data = { total: 0, things: [] as Thing[] }
  const isLoading = false

  // Persist the user's view choice scoped to this surface so it
  // survives reloads and doesn't collide with other list pages.
  const [view, setView] = useViewPreference<'cards' | 'list'>('things', 'cards')

  return (
    <PageContainer type="catalog">
      <PageHeader
        title="Things"
        subtitle="One-line, user-voice description of what this catalog is for and why someone would browse it."
        trailing={
          <Button asChild className="gap-1.5">
            <Link to="/dashboard/things/new">
              <Plus className="size-4" />
              New thing
            </Link>
          </Button>
        }
      />

      {isLoading && <PageLoading variant="list" count={4} />}

      {!isLoading && data.total === 0 && (
        <EmptyState
          icon={FileText}
          title="No things yet"
          description="When you create one it'll show up here. Things are useful because <reason>."
          tips={[
            'Tip 1 — explain what to type or do',
            'Tip 2 — link to a starter template if you have one',
          ]}
          action={{
            label: 'Create your first thing',
            onClick: () => (window.location.href = '/dashboard/things/new'),
          }}
        />
      )}

      {!isLoading && data.total > 0 && (
        <>
          {/* Toolbar — count on the left, view toggle on the right */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data.total} {data.total === 1 ? 'thing' : 'things'}
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.things.map((thing) => (
                <Item
                  key={thing.id}
                  className={cn('border bg-card transition-colors hover:bg-muted/30')}
                >
                  <Link
                    to={`/dashboard/things/${thing.id}`}
                    className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                  >
                    <ItemMedia variant="icon">
                      <FileText className="size-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>
                        <span className="truncate">{thing.name}</span>
                      </ItemTitle>
                      <ItemDescription className="line-clamp-2">
                        {thing.description}
                      </ItemDescription>
                    </ItemContent>
                  </Link>
                  <ItemActions className="shrink-0 self-start">
                    <Badge variant="secondary" className="text-[10px]">
                      {thing.category}
                    </Badge>
                  </ItemActions>
                </Item>
              ))}
            </div>
          ) : (
            <ListRowGroup>
              {data.things.map((thing) => (
                <li key={thing.id}>
                  <ListRow asChild>
                    <Link to={`/dashboard/things/${thing.id}`}>
                      <ListRowIcon>
                        <FileText className="text-muted-foreground" />
                      </ListRowIcon>
                      <ListRowBody>
                        <ListRowTitle>{thing.name}</ListRowTitle>
                        <ListRowMeta>
                          <span>updated {thing.updatedAt}</span>
                          <span>·</span>
                          <span>{thing.category}</span>
                        </ListRowMeta>
                      </ListRowBody>
                      <ListRowTrailing>
                        <ChevronRight className="size-3.5 text-muted-foreground/50 transition-colors group-hover/list-row:text-foreground" />
                      </ListRowTrailing>
                    </Link>
                  </ListRow>
                </li>
              ))}
            </ListRowGroup>
          )}
        </>
      )}
    </PageContainer>
  )
}

export default TemplateCatalogPage
