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
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Star, FolderOpen, Loader2, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useProjectList, useStarProject, type Project } from '../hooks/useProjects'
import { CreateProjectModal } from '../components/CreateProjectModal'
import { PROJECT_COLOR_CLASSES, isProjectColor } from '../colors'
import { cn } from '@/lib/utils'

type SortKey = 'activity' | 'name' | 'created'

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'just now'
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export function ProjectsIndexPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('activity')
  const [showArchived, setShowArchived] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useProjectList({ search, sort, includeArchived: showArchived })
  const starProject = useStarProject()

  const projects = data?.projects ?? []

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1.5" />
          New project
        </Button>
      </div>

      {/* Search + sort row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="show-archived" className="text-xs text-muted-foreground cursor-pointer">
              Show archived
            </Label>
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Sort by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
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
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" />
          Loading projects…
        </div>
      ) : projects.length === 0 ? (
        <EmptyState search={search} showArchived={showArchived} onCreate={() => setCreateOpen(true)} />
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
    </div>
  )
}

function EmptyState({ search, showArchived, onCreate }: { search: string; showArchived: boolean; onCreate: () => void }) {
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
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center space-y-3">
      <FolderOpen className="size-10 mx-auto text-muted-foreground" />
      <h3 className="font-semibold">No projects yet</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Create your first project to organise chats with persistent memory, instructions, and files.
      </p>
      <Button onClick={onCreate}>
        <Plus className="size-4 mr-1.5" />
        New project
      </Button>
    </div>
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
  const colorClass = isProjectColor(project.color) ? PROJECT_COLOR_CLASSES[project.color].fill : 'text-muted-foreground'

  return (
    <Link
      to={`/dashboard/projects/${project.id}`}
      className={cn(
        'group block rounded-lg border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm',
        isArchived && 'opacity-60',
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
            project.starred ? 'text-yellow-500' : 'text-muted-foreground opacity-0 group-hover:opacity-100',
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
