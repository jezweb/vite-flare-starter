/**
 * ProjectPage — `/dashboard/projects/:id`
 *
 * Claude.ai-style two-column layout:
 *   Left:  Quick chat input + chats list
 *   Right: Memory section (placeholder until Phase 3) + Instructions + Files (placeholder until Phase 2)
 *
 * Mobile: right column collapses below the chat column.
 *
 * See `.jez/artifacts/projects-first-class-plan-2026-04-26.md` Phase 1 UI spec.
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Plus,
  Star,
  Share2,
  MoreVertical,
  Archive,
  Trash2,
  Edit3,
  MessageSquare,
  PencilLine,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ShareProjectDialog } from '../components/ShareProjectDialog'
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useArchiveProject,
  useStarProject,
} from '../hooks/useProjects'
import { ProjectFilesSection } from '../components/ProjectFilesSection'
import { MemorySection } from '../components/MemorySection'
import { cn } from '@/lib/utils'

interface ProjectConversation {
  id: string
  title: string | null
  summary: string | null
  starred: number
  model: string | null
  tags: string | null
  updatedAt: string | null
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

export function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useProject(id)
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const archiveProject = useArchiveProject()
  const starProject = useStarProject()

  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [shareInfoOpen, setShareInfoOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')

  const project = data?.project
  const conversations = (data?.conversations ?? []) as ProjectConversation[]

  const isArchived = project?.archived === 1

  const startChatInProject = useCallback(
    (initialMessage?: string) => {
      const params = new URLSearchParams()
      params.set('projectId', String(id))
      if (initialMessage) params.set('q', initialMessage)
      navigate(`/dashboard/chat?${params.toString()}`)
    },
    [id, navigate],
  )

  const handleSubmitChat = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    startChatInProject(chatInput.trim())
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Spinner size="lg" className="mr-2" />
        Loading project…
      </div>
    )
  }

  if (error || !project || !id) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h1 className="text-xl font-semibold">Project not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This project may have been deleted, or you don't have access to it.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard/projects">All projects</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto py-4 space-y-6">
      {/* Top bar — back link */}
      <div>
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground -ml-2">
          <Link to="/dashboard/projects">
            <ArrowLeft className="size-3.5 mr-1.5" />
            All projects
          </Link>
        </Button>
      </div>

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight truncate">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{project.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Created by you
            {isArchived && (
              <>
                <span className="mx-1.5">·</span>
                <span className="inline-flex items-center gap-1">
                  <Archive className="size-3" />
                  Archived
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Project options">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditProjectOpen(true)}>
                <Edit3 className="size-3.5 mr-2" />
                Edit project
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => archiveProject.mutate({ id, archived: !isArchived })}
              >
                <Archive className="size-3.5 mr-2" />
                {isArchived ? 'Restore from archive' : 'Archive project'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="size-3.5 mr-2" />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => starProject.mutate({ id, starred: project.starred === 0 })}
            aria-label={project.starred ? 'Unstar project' : 'Star project'}
          >
            <Star
              className={cn('size-4', project.starred && 'fill-yellow-500 text-yellow-500')}
            />
          </Button>
          <Button variant="outline" onClick={() => setShareInfoOpen(true)}>
            <Share2 className="size-3.5 mr-1.5" />
            Share
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: chat input + chats list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Quick chat input */}
          <form onSubmit={handleSubmitChat} className="rounded-2xl border bg-card p-4 space-y-3">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSubmitChat(e as unknown as React.FormEvent)
                }
              }}
              placeholder="How can I help you today?"
              rows={2}
              className="border-0 shadow-none focus-visible:ring-0 resize-none px-0 text-base"
              disabled={isArchived}
            />
            <div className="flex items-center justify-between">
              {/* Show the project's model override if set; otherwise stay
                  silent so a defaulted project doesn't read "Default model"
                  (which sounds like a placeholder). The chat page always
                  shows the actual model selector. */}
              <span className="text-xs text-muted-foreground">
                {project.defaultModel ?? ''}
              </span>
              <Button type="submit" size="sm" disabled={!chatInput.trim() || isArchived}>
                <Plus className="size-3.5 mr-1.5" />
                Start chat
              </Button>
            </div>
          </form>

          {/* Chats list */}
          {conversations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground italic">
                Start a chat to keep conversations organised and re-use project knowledge.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-muted-foreground px-2 py-1">
                Your chats
              </h2>
              <ul className="space-y-1">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/dashboard/chat/${c.id}`}
                      className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted"
                    >
                      {c.starred ? (
                        <Star className="size-3.5 shrink-0 fill-yellow-500 text-yellow-500" />
                      ) : (
                        <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium">
                          {c.title || 'Untitled'}
                        </div>
                        {c.summary && (
                          <div className="truncate text-xs text-muted-foreground">
                            {c.summary}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeAgo(c.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right column: Memory + Instructions + Files */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {/* Memory section */}
          <MemorySection
            scope="project"
            scopeId={id}
            mode={data?.project?.memoryUpdateMode ?? 'ask'}
            onModeChange={(next) =>
              updateProject.mutate({ id, memoryUpdateMode: next })
            }
          />

          {/* Instructions section */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Instructions</h3>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => setInstructionsOpen(true)}
                aria-label="Edit instructions"
              >
                {project.systemPrompt ? <PencilLine className="size-3.5" /> : <Plus className="size-3.5" />}
              </Button>
            </div>
            {project.systemPrompt ? (
              <p className="text-xs text-foreground line-clamp-4 whitespace-pre-wrap">
                {project.systemPrompt}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Tell the AI how it should behave in this project — tone of
                voice, what to focus on, things to avoid. Applies to every
                chat in here.
              </p>
            )}
          </div>

          {/* Files section */}
          <ProjectFilesSection projectId={id} />
        </div>
      </div>

      {/* Set Instructions Modal */}
      <SetInstructionsModal
        open={instructionsOpen}
        onOpenChange={setInstructionsOpen}
        projectName={project.name}
        currentValue={project.systemPrompt ?? ''}
        onSave={(value) => {
          updateProject.mutate(
            { id, systemPrompt: value || null },
            {
              onSuccess: () => {
                toast.success('Instructions saved')
                setInstructionsOpen(false)
              },
              onError: () => toast.error('Could not save instructions'),
            },
          )
        }}
        isPending={updateProject.isPending}
      />

      {/* Edit Project Modal */}
      <EditProjectModal
        open={editProjectOpen}
        onOpenChange={setEditProjectOpen}
        project={project}
        onSave={(name, description) => {
          updateProject.mutate(
            { id, name, description: description || null },
            {
              onSuccess: () => {
                toast.success('Project updated')
                setEditProjectOpen(false)
              },
              onError: () => toast.error('Could not update project'),
            },
          )
        }}
        isPending={updateProject.isPending}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete this project?"
        description="The project will be permanently deleted. Conversations will return to your main chat list (they're not deleted)."
        confirmLabel="Delete project"
        variant="destructive"
        onConfirm={() => {
          deleteProject.mutate(id, {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: ['conversations'] })
              toast.success('Project deleted')
              navigate('/dashboard/projects')
            },
            onError: () => toast.error('Could not delete project'),
          })
        }}
      />

      {/* Share — multi-user projects (Phase 5) */}
      <ShareProjectDialog
        projectId={id}
        open={shareInfoOpen}
        onClose={() => setShareInfoOpen(false)}
      />
    </div>
  )
}

// --- Set Instructions Modal ----------------------------------------------

function SetInstructionsModal({
  open,
  onOpenChange,
  projectName,
  currentValue,
  onSave,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  currentValue: string
  onSave: (value: string) => void
  isPending: boolean
}) {
  const [value, setValue] = useState(currentValue)

  useEffect(() => {
    if (open) setValue(currentValue)
  }, [open, currentValue])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Set project instructions</DialogTitle>
          <DialogDescription>
            Provide Claude with relevant instructions and information for chats within{' '}
            <span className="font-medium text-foreground">{projectName}</span>. This will work alongside{' '}
            <Link to="/dashboard/settings" className="underline underline-offset-2">user preferences</Link>{' '}
            and the selected style in a chat.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Break down large tasks and ask clarifying questions when needed."
          rows={12}
          maxLength={8000}
          className="font-mono text-xs md:text-xs"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground -mt-2">
          <span></span>
          <span className="tabular-nums">{value.length}/8000</span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(value)} disabled={isPending}>
            {isPending ? <Spinner size="sm" className="mr-1.5" /> : null}
            Save instructions
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- Edit Project Modal --------------------------------------------------

function EditProjectModal({
  open,
  onOpenChange,
  project,
  onSave,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: { name: string; description: string | null }
  onSave: (name: string, description: string) => void
  isPending: boolean
}) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')

  useEffect(() => {
    if (open) {
      setName(project.name)
      setDescription(project.description ?? '')
    }
  }, [open, project.name, project.description])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave(name.trim(), description.trim())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription className="sr-only">Update the project name and description.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="edit-name">Name</FieldLabel>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-description">Description</FieldLabel>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || isPending}>
              {isPending ? <Spinner size="sm" className="mr-1.5" /> : null}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default ProjectPage
