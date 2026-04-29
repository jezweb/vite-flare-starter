/**
 * TemplateIndexPage — copy this for a new "queue"-type module page.
 *
 * Shape:
 *   - PageContainer type="queue" (max-w-3xl, narrow read width)
 *   - PageHeader with title + user-voice subtitle + primary CTA
 *   - PageLoading skeleton matching the body shape
 *   - EmptyState with verb-led action when there's no data
 *   - ListRowGroup for the populated state (no Card chrome around rows)
 *
 * For an `index` (card grid) or `catalog` (marketplace) variant, swap
 * type="queue" → type="index" or "catalog" and replace ListRowGroup
 * with a Card grid.
 */
import { Link } from 'react-router-dom'
import { Plus, ChevronRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { EmptyState } from '@/client/components/EmptyState'
import {
  ListRow,
  ListRowGroup,
  ListRowIcon,
  ListRowBody,
  ListRowTitle,
  ListRowMeta,
  ListRowTrailing,
} from '@/components/ui/list-row'
// Replace with your real hook in hooks/useThings.ts
// import { useThings } from '../hooks/useThings'

export function TemplateIndexPage() {
  // const { data, isLoading } = useThings()
  const data = { total: 0, things: [] as Array<{ id: string; name: string; updatedAt: string }> }
  const isLoading = false

  return (
    <PageContainer type="queue">
      <PageHeader
        title="Things"
        subtitle="One-line, user-voice description of what this page is for and why someone would visit it."
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
                    </ListRowMeta>
                  </ListRowBody>
                  <ListRowTrailing>
                    <ChevronRight className="size-3.5 text-muted-foreground/50 group-hover/list-row:text-foreground transition-colors" />
                  </ListRowTrailing>
                </Link>
              </ListRow>
            </li>
          ))}
        </ListRowGroup>
      )}
    </PageContainer>
  )
}

export default TemplateIndexPage
