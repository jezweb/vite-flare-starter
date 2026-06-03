/**
 * ConversationSidebar — list of past conversations with search + CRUD
 */
import { formatRelative } from '@/client/lib/format-time'
import { useState, useEffect, useDeferredValue, useMemo } from 'react'
import { Link, useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Search,
  ChevronRight,
  Star,
  Folder,
  FolderPlus,
  FolderX,
  FolderMinus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { apiClient } from '@/client/lib/api-client'
import {
  useConversationList,
  useDeleteConversation,
  useUpdateConversationTitle,
  useStarConversation,
} from '../hooks/useConversations'
import {
  useProjectList,
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
  useMoveConversation,
  type Project,
} from '@/client/modules/projects/hooks/useProjects'
import { getProjectFillClass } from '@/client/modules/projects/colors'
import { ProjectHoverCard } from '@/client/modules/projects/components/ProjectHoverCard'

interface Props {
  activeConversationId?: string
}

const timeAgo = formatRelative

interface ConversationSummary {
  id: string
  title: string | null
  summary?: string | null
  starred?: number
  /** null = ungrouped; otherwise the id of the containing project. */
  projectId?: string | null
  model: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Group conversations by starred → Today → Yesterday → Last 7 days → Older.
 * Starred conversations appear in their own pinned section at the top,
 * keeping chronological order within the pinned group.
 */
function groupByDate(conversations: ConversationSummary[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - 7 * 86400000

  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: 'Starred', items: [] },
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Last 7 days', items: [] },
    { label: 'Older', items: [] },
  ]

  for (const conv of conversations) {
    if (conv.starred) {
      groups[0]!.items.push(conv)
      continue
    }
    const ts = new Date(conv.updatedAt).getTime()
    if (ts >= todayStart) groups[1]!.items.push(conv)
    else if (ts >= yesterdayStart) groups[2]!.items.push(conv)
    else if (ts >= weekStart) groups[3]!.items.push(conv)
    else groups[4]!.items.push(conv)
  }

  return groups.filter((g) => g.items.length > 0)
}

export function ConversationSidebar({ activeConversationId }: Props) {
  const navigate = useNavigate()
  // Detect the active project context so the "+ New chat" button can preserve
  // it. Two sources: /dashboard/projects/:id (project page), or
  // /dashboard/chat/:id where the conversation belongs to a project (list
  // cache). Either way we route the "+" to /dashboard/chat?projectId=... so
  // the new conversation lands inside the project.
  const location = useLocation()
  const routeParams = useParams<{ id?: string; conversationId?: string }>()
  const [searchParams] = useSearchParams()
  const { data, isLoading } = useConversationList()
  const { data: projectData } = useProjectList()
  const deleteConversation = useDeleteConversation()
  const updateTitle = useUpdateConversationTitle()
  const starConversation = useStarConversation()
  const moveConversation = useMoveConversation()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [projectRenameText, setProjectRenameText] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<string | null>(null)
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const deferredQuery = useDeferredValue(searchQuery)
  // Collapsed groups persisted per user in localStorage. "Older" starts
  // collapsed by default — long histories are usually noise until needed.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem('sidebar.collapsedGroups')
      if (raw) return new Set(JSON.parse(raw))
    } catch {}
    return new Set(['Older'])
  })
  useEffect(() => {
    try {
      localStorage.setItem('sidebar.collapsedGroups', JSON.stringify([...collapsedGroups]))
    } catch {}
  }, [collapsedGroups])
  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const conversations = data?.conversations ?? []
  const projects = projectData?.projects ?? []

  // Project context for the "+ New chat" button:
  //   /dashboard/projects/:id        → routeParams.id is the project
  //   /dashboard/chat/:conversationId → look up the convo's projectId
  //   /dashboard/chat?projectId=X    → URL param (pre-send state)
  const onProjectPage = location.pathname.startsWith('/dashboard/projects/')
  const activeConversationProjectId = routeParams.conversationId
    ? (conversations.find((c) => c.id === routeParams.conversationId)?.projectId ?? null)
    : null
  const newChatProjectId = onProjectPage
    ? (routeParams.id ?? null)
    : (activeConversationProjectId ?? searchParams.get('projectId'))

  // Partition conversations into project buckets + ungrouped. Project buckets
  // keep starred-then-recent order (the server already sorts the list that
  // way at /api/conversations). Ungrouped rows flow through groupByDate as
  // before. Memoised so sidebar renders don't re-partition 50 rows per tick.
  const { byProject, ungrouped } = useMemo(() => {
    const byProject = new Map<string, ConversationSummary[]>()
    const ungrouped: ConversationSummary[] = []
    for (const c of conversations) {
      if (c.projectId) {
        const bucket = byProject.get(c.projectId) ?? []
        bucket.push(c)
        byProject.set(c.projectId, bucket)
      } else {
        ungrouped.push(c)
      }
    }
    return { byProject, ungrouped }
  }, [conversations])

  // Search conversations when query is non-empty
  const { data: searchResults } = useQuery({
    queryKey: ['conversations', 'search', deferredQuery],
    queryFn: () =>
      apiClient.get<{ results: { conversationId: string; snippet: string; role: string }[] }>(
        `/api/conversations/search?q=${encodeURIComponent(deferredQuery)}`
      ),
    enabled: deferredQuery.length >= 2,
  })

  const isSearching = deferredQuery.length >= 2
  const searchHits = searchResults?.results ?? []

  /**
   * Render a single conversation row. Declared inline so it can capture
   * the sidebar's rename/menu state without plumbing 10 props. Shared by
   * both the Projects section and the date-grouped section.
   */
  const renderConversationRow = (conv: ConversationSummary) => (
    <Link
      key={conv.id}
      to={`/dashboard/chat/${conv.id}`}
      className={cn(
        'group flex items-center gap-2 rounded-md px-2.5 py-2 transition-colors',
        conv.id === activeConversationId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
      )}
    >
      <div className="flex-1 min-w-0">
        {renamingId === conv.id ? (
          <Input
            autoFocus
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const t = renameText.trim()
                if (t) updateTitle.mutate({ id: conv.id, title: t })
                setRenamingId(null)
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setRenamingId(null)
              }
            }}
            onBlur={() => {
              const t = renameText.trim()
              if (t && t !== (conv.title || '')) {
                updateTitle.mutate({ id: conv.id, title: t })
              }
              setRenamingId(null)
            }}
            className="h-6 text-sm px-1.5"
          />
        ) : (
          <>
            <div
              className="text-sm font-medium line-clamp-2 leading-snug"
              title={conv.title || 'Untitled'}
            >
              {conv.title || 'Untitled'}
            </div>
            <div
              className="text-[10px] text-muted-foreground line-clamp-2 leading-snug mt-0.5"
              title={conv.summary ?? undefined}
            >
              <span className="whitespace-nowrap">{timeAgo(conv.updatedAt)}</span>
              {conv.summary && <span className="opacity-80"> · {conv.summary}</span>}
            </div>
          </>
        )}
      </div>
      {renamingId !== conv.id && (
        <div className="flex items-center shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'size-6 transition-opacity',
              conv.starred
                ? 'opacity-100 text-yellow-500 hover:text-yellow-600'
                : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground'
            )}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              starConversation.mutate({ id: conv.id, starred: !conv.starred })
            }}
            title={conv.starred ? 'Unstar' : 'Star'}
            aria-label={conv.starred ? 'Remove star' : 'Star conversation'}
            aria-pressed={!!conv.starred}
          >
            <Star className={cn('size-3.5', conv.starred && 'fill-current')} />
          </Button>
          <DropdownMenu
            open={openMenuId === conv.id}
            onOpenChange={(open) => setOpenMenuId(open ? conv.id : null)}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'size-6 transition-opacity',
                  openMenuId === conv.id
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                )}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                title="More actions"
                aria-label="More actions"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.preventDefault()}>
              <DropdownMenuItem
                onSelect={() => {
                  setRenameText(conv.title || '')
                  setRenamingId(conv.id)
                  setOpenMenuId(null)
                }}
              >
                <Pencil className="mr-2 size-3.5" />
                Rename
              </DropdownMenuItem>

              {/* Move to project — submenu listing user projects plus a
                  "Remove from project" option. Omitted entirely when the
                  user has no projects yet. */}
              {projects.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Folder className="mr-2 size-3.5" />
                    Move to project…
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {projects.map((p) => (
                      <DropdownMenuItem
                        key={p.id}
                        disabled={conv.projectId === p.id}
                        onSelect={() => {
                          moveConversation.mutate({ id: conv.id, projectId: p.id })
                          setOpenMenuId(null)
                        }}
                      >
                        <Folder className="mr-2 size-3.5" />
                        {p.name}
                      </DropdownMenuItem>
                    ))}
                    {conv.projectId && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => {
                            moveConversation.mutate({ id: conv.id, projectId: null })
                            setOpenMenuId(null)
                          }}
                        >
                          <FolderMinus className="mr-2 size-3.5" />
                          Remove from project
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  setConfirmDeleteId(conv.id)
                  setOpenMenuId(null)
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </Link>
  )

  return (
    <div className="flex h-full w-72 flex-col border-r bg-muted/30 shrink-0">
      <div className="flex items-center justify-between p-3 border-b">
        <span className="text-sm font-medium">Conversations</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => {
            const dest = newChatProjectId
              ? `/dashboard/chat?projectId=${newChatProjectId}`
              : '/dashboard/chat'
            navigate(dest)
          }}
          title={newChatProjectId ? 'New chat in this project' : 'New conversation'}
          aria-label={newChatProjectId ? 'New chat in this project' : 'New conversation'}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-2 pt-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Using native overflow-y-auto rather than Radix's ScrollArea so our
          global thin-pill scrollbar style (in src/index.css) takes effect.
          Radix renders its own div-based scrollbar which bypasses
          ::-webkit-scrollbar. Flexbox direction matters — need flex-col +
          min-h-0 so this div actually gets bounded height from the parent. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isSearching ? (
          // Search results
          searchHits.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No results for "{deferredQuery}"
            </div>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {searchHits.map((hit) => (
                <Link
                  key={hit.conversationId}
                  to={`/dashboard/chat/${hit.conversationId}`}
                  className="block rounded-md px-2.5 py-2 transition-colors hover:bg-muted"
                >
                  <div className="text-sm truncate">{hit.snippet}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {hit.role === 'title' ? 'Title match' : 'Message match'}
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">No conversations yet</div>
        ) : (
          <div className="p-1.5 space-y-2">
            {/* ── PROJECTS section ─────────────────────────────────────────
                Rendered above date groups. Each project is its own collapsible
                mini-group sharing the existing `collapsedGroups` localStorage
                key — the key "project:<id>" namespaces them so they don't
                collide with date-group keys. */}
            <ProjectsSection
              projects={projects}
              byProject={byProject}
              collapsedGroups={collapsedGroups}
              toggleGroup={toggleGroup}
              renderConversationRow={renderConversationRow}
              creatingProject={creatingProject}
              setCreatingProject={setCreatingProject}
              newProjectName={newProjectName}
              setNewProjectName={setNewProjectName}
              createProject={(name) => createProject.mutate({ name })}
              renamingProjectId={renamingProjectId}
              setRenamingProjectId={setRenamingProjectId}
              projectRenameText={projectRenameText}
              setProjectRenameText={setProjectRenameText}
              updateProject={(id, name) => updateProject.mutate({ id, name })}
              requestDeleteProject={setConfirmDeleteProjectId}
            />

            {/* ── Date-grouped ungrouped conversations ─────────────────── */}
            {groupByDate(ungrouped).map((group) => {
              const isCollapsed = collapsedGroups.has(group.label)
              return (
                <div key={group.label}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className="flex w-full items-center gap-1 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    aria-expanded={!isCollapsed}
                    aria-label={`Toggle ${group.label} group`}
                  >
                    <ChevronRight
                      className={cn('size-3 transition-transform', !isCollapsed && 'rotate-90')}
                    />
                    {group.label}
                    <span className="ml-auto font-normal normal-case tracking-normal">
                      {group.items.length}
                    </span>
                  </button>
                  <div className={cn('space-y-0.5', isCollapsed && 'hidden')}>
                    {group.items.map((conv) => renderConversationRow(conv))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog — reused for whichever conversation the
          user clicked "Delete" on from the ellipsis menu. */}
      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone — messages will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmDeleteId) return
                const id = confirmDeleteId
                deleteConversation.mutate(id)
                if (id === activeConversationId) navigate('/dashboard/chat')
                setConfirmDeleteId(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete-project confirmation. The FK is ON DELETE SET NULL so
          conversations survive and return to the flat list; the copy makes
          that explicit so users don't hesitate on the destructive-looking
          action. */}
      <AlertDialog
        open={!!confirmDeleteProjectId}
        onOpenChange={(open) => !open && setConfirmDeleteProjectId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                // Surface the conversation count so users know what they're
                // releasing. N chats "return to the flat list" via the
                // ON DELETE SET NULL FK — the project row goes away but the
                // data stays.
                const count = confirmDeleteProjectId
                  ? (byProject.get(confirmDeleteProjectId)?.length ?? 0)
                  : 0
                if (count === 0) return 'The project is empty. It will be removed from the sidebar.'
                if (count === 1)
                  return '1 conversation will return to the main list. You can re-group it later.'
                return `${count} conversations will return to the main list. You can re-group them later.`
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmDeleteProjectId) return
                deleteProject.mutate(confirmDeleteProjectId)
                setConfirmDeleteProjectId(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── ProjectsSection ──────────────────────────────────────────────────────
// Rendered at the top of the sidebar scroll area. Each project is a
// collapsible mini-group with its own count, rename-inline, and ellipsis
// menu. Uses the parent's `collapsedGroups` localStorage key with a
// `project:<id>` namespace so date-group toggles don't clash.

interface ProjectsSectionProps {
  projects: Project[]
  byProject: Map<string, ConversationSummary[]>
  collapsedGroups: Set<string>
  toggleGroup: (label: string) => void
  renderConversationRow: (conv: ConversationSummary) => React.ReactNode
  creatingProject: boolean
  setCreatingProject: (v: boolean) => void
  newProjectName: string
  setNewProjectName: (v: string) => void
  createProject: (name: string) => void
  renamingProjectId: string | null
  setRenamingProjectId: (id: string | null) => void
  projectRenameText: string
  setProjectRenameText: (v: string) => void
  updateProject: (id: string, name: string) => void
  requestDeleteProject: (id: string) => void
}

function ProjectsSection({
  projects,
  byProject,
  collapsedGroups,
  toggleGroup,
  renderConversationRow,
  creatingProject,
  setCreatingProject,
  newProjectName,
  setNewProjectName,
  createProject,
  renamingProjectId,
  setRenamingProjectId,
  projectRenameText,
  setProjectRenameText,
  updateProject,
  requestDeleteProject,
}: ProjectsSectionProps) {
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null)

  // Keep the section collapsed/expanded toggle on the parent's localStorage.
  const sectionKey = 'Projects'
  const sectionCollapsed = collapsedGroups.has(sectionKey)

  const startCreate = () => {
    setNewProjectName('')
    setCreatingProject(true)
  }

  const commitCreate = () => {
    const n = newProjectName.trim()
    if (n) createProject(n)
    setCreatingProject(false)
    setNewProjectName('')
  }

  return (
    <div>
      {/* Section header with count + "new project" button on the right.
          Always rendered so the affordance is discoverable even when the
          user has zero projects. */}
      <div className="flex w-full items-center gap-1 px-2.5 py-1">
        <button
          type="button"
          onClick={() => toggleGroup(sectionKey)}
          className="flex flex-1 items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          aria-expanded={!sectionCollapsed}
        >
          <ChevronRight
            className={cn('size-3 transition-transform', !sectionCollapsed && 'rotate-90')}
          />
          Projects
          <span className="ml-1 font-normal normal-case tracking-normal">
            {projects.length > 0 ? projects.length : ''}
          </span>
        </button>
        <button
          type="button"
          onClick={startCreate}
          className="rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
          title="New project"
          aria-label="New project"
        >
          <FolderPlus className="size-3.5" />
        </button>
      </div>

      {!sectionCollapsed && (
        <div className="space-y-0.5">
          {/* Inline new-project input. Saves on Enter / blur, cancels on
              Escape. Sits at the top so new projects are visible right away. */}
          {creatingProject && (
            <div className="px-2.5 py-1.5">
              <Input
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitCreate()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setCreatingProject(false)
                    setNewProjectName('')
                  }
                }}
                onBlur={commitCreate}
                placeholder="Project name…"
                maxLength={100}
                className="h-7 text-xs"
              />
            </div>
          )}

          {projects.length === 0 && !creatingProject && (
            <div className="px-2.5 py-2 text-[11px] text-muted-foreground/70">
              No projects yet.{' '}
              <button
                type="button"
                onClick={startCreate}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Create one
              </button>{' '}
              to group related chats.
            </div>
          )}

          {projects.map((project) => {
            const projectKey = `project:${project.id}`
            const isCollapsed = collapsedGroups.has(projectKey)
            const convs = byProject.get(project.id) ?? []
            const isRenaming = renamingProjectId === project.id
            return (
              <div key={project.id}>
                <div className="group flex items-center gap-1 px-2.5 py-1 text-xs transition-colors hover:bg-muted/50 rounded-md">
                  {/* Chevron toggle — separate from the name so clicking the
                      name navigates to the project page (next to claude.ai's
                      convention) rather than expanding inline. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleGroup(projectKey)
                    }}
                    className="shrink-0 rounded p-0.5 hover:bg-muted"
                    aria-expanded={!isCollapsed}
                    aria-label={`Toggle ${project.name}`}
                  >
                    <ChevronRight
                      className={cn(
                        'size-3 transition-transform text-muted-foreground',
                        !isCollapsed && 'rotate-90'
                      )}
                    />
                  </button>
                  {isRenaming ? (
                    <div className="flex flex-1 items-center gap-1.5 min-w-0">
                      <Folder
                        className={cn(
                          'size-3.5 shrink-0',
                          getProjectFillClass(project.color) ?? 'text-muted-foreground'
                        )}
                      />
                      <Input
                        autoFocus
                        value={projectRenameText}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setProjectRenameText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const t = projectRenameText.trim()
                            if (t && t !== project.name) updateProject(project.id, t)
                            setRenamingProjectId(null)
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            setRenamingProjectId(null)
                          }
                        }}
                        onBlur={() => {
                          const t = projectRenameText.trim()
                          if (t && t !== project.name) updateProject(project.id, t)
                          setRenamingProjectId(null)
                        }}
                        className="h-5 py-0 px-1 text-xs"
                      />
                    </div>
                  ) : (
                    <ProjectHoverCard projectId={project.id}>
                      <Link
                        to={`/dashboard/projects/${project.id}`}
                        className="flex flex-1 items-center gap-1.5 min-w-0 hover:underline underline-offset-2"
                      >
                        <Folder
                          className={cn(
                            'size-3.5 shrink-0',
                            getProjectFillClass(project.color) ?? 'text-muted-foreground'
                          )}
                        />
                        <span className="truncate font-medium" title={project.name}>
                          {project.name}
                        </span>
                        <span className="ml-auto shrink-0 text-muted-foreground/60 tabular-nums">
                          {convs.length}
                        </span>
                      </Link>
                    </ProjectHoverCard>
                  )}
                  {!isRenaming && (
                    <DropdownMenu
                      open={openProjectMenuId === project.id}
                      onOpenChange={(open) => setOpenProjectMenuId(open ? project.id : null)}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'size-5 shrink-0 transition-opacity',
                            openProjectMenuId === project.id
                              ? 'opacity-100'
                              : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                          )}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                          aria-label="Project actions"
                        >
                          <MoreHorizontal className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setProjectRenameText(project.name)
                            setRenamingProjectId(project.id)
                            setOpenProjectMenuId(null)
                          }}
                        >
                          <Pencil className="mr-2 size-3.5" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => {
                            requestDeleteProject(project.id)
                            setOpenProjectMenuId(null)
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <FolderX className="mr-2 size-3.5" />
                          Delete project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="ml-4 space-y-0.5 border-l border-border/40 pl-2">
                    {convs.length === 0 ? (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground/50">
                        Empty — use a chat's ⋯ menu → Move to project.
                      </div>
                    ) : (
                      convs.map((conv) => renderConversationRow(conv))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
