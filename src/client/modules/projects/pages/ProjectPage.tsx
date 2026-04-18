/**
 * ProjectPage — /dashboard/projects/:id
 *
 * Claude.ai-inspired project page. One project = one page with:
 *   - name + description (editable)
 *   - project instructions (system prompt, editable)
 *   - default model (dropdown)
 *   - list of conversations in this project
 *   - "New chat in this project" button
 *
 * Phase 2 scope: everything except knowledge files (Phase 3) and
 * vectorised search (Phase 4).
 *
 * All edits use inline save-on-blur with optimistic cache updates via
 * `useUpdateProject`. No separate "Save" button per field — matches the
 * lightweight editing feel of the rest of the app.
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Pencil, Folder, Archive, MessageSquare, Loader2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { apiClient } from '@/client/lib/api-client'
import { useProject, useUpdateProject } from '../hooks/useProjects'

interface ProjectConversation {
  id: string
  title: string | null
  summary: string | null
  starred: number
  model: string | null
  updatedAt: string | null
}

interface AiModel {
  id: string
  name: string
  provider: string
  tier: string
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

  // Load the models catalogue so the "default model" picker shows the same
  // options as the chat composer. Same endpoint, keeps the source of truth
  // on the server.
  const { data: modelsData } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => apiClient.get<{ models: AiModel[]; recommended: string }>('/api/ai/models'),
    staleTime: 1000 * 60 * 5,
  })

  const project = data?.project
  const conversations = (data?.conversations ?? []) as ProjectConversation[]

  // Local editable mirrors. Sync when the server copy lands.
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [defaultModel, setDefaultModel] = useState<string>('')

  // Only re-sync local state when we navigate to a *different* project. A
  // background refetch (window focus, mutation invalidation) produces a new
  // `project` object reference but the same id — re-seeding from that would
  // clobber unsaved edits in a textarea mid-type.
  useEffect(() => {
    if (!project) return
    setName(project.name ?? '')
    setDescription(project.description ?? '')
    setSystemPrompt(project.systemPrompt ?? '')
    setDefaultModel(project.defaultModel ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const saveIfChanged = useCallback(
    (field: 'name' | 'description' | 'systemPrompt' | 'defaultModel', next: string) => {
      if (!project || !id) return
      const current = project[field] ?? ''
      if (next === current) return
      // Normalise empty → null except for name (which requires at least 1 char).
      if (field === 'name') {
        const trimmed = next.trim()
        if (!trimmed) {
          setName(current) // revert
          return
        }
        updateProject.mutate({ id, name: trimmed })
      } else {
        updateProject.mutate({ id, [field]: next || null })
      }
    },
    [project, id, updateProject],
  )

  const startChatInProject = useCallback(() => {
    // The chat page reads `?projectId=` on first render to stamp the new
    // conversation with the project. Phase 2 server changes make the server
    // enforce the linkage even if the client omits it — this is just UX.
    navigate(`/dashboard/chat?projectId=${id}`)
  }, [id, navigate])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" />
        Loading project…
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h1 className="text-xl font-semibold">Project not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This project may have been deleted, or you don't have access to it.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard/chat">Back to chat</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-4">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
          <Link to="/dashboard/chat">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Back to chat
          </Link>
        </Button>
        <Button onClick={startChatInProject} size="sm">
          <Plus className="size-3.5 mr-1.5" />
          New chat in this project
        </Button>
      </div>

      {/* Header — inline editable name + description. Blur saves. */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Folder className="size-5 text-muted-foreground shrink-0" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => saveIfChanged('name', name)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="text-xl font-semibold border-0 shadow-none px-2 focus-visible:ring-1 focus-visible:ring-primary/40 bg-transparent"
            maxLength={100}
            placeholder="Untitled project"
          />
        </div>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => saveIfChanged('description', description)}
          placeholder="Add a short description of what this project is about…"
          rows={2}
          maxLength={500}
          className="border-0 shadow-none px-2 focus-visible:ring-1 focus-visible:ring-primary/40 bg-transparent resize-none text-sm text-muted-foreground"
        />
      </div>

      {/* Project instructions — the juice. This becomes the system prompt
          prefix for every chat in this project. */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Pencil className="size-4 text-muted-foreground" />
                Project instructions
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                These get injected into every chat in this project. Good place for tone,
                domain context, terminology, spelling preferences — anything repeat-you for
                the same kind of work.
              </CardDescription>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {systemPrompt.length}/4000
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            onBlur={() => saveIfChanged('systemPrompt', systemPrompt)}
            placeholder={`e.g. This project is for editing the Clark Forklifts website. Use EN-AU spelling. When the user asks about service packages, default to the 2026 pricing sheet. Tone: warm, direct, no em-dashes.`}
            rows={8}
            maxLength={4000}
            className="resize-y min-h-32 font-mono text-xs"
          />
        </CardContent>
      </Card>

      {/* Default model — optional. Falls back to user default if unset. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Default model</CardTitle>
          <CardDescription className="text-xs mt-1">
            New chats in this project start with this model selected. Per-chat model is
            still switchable in the composer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Label htmlFor="default-model" className="sr-only">Default model</Label>
            <select
              id="default-model"
              value={defaultModel}
              onChange={(e) => {
                setDefaultModel(e.target.value)
                saveIfChanged('defaultModel', e.target.value)
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            >
              <option value="">(use account default)</option>
              {modelsData?.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.provider}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Conversations list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="size-4 text-muted-foreground" />
                Conversations
                <span className="text-xs text-muted-foreground font-normal">
                  ({conversations.length})
                </span>
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Chats that belong to this project. Starred rows are pinned.
              </CardDescription>
            </div>
            <Button onClick={startChatInProject} size="sm" variant="outline">
              <Plus className="size-3.5 mr-1.5" />
              New chat
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {conversations.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No conversations yet.{' '}
              <button
                type="button"
                onClick={startChatInProject}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Start the first one
              </button>
              .
            </div>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/dashboard/chat/${c.id}`}
                    className="group flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted"
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
                        <div className="truncate text-[11px] text-muted-foreground">
                          {c.summary}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgo(c.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Danger zone — archive / delete. Delete routes back to chat via
          invalidation handled inside the hook. */}
      <div className="flex justify-end gap-2 pt-4 border-t border-border/40">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={async () => {
            try {
              await apiClient.post(`/api/projects/${id}/archive`, {})
              queryClient.invalidateQueries({ queryKey: ['projects'] })
              navigate('/dashboard/chat')
            } catch (err) {
              // No toast infrastructure yet — log for now so failures aren't
              // completely silent. When /dev-tools:toast ships, wire it up here.
              console.error('Failed to archive project', err)
              alert('Could not archive project. Check your connection and try again.')
            }
          }}
        >
          <Archive className="size-3.5 mr-1.5" />
          Archive
        </Button>
      </div>
    </div>
  )
}

export default ProjectPage
