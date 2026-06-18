/**
 * ProjectsIndexPage — `/dashboard/projects`
 *
 * Top-level destination listing all of the user's projects. Mirrors
 * claude.ai's Projects index (image #20, #29) — search, sort, card grid,
 * "+ New project" button.
 *
 * Phase 5 will add Your projects / Team / Shared with you tabs.
 * Phase 1 ships single-pane "Your projects" only — the tab structure
 * is reserved by rendering a single visible tab so the layout is stable.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Star, FolderOpen, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useProjectList, useStarProject, type Project } from '../hooks/useProjects'
import { CreateProjectModal } from '../components/CreateProjectModal'
import { PROJECT_COLOR_CLASSES, isProjectColor } from '../colors'
import { cn } from '@/lib/utils'
import { apiClient } from '@/client/lib/api-client'
import { EmptyState as SharedEmptyState } from '@/client/components/EmptyState'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { SearchInput } from '@/components/ui/search-input'
import { formatRelative } from '@/client/lib/format-time'

type SortKey = 'activity' | 'name' | 'created'

const timeAgo = (dateStr: string | null) => formatRelative(dateStr)

export function ProjectsIndexPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('activity')
  const [showArchived, setShowArchived] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // ?new=1 from the command palette / Cmd+K opens the create modal on
  // mount. Strip the param after triggering so a refresh doesn't
  // re-open it endlessly.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreateOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isLoading } = useProjectList({ search, sort, includeArchived: showArchived })
  const starProject = useStarProject()

  const projects = data?.projects ?? []

  return (
    <PageContainer type="index">
      <div data-tour="projects-list">
        <PageHeader
          title="Projects"
          subtitle="Long-running spaces for your work — chats, files, notes, and memory all in one place. Share with teammates as needed."
          trailing={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1.5" />
              New project
            </Button>
          }
        />
      </div>

      {/* Search + sort row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search projects…"
          showClearButton
          className="flex-1"
        />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="show-archived" className="text-xs text-muted-foreground cursor-pointer">
              Show archived
            </Label>
            <Switch
              id="show-archived"
              aria-label="Show archived projects"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground" id="projects-sort-label">
              Sort by
            </span>
            {/* P4-020 — bare <select> needs an accessible name. The
                visible "Sort by" label sits beside it but isn't a
                <label htmlFor=>; aria-label gives screen readers the
                programmatic name without changing visible markup. */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort projects"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            >
              <option value="activity">Activity</option>
              <option value="name">Name</option>
              <option value="created">Created</option>
            </select>
          </div>
        </div>
      </div>

      {/* Single visual tab — Phase 5 adds Your projects / Team / Shared with you */}
      <div className="border-b border-border">
        <div className="inline-flex h-9 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground -mb-px">
          <button
            type="button"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium bg-background text-foreground shadow-sm"
          >
            Your projects
          </button>
        </div>
      </div>

      {/* Loading / empty / cards */}
      {isLoading ? (
        <PageLoading variant="grid" count={4} />
      ) : projects.length === 0 ? (
        <EmptyState
          search={search}
          showArchived={showArchived}
          onCreate={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onStar={(starred) => starProject.mutate({ id: p.id, starred })}
            />
          ))}
        </div>
      )}

      <CreateProjectModal open={createOpen} onOpenChange={setCreateOpen} />
    </PageContainer>
  )
}

function EmptyState({
  search,
  showArchived,
  onCreate,
}: {
  search: string
  showArchived: boolean
  onCreate: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [loadingSample, setLoadingSample] = useState(false)

  if (search) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No projects match "<span className="font-medium text-foreground">{search}</span>".
        </p>
      </div>
    )
  }
  if (showArchived) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No archived projects.</p>
      </div>
    )
  }

  // gh #45 — "Try a sample project" lets first-time users see populated
  // state without committing their own data. Reuses the existing
  // /from-template endpoint with the Quoting template — its starter
  // memories + suggested prompts give a feel for what a real project
  // looks like. Project name carries "(Sample)" so the user knows it's
  // example data and can delete it freely.
  async function loadSample() {
    setLoadingSample(true)
    try {
      const resp = await apiClient.post<{ id: string }>('/api/projects/from-template', {
        templateSlug: 'quoting',
        name: 'Quoting (Sample)',
      })
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Sample project loaded — feel free to explore or delete')
      navigate(`/dashboard/projects/${resp.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load sample')
    } finally {
      setLoadingSample(false)
    }
  }

  return (
    <SharedEmptyState
      icon={FolderOpen}
      title="No projects yet"
      description="Projects bundle a set of chats with shared memory, instructions, and files — handy for ongoing work like a side product, a customer, or a research thread."
      action={{ label: 'New project', onClick: onCreate }}
      secondaryAction={{
        label: loadingSample ? 'Loading…' : 'Or try a sample',
        onClick: () => void loadSample(),
      }}
    />
  )
}

function ProjectCard({
  project,
  onStar,
}: {
  project: Project
  onStar: (starred: boolean) => void
}) {
  const isArchived = project.archived === 1
  const colorClass = isProjectColor(project.color)
    ? PROJECT_COLOR_CLASSES[project.color].fill
    : 'text-muted-foreground'

  return (
    <Link
      to={`/dashboard/projects/${project.id}`}
      className={cn(
        'group block rounded-lg border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm',
        isArchived && 'opacity-60'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <FolderOpen className={cn('size-4 shrink-0 mt-1', colorClass)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{project.name}</h3>
              {isArchived && <Archive className="size-3 text-muted-foreground shrink-0" />}
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground line-clamp-3 mt-1">
                {project.description}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onStar(project.starred === 0)
          }}
          className={cn(
            'shrink-0 rounded-md p-1 -m-1 transition-colors hover:bg-muted',
            project.starred
              ? 'text-yellow-500'
              : 'text-muted-foreground opacity-0 group-hover:opacity-100'
          )}
          aria-label={project.starred ? 'Unstar project' : 'Star project'}
          title={project.starred ? 'Unstar' : 'Star'}
        >
          <Star className={cn('size-4', project.starred && 'fill-current')} />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {project.conversationCount ?? 0} {project.conversationCount === 1 ? 'chat' : 'chats'}
        </span>
        <span>Updated {timeAgo(project.updatedAt)}</span>
      </div>
    </Link>
  )
}

export default ProjectsIndexPage
