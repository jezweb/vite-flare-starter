/**
 * SkillEditor — detail pane rendered to the right of the skills list.
 *
 * Three tabs:
 *  - Source   — raw SKILL.md Textarea (editable)
 *  - Preview  — metadata + ReactMarkdown of the body
 *  - History  — list of prior config-diff proposals for this skill
 *
 * Save flow: user types into Source → clicks Save → a ConfigDiffProposal
 * is created with before = live state, after = textarea value → a
 * ConfigDiffCard renders in a modal → user approves → backend flips
 * source→r2 and writes R2 body.
 *
 * AI Sparkle: popover with an instruction prompt → POST /skills/:name/ai-edit
 * → returns a ConfigDiffProposal (pending, ai-sparkle origin) → same
 * approval modal. Implemented in Phase 2 — the button is wired here.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

// Lazy-loaded CodeMirror editor — ~100KB gzipped. Only pays its bundle
// cost when the Source tab on a skill detail pane actually renders.
const MarkdownCodeEditor = lazy(() =>
  import('./MarkdownCodeEditor').then((m) => ({ default: m.MarkdownCodeEditor })),
)
import {
  Check,
  Code2,
  Eye,
  FileText,
  History,
  Save,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ConfigDiffCard } from '@/client/components/ConfigDiffCard'
import {
  useAiEditSkill,
  useApproveProposal,
  useCreateProposal,
  useProposalsForResource,
  useRejectProposal,
} from '../hooks/useConfigDiff'
import { useSkill } from '../hooks/useSkills'
import type { ConfigDiffProposal } from '@/shared/config/diff-proposal'

interface SkillEditorProps {
  name: string
}

/**
 * Rebuild the canonical SKILL.md text from the parsed frontmatter + body —
 * matches the server's `loadCurrentContent` for skill kind, so the
 * `before` captured at proposal creation time is byte-identical to what
 * the user sees in the textarea before editing. Avoids spurious diffs.
 */
function rebuildSkillSource(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const fmLines: string[] = ['---']
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === 'string') {
      fmLines.push(`${key}: ${value}`)
    } else {
      fmLines.push(`${key}: ${JSON.stringify(value)}`)
    }
  }
  fmLines.push('---')
  return `${fmLines.join('\n')}\n\n${body.trim()}\n`
}

/** Split frontmatter/body for the Preview tab display. */
function splitBody(source: string): {
  frontmatter: Record<string, string>
  body: string
} {
  const match = source.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: source }
  const [, fmBlock = '', bodyBlock = ''] = match
  const fm: Record<string, string> = {}
  for (const line of fmBlock.split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    fm[key] = value
  }
  return { frontmatter: fm, body: bodyBlock }
}

