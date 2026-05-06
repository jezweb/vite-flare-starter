/**
 * KnowledgeDetailPage — create or edit one knowledge document.
 *
 * Path: /dashboard/knowledge/new       — create form
 *       /dashboard/knowledge/:id       — edit form
 *
 * Knowledge docs are user-owned data (no bundled defaults), so saves go
 * direct via PATCH/POST without the config-diff staging that skills use.
 *
 * Body cap: 100KB soft (warning), 256KB hard (server rejects). Estimated
 * token count refreshes as you type (≈ length / 4).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSession } from '@/client/lib/auth'
import { toast } from 'sonner'
import {
  useCreateKnowledge,
  useDeleteKnowledge,
  useKnowledge,
  useUpdateKnowledge,
  type InjectionMode,
  type KnowledgeFormat,
  type KnowledgeScope,
} from '../hooks/useKnowledge'

const SOFT_CAP = 100 * 1024
const HARD_CAP = 256 * 1024

const MODE_OPTIONS: { value: InjectionMode; label: string; description: string }[] = [
  {
    value: 'on_demand',
    label: 'On demand',
    description: 'Title + summary appear in catalog; agent loads body when relevant.',
  },
  {
    value: 'always',
    label: 'Always active',
    description: 'Body baked into every chat\'s system prompt. Spends tokens every turn.',
  },
  {
    value: 'disabled',
    label: 'Disabled',
    description: 'Stored but never injected. Use to park a draft.',
  },
]

const FORMAT_OPTIONS: { value: KnowledgeFormat; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'text', label: 'Plain text' },
  { value: 'json', label: 'JSON' },
]

export function KnowledgeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: session } = useSession()
  const userId = session?.user?.id ?? ''

  const isNew = id === 'new'
  const detail = useKnowledge(isNew ? null : id)

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [format, setFormat] = useState<KnowledgeFormat>('markdown')
  const [injectionMode, setInjectionMode] = useState<InjectionMode>('on_demand')
  const [scope] = useState<KnowledgeScope>('user') // project/org pickers deferred
  const [tagInput, setTagInput] = useState('')

  const create = useCreateKnowledge()
  const update = useUpdateKnowledge()
  const remove = useDeleteKnowledge()

  // Snapshot of the loaded server state — used to derive `isDirty` so we
  // don't enable Save (or fire a redundant PATCH) when the user has made
  // no changes. Reset whenever fresh server data arrives.
  const [originalSnapshot, setOriginalSnapshot] = useState<{
    title: string
    summary: string
    body: string
    format: KnowledgeFormat
    injectionMode: InjectionMode
    tags: string
  } | null>(null)

  // Hydrate form from server data once loaded
  useEffect(() => {
    if (!detail.data?.knowledge) return
    const k = detail.data.knowledge
    // The detail endpoint always returns body; the list endpoint omits it
    // by default. Coalesce to empty string defensively.
    const detailBody = k.body ?? ''
    setTitle(k.title)
    setSummary(k.summary)
    setBody(detailBody)
    setFormat(k.format)
    setInjectionMode(k.injectionMode)
    setTagInput(k.tags.join(', '))
    setOriginalSnapshot({
      title: k.title,
      summary: k.summary,
      body: detailBody,
      format: k.format,
      injectionMode: k.injectionMode,
      tags: k.tags.join(', '),
    })
  }, [detail.data?.knowledge])

  const tags = useMemo(
    () =>
      tagInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [tagInput],
  )

  const estimatedTokens = useMemo(() => Math.ceil(body.length / 4), [body])
  const overSoftCap = body.length > SOFT_CAP
  const overHardCap = body.length > HARD_CAP

  // Dirty check — for new docs, anything-non-empty is dirty; for edits,
  // we compare against the original snapshot. Tag comparison uses the
  // raw input string so trailing-comma whitespace isn't treated as an
  // edit.
  const isDirty = isNew
    ? title.trim().length > 0 ||
      summary.trim().length > 0 ||
      body.length > 0 ||
      tagInput.trim().length > 0
    : originalSnapshot
    ? title !== originalSnapshot.title ||
      summary !== originalSnapshot.summary ||
      body !== originalSnapshot.body ||
      format !== originalSnapshot.format ||
      injectionMode !== originalSnapshot.injectionMode ||
      tagInput !== originalSnapshot.tags
    : false

  const canSave =
    title.trim().length > 0 &&
    summary.trim().length > 0 &&
    body.length > 0 &&
    !overHardCap &&
    isDirty &&
    !create.isPending &&
    !update.isPending

  const handleSave = async () => {
    if (!canSave) return
    try {
      if (isNew) {
        const res = await create.mutateAsync({
          scope,
          scopeId: userId,
          title: title.trim(),
          summary: summary.trim(),
          body,
          format,
          injectionMode,
          tags,
        })
        toast.success('Knowledge doc created')
        navigate(`/dashboard/knowledge/${res.knowledge.id}`)
      } else if (id) {
        await update.mutateAsync({
          id,
          body: {
            title: title.trim(),
            summary: summary.trim(),
            body,
            format,
            injectionMode,
            tags,
          },
        })
        // Reset snapshot to current saved state so isDirty flips back to false.
        setOriginalSnapshot({
          title: title.trim(),
          summary: summary.trim(),
          body,
          format,
          injectionMode,
          tags: tagInput,
        })
        toast.success('Knowledge doc saved')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  const handleDelete = async () => {
    if (!id || isNew) return
    if (!confirm('Delete this knowledge doc? This cannot be undone.')) return
    try {
      await remove.mutateAsync(id)
      toast.success('Knowledge doc deleted')
      navigate('/dashboard/knowledge')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  if (!isNew && detail.isLoading) {
    return (
      <PageContainer type="detail">
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
        </div>
      </PageContainer>
    )
  }

  if (!isNew && detail.isError) {
    return (
      <PageContainer type="detail">
        <p className="text-sm text-destructive">
          Failed to load: {(detail.error as Error).message}
        </p>
      </PageContainer>
    )
  }

  return (
    <PageContainer type="detail">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/dashboard/knowledge')}
        className="-ml-2 self-start"
      >
        <ArrowLeft className="mr-2 size-4" /> Back to Knowledge
      </Button>
      <PageHeader
        title={isNew ? 'New knowledge doc' : title || 'Edit knowledge'}
        trailing={
          <>
            {!isNew && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={remove.isPending}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-2 size-4" /> Delete
              </Button>
            )}
            <Button onClick={handleSave} disabled={!canSave}>
              {create.isPending || update.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              {isNew ? 'Create' : 'Save'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* Left column — main content */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Database schema reference"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">Summary</Label>
            <Input
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One-liner: when should the agent reference this?"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              Shown in the catalog so the agent knows when to load this doc.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="body">Body</Label>
              <span
                className={`text-xs tabular-nums ${
                  overHardCap
                    ? 'text-destructive'
                    : overSoftCap
                    ? 'text-amber-500'
                    : 'text-muted-foreground'
                }`}
              >
                {body.length.toLocaleString()} chars · ~
                {estimatedTokens.toLocaleString()} tokens
                {overSoftCap && ` · over ${(SOFT_CAP / 1024).toFixed(0)}KB soft cap`}
                {overHardCap && ` · over ${(HARD_CAP / 1024).toFixed(0)}KB HARD cap`}
              </span>
            </div>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="The reference content. Markdown by default — use headings, lists, code blocks."
              rows={24}
              className="font-mono text-xs md:text-xs"
            />
            {overHardCap && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Server will reject saves over the hard cap. Trim or split the doc.
              </div>
            )}
          </div>
        </div>

        {/* Right column — settings */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="space-y-2">
                <Label>Injection mode</Label>
                <Select
                  value={injectionMode}
                  onValueChange={(v) => setInjectionMode(v as InjectionMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {MODE_OPTIONS.find((o) => o.value === injectionMode)?.description}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Format</Label>
                <Select
                  value={format}
                  onValueChange={(v) => setFormat(v as KnowledgeFormat)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="e.g. schema, glossary, runbook"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated.
                </p>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <strong className="font-medium text-foreground">Scope:</strong>{' '}
                Personal (your user). Project + org scopes coming soon.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}

export default KnowledgeDetailPage
