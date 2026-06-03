/**
 * MemorySection — project Memory panel.
 *
 * Phase 3 v1: list, expand, add, delete, toggle privacy.
 * Auto-job + 3-way trust approval defer to follow-up.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Plus,
  Lock,
  Brain,
  ChevronDown,
  ChevronRight,
  Trash2,
  PencilLine,
  ArrowUpRight,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { apiClient } from '@/client/lib/api-client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const MEMORY_TYPES = ['fact', 'preference', 'decision', 'context', 'reference'] as const
type MemoryType = (typeof MEMORY_TYPES)[number]

interface Memory {
  id: string
  scope: 'project' | 'user' | 'org'
  scopeId: string
  name: string
  description: string
  type: MemoryType
  content: string
  isPrivate: number
  sourceConversationId: string | null
  createdAt: string | null
  updatedAt: string | null
}

interface MemoriesResponse {
  memories: Memory[]
}

export function MemorySection({
  scope,
  scopeId,
  emptyHint,
  privacyLabel,
  mode,
  onModeChange,
}: {
  scope: 'project' | 'user' | 'org'
  scopeId: string
  emptyHint?: string
  privacyLabel?: string
  /** Optional 3-way memoryUpdateMode — when present, renders a header dropdown. */
  mode?: 'ask' | 'auto' | 'never'
  onModeChange?: (next: 'ask' | 'auto' | 'never') => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Memory | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['memories', scope, scopeId],
    queryFn: () =>
      apiClient.get<MemoriesResponse>(
        `/api/memories?scope=${scope}&scopeId=${encodeURIComponent(scopeId)}`
      ),
    enabled: !!scopeId,
  })

  const createMemory = useMutation({
    mutationFn: (input: {
      name: string
      description: string
      type: MemoryType
      content: string
      isPrivate: boolean
    }) =>
      apiClient.post<{ id: string; success: boolean }>('/api/memories', {
        scope,
        scopeId,
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories', scope, scopeId] })
      toast.success('Memory added')
      setAddOpen(false)
    },
    onError: () => toast.error('Could not add memory'),
  })

  const updateMemory = useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string
      name?: string
      description?: string
      type?: MemoryType
      content?: string
      isPrivate?: boolean
    }) => apiClient.patch<{ success: boolean }>(`/api/memories/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories', scope, scopeId] })
      toast.success('Memory updated')
      setEditing(null)
    },
    onError: () => toast.error('Could not update memory'),
  })

  const deleteMemory = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/memories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories', scope, scopeId] })
      toast.success('Memory removed')
      setDeleteTarget(null)
    },
    onError: () => toast.error('Could not remove memory'),
  })

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const memoriesList = data?.memories ?? []

  return (
    <>
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Memory</h3>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3" />
              {privacyLabel ?? 'Only you'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setAddOpen(true)}
              aria-label="Add memory"
              title="Add memory"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
        {mode && onModeChange && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-dashed border-border/70 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
            <span title="What happens when the AI proposes new memories from your chats">
              When the AI suggests memory updates:
            </span>
            <select
              value={mode}
              onChange={(e) => onModeChange(e.target.value as 'ask' | 'auto' | 'never')}
              aria-label="Memory update behaviour"
              className="rounded-sm border border-input bg-background px-1.5 py-0.5 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            >
              <option value="ask">Ask me first</option>
              <option value="auto">Apply automatically</option>
              <option value="never">Never auto-update</option>
            </select>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Spinner size="md" className="mr-2" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : memoriesList.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {emptyHint ??
              "Things the AI learns about this project — names, preferences, decisions — show up here. They get pulled into every chat in this project so you don't have to repeat yourself."}
          </p>
        ) : (
          <ul className="space-y-2">
            {memoriesList.map((m) => {
              const expanded = expandedIds.has(m.id)
              return (
                <li key={m.id} className="group">
                  <button
                    type="button"
                    onClick={() => toggleExpand(m.id)}
                    className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors text-left"
                  >
                    {expanded ? (
                      <ChevronDown className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{m.name}</span>
                        {m.isPrivate === 1 && (
                          <span title="Private — never auto-injected">
                            <Lock className="size-3 text-amber-600 shrink-0" aria-label="Private" />
                          </span>
                        )}
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground rounded-full bg-muted px-1.5 py-0.5">
                          {m.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                        {m.description}
                      </p>
                    </div>
                  </button>
                  {expanded && (
                    <div className="ml-5 mt-1 mb-2 rounded-md border bg-muted/20 p-3 space-y-2">
                      <div className="text-xs whitespace-pre-wrap">{m.content}</div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border/50">
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <span>
                            Updated{' '}
                            {m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : 'recently'}
                          </span>
                          {m.sourceConversationId && (
                            <>
                              <span aria-hidden>·</span>
                              <Link
                                to={`/dashboard/chat/${m.sourceConversationId}`}
                                className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2 hover:text-foreground"
                                title="Open the conversation that produced this memory"
                              >
                                from chat
                                <ArrowUpRight className="size-2.5" />
                              </Link>
                            </>
                          )}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing(m)}
                            className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Edit"
                            aria-label={`Edit ${m.name}`}
                          >
                            <PencilLine className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(m)}
                            className="rounded p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            title="Delete"
                            aria-label={`Delete ${m.name}`}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <MemoryEditorModal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add memory"
        onSave={(input) => createMemory.mutate(input)}
        isPending={createMemory.isPending}
      />

      <MemoryEditorModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit memory"
        initial={editing ?? undefined}
        onSave={(input) => {
          if (editing) updateMemory.mutate({ id: editing.id, ...input })
        }}
        isPending={updateMemory.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This memory will be permanently removed."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) deleteMemory.mutate(deleteTarget.id)
        }}
      />
    </>
  )
}

function MemoryEditorModal({
  open,
  onOpenChange,
  title,
  initial,
  onSave,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial?: {
    name: string
    description: string
    type: MemoryType
    content: string
    isPrivate: number
  }
  onSave: (input: {
    name: string
    description: string
    type: MemoryType
    content: string
    isPrivate: boolean
  }) => void
  isPending: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [type, setType] = useState<MemoryType>(initial?.type ?? 'context')
  const [content, setContent] = useState(initial?.content ?? '')
  const [isPrivate, setIsPrivate] = useState(initial?.isPrivate === 1)

  // Re-seed when modal opens with new initial
  useState(() => {
    if (open) {
      setName(initial?.name ?? '')
      setDescription(initial?.description ?? '')
      setType(initial?.type ?? 'context')
      setContent(initial?.content ?? '')
      setIsPrivate(initial?.isPrivate === 1)
    }
  })

  const reset = () => {
    setName(initial?.name ?? '')
    setDescription(initial?.description ?? '')
    setType(initial?.type ?? 'context')
    setContent(initial?.content ?? '')
    setIsPrivate(initial?.isPrivate === 1)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !description.trim() || !content.trim()) return
    onSave({
      name: name.trim(),
      description: description.trim(),
      type,
      content: content.trim(),
      isPrivate,
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Memory entries are injected into the system prompt overview. Use the privacy switch for
            sensitive info that should only be loaded on demand.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field className="col-span-2">
              <FieldLabel htmlFor="memory-name">Name (slug)</FieldLabel>
              <Input
                id="memory-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. preferred-tone"
                maxLength={80}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="memory-type">Type</FieldLabel>
              <select
                id="memory-type"
                value={type}
                onChange={(e) => setType(e.target.value as MemoryType)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
              >
                {MEMORY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="memory-description">One-line description</FieldLabel>
            <Input
              id="memory-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shows in the memory index injected into chats"
              maxLength={200}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="memory-content">Content</FieldLabel>
            <Textarea
              id="memory-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="The full memory body. Be specific."
              rows={6}
              maxLength={8000}
              required
              className="font-mono text-xs md:text-xs"
            />
            <div className="text-[10px] text-muted-foreground text-right tabular-nums">
              {content.length}/8000
            </div>
          </Field>
          <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-start gap-2">
              <Lock
                className={cn(
                  'size-4 mt-0.5',
                  isPrivate ? 'text-amber-600' : 'text-muted-foreground'
                )}
              />
              <div>
                <Label htmlFor="memory-private" className="cursor-pointer">
                  Private
                </Label>
                <FieldDescription className="text-xs">
                  Never auto-injected. Available only via explicit load_memory tool.
                </FieldDescription>
              </div>
            </div>
            <Switch id="memory-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !description.trim() || !content.trim() || isPending}
            >
              {isPending ? (
                <Spinner size="sm" className="mr-1.5" />
              ) : (
                <Brain className="size-3.5 mr-1.5" />
              )}
              Save memory
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
