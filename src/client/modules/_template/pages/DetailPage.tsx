/**
 * TemplateDetailPage — copy this for a new `detail`-type module page.
 *
 * Shape:
 *   - PageContainer type="detail"
 *   - DetailHeader with back-link, record name, status badges, action cluster
 *   - One of four body sub-patterns (single column shown here)
 *
 * Sub-pattern reference (see docs/PAGE_GRAMMAR.md for the full table):
 *   - Single column   — one thing to read, no parallel context
 *   - Two-column      — primary content + reference panel beside it
 *   - Three-pane      — realtime work surface (members · timeline · thread)
 *   - Tabs            — same record viewed through different lenses
 *
 * Don't mix sub-patterns inside one detail page.
 */
import { useParams } from 'react-router-dom'
import { MoreVertical, Trash2, Edit3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageContainer } from '@/components/ui/page-container'
import { DetailHeader } from '@/components/ui/detail-header'
import { Section } from '@/components/ui/section'
import { PageLoading } from '@/client/components/PageState'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
// import { useThing } from '../hooks/useThings'

export function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  // const { data, isLoading } = useThing(id)
  const isLoading = false
  const thing = {
    id: id ?? '',
    name: 'Sample thing',
    status: 'active',
    description: 'A short description',
  }

  if (isLoading) {
    return (
      <PageContainer type="detail">
        <PageLoading variant="detail" />
      </PageContainer>
    )
  }

  return (
    <PageContainer type="detail">
      <DetailHeader
        title={thing.name}
        backTo="/dashboard/things"
        backLabel="Things"
        subtitle={
          <>
            <Badge variant="outline" className="text-[10px]">
              {thing.status}
            </Badge>
            <span>·</span>
            <span>{thing.description}</span>
          </>
        }
        trailing={
          <>
            <Button size="sm" variant="outline">
              Primary action
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Edit3 className="size-3.5 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive">
                  <Trash2 className="size-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Single-column body — stack Section blocks. */}
      <Section title="Section title">
        <p className="text-sm">Body content goes here.</p>
      </Section>

      <Section title="Another section">
        <p className="text-sm">More body content.</p>
      </Section>
    </PageContainer>
  )
}

export default TemplateDetailPage