export function SkillEditor({ name }: SkillEditorProps) {
  const { data: skill, isLoading } = useSkill(name)
  const canonical = useMemo(() => {
    if (!skill) return ''
    return rebuildSkillSource(skill.frontmatter, skill.body)
  }, [skill])

  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState('source')
  const [pendingProposal, setPendingProposal] = useState<ConfigDiffProposal | null>(null)
  const [sparkleOpen, setSparkleOpen] = useState(false)
  const [sparkleInstruction, setSparkleInstruction] = useState('')
  const [sparkleError, setSparkleError] = useState<string | null>(null)
  const lastLoadedName = useRef<string | null>(null)

  // When the selected skill changes, seed the draft from canonical source.
  useEffect(() => {
    if (!canonical) return
    if (lastLoadedName.current !== name) {
      setDraft(canonical)
      lastLoadedName.current = name
    }
  }, [canonical, name])

  const createProposal = useCreateProposal()
  const aiEdit = useAiEditSkill(name)
  const approve = useApproveProposal()
  const reject = useRejectProposal()
  const history = useProposalsForResource('skill', name)

  const isDirty = draft !== canonical && draft.trim().length > 0
  const isBundled = skill?.source === 'bundled'

  const submitSave = async () => {
    if (!isDirty || !skill) return
    const result = await createProposal.mutateAsync({
      resource: { kind: 'skill', id: name, label: `/${name}` },
      after: draft,
      summary: `Edit /${name} via skills editor`,
      reason: null,
      format: 'markdown',
    })
    setPendingProposal(result.proposal)
  }

  const submitSparkle = async () => {
    setSparkleError(null)
    if (!sparkleInstruction.trim()) return
    try {
      const result = await aiEdit.mutateAsync({ instruction: sparkleInstruction.trim() })
      setPendingProposal(result.proposal)
      setSparkleOpen(false)
      setSparkleInstruction('')
    } catch (err) {
      setSparkleError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleApprove = async (proposal: ConfigDiffProposal) => {
    await approve.mutateAsync(proposal.id)
    setPendingProposal(null)
    // Reset draft to match the new canonical on next render — useEffect will
    // re-seed once the skill query refetches.
    lastLoadedName.current = null
  }

  const handleReject = async (proposal: ConfigDiffProposal) => {
    await reject.mutateAsync(proposal.id)
    setPendingProposal(null)
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-32 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (!skill) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-sm text-muted-foreground">
        Skill not found.
      </div>
    )
  }

  const split = splitBody(draft || canonical)

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold">/{skill.name}</h2>
            <Badge variant={isBundled ? 'secondary' : 'outline'} className="text-[10px]">
              {skill.source}
            </Badge>
            {isBundled ? (
              <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                Bundled — edits create a personal override
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {skill.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Popover open={sparkleOpen} onOpenChange={setSparkleOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                AI Sparkle
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="sparkle-instruction" className="text-xs font-medium">
                    What should the AI change?
                  </Label>
                  <Textarea
                    id="sparkle-instruction"
                    value={sparkleInstruction}
                    onChange={(e) => setSparkleInstruction(e.target.value)}
                    placeholder="e.g. Make it shorter. Add an Australian context note. Rewrite for a senior engineer audience."
                    rows={4}
                    className="mt-1 text-sm"
                  />
                  {sparkleError ? (
                    <p className="mt-1 text-xs text-destructive">{sparkleError}</p>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSparkleOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={submitSparkle}
                    disabled={aiEdit.isPending || !sparkleInstruction.trim()}
                  >
                    {aiEdit.isPending ? 'Drafting…' : 'Rewrite'}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            size="sm"
            onClick={submitSave}
            disabled={!isDirty || createProposal.isPending}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            {createProposal.isPending ? 'Preparing…' : 'Save'}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="p-4">
        <TabsList>
          <TabsTrigger value="source">
            <Code2 className="mr-1 h-3.5 w-3.5" />
            Source
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="mr-1 h-3.5 w-3.5" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-1 h-3.5 w-3.5" />
            History
            {history.data?.count ? (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {history.data.count}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="source" className="mt-4">
          <Suspense
            fallback={
              <div className="min-h-[400px] animate-pulse rounded-md border bg-muted/20" />
            }
          >
            <MarkdownCodeEditor
              value={draft}
              onChange={setDraft}
              minHeight="400px"
              aria-label="Skill SKILL.md source"
            />
          </Suspense>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {draft.length.toLocaleString()} chars · {draft.split('\n').length}{' '}
              lines
            </span>
            {isDirty ? (
              <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                Up to date
              </span>
            )}
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <div className="mb-4 rounded-md border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Frontmatter
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              {Object.entries(split.frontmatter).map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="font-mono text-muted-foreground">{key}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{split.body}</ReactMarkdown>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {history.isLoading ? (
            <div className="h-16 animate-pulse rounded bg-muted" />
          ) : !history.data || history.data.count === 0 ? (
            <p className="text-sm text-muted-foreground">
              No prior changes. Your edits will appear here once approved.
            </p>
          ) : (
            history.data.proposals.map((p) => (
              <ConfigDiffCard
                key={p.id}
                proposal={p}
                readOnly
                compact
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Approval modal — wraps the shared ConfigDiffCard. */}
      <Dialog
        open={pendingProposal !== null}
        onOpenChange={(open) => !open && setPendingProposal(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review change</DialogTitle>
            <DialogDescription>
              Nothing has been applied yet. Review the diff and approve or
              reject.
            </DialogDescription>
          </DialogHeader>
          {pendingProposal ? (
            <ConfigDiffCard
              proposal={pendingProposal}
              onApprove={handleApprove}
              onReject={handleReject}
              busy={approve.isPending || reject.isPending}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
