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
import { toast } from 'sonner'

// Lazy-loaded CodeMirror editor — ~100KB gzipped. Only pays its bundle
// cost when the Source tab on a skill detail pane actually renders.
const MarkdownCodeEditor = lazy(() =>
  import('./MarkdownCodeEditor').then((m) => ({ default: m.MarkdownCodeEditor })),
)
import { Link } from 'react-router-dom'
import {
  Check,
  Code2,
  Eye,
  History,
  MessageSquare,
  Save,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
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
import { useBeforeUnload } from '@/client/hooks/useBeforeUnload'
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
 * Strip a leading `# Title` line from the markdown body so the rendered
 * Overview doesn't duplicate the page header. Most SKILL.md files start
 * with the skill name as h1; the page already shows it in the
 * `<PageHeader>` so re-rendering it inside the procedure card is noise.
 *
 * Only strips ONE leading h1. Subsequent h1s (rare in skills, but
 * possible in long procedures) survive intact.
 */
function stripLeadingH1(body: string): string {
  return body.replace(/^\s*#[^#].*\n+/, '')
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
  // Default tab is Overview — what the skill does + how to use it.
  // Source is second tab for builders editing the SKILL.md body.
  const [tab, setTab] = useState('overview')
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
  // P4-002 — fire the browser leave-prompt while the user has unsaved
  // CodeMirror edits. In-app sidebar navigation doesn't trigger this
  // event, but the visible "Unsaved changes" affordance below the
  // editor + the modal save flow already carry the in-app case.
  useBeforeUnload(isDirty)
  // `isPersonal` means the caller owns this row (not the shared bundled
  // default). `isBundled` is used for the render of the source badge.
  const isPersonal = skill?.isPersonal === true
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
    try {
      await approve.mutateAsync(proposal.id)
      setPendingProposal(null)
      // Reset draft to match the new canonical on next render — useEffect
      // re-seeds once the skill query refetches.
      lastLoadedName.current = null
      toast.success('Skill updated')
    } catch (err) {
      // Keep the modal open so the user can retry. Surface the actual
      // server error (race 409, revert failure, D1 hiccup).
      toast.error('Approve failed', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleReject = async (proposal: ConfigDiffProposal) => {
    try {
      await reject.mutateAsync(proposal.id)
      setPendingProposal(null)
    } catch (err) {
      toast.error('Reject failed', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
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
            {isPersonal ? (
              <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400">
                Personal override
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400">
                Bundled — edits create a personal override
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {skill.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Popover
            open={sparkleOpen}
            onOpenChange={(open) => {
              setSparkleOpen(open)
              // Clear stale error + instruction when the popover is
              // dismissed — otherwise the next open still shows the
              // previous failure. Keep instruction on open for a
              // successful re-submit scenario.
              if (!open) {
                setSparkleError(null)
                setSparkleInstruction('')
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                AI Sparkle
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-3">
                <Field>
                  <FieldLabel htmlFor="sparkle-instruction" className="text-xs font-medium">
                    What should the AI change?
                  </FieldLabel>
                  <Textarea
                    id="sparkle-instruction"
                    value={sparkleInstruction}
                    onChange={(e) => setSparkleInstruction(e.target.value)}
                    placeholder="e.g. Make it shorter. Add an Australian context note. Rewrite for a senior engineer audience."
                    rows={4}
                    maxLength={2000}
                    className="text-sm"
                  />
                  {sparkleError ? <FieldError>{sparkleError}</FieldError> : null}
                </Field>
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
          {isDirty ? (
            <Button
              size="sm"
              onClick={submitSave}
              disabled={createProposal.isPending}
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              {createProposal.isPending ? 'Preparing…' : 'Save changes'}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled className="cursor-default opacity-100">
              <Check className="mr-1 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Saved
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="p-4">
        <TabsList>
          <TabsTrigger value="overview">
            <Eye className="mr-1 h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="source">
            <Code2 className="mr-1 h-3.5 w-3.5" />
            Source
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

        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* What the skill does — full description, not the truncated
              header version. Plain language for non-builders. */}
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              What this skill does
            </h3>
            <p className="text-sm">{skill.description || 'No description provided.'}</p>
          </div>

          {/* How to invoke — claude.ai / Claude Code convention is
              `/skill-name`. The chat agent's system prompt includes
              skill metadata so the LLM knows when to load + apply. */}
          <div className="rounded-md border bg-muted/20 p-3">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              How to use it
            </h3>
            <p className="text-sm">
              Type{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                /{skill.name}
              </code>{' '}
              in chat to invoke this skill. The AI will load the procedure
              below and follow it for that turn.
            </p>
            <div className="mt-3">
              <Button asChild size="sm">
                <Link to="/dashboard/chat?new=1">
                  <MessageSquare className="mr-1 h-3.5 w-3.5" />
                  Open chat
                </Link>
              </Button>
            </div>
          </div>

          {/* The skill procedure rendered as readable markdown — what the
              AI actually loads when invoked. Not the source editor; this
              is the "what does this do" view. Strip a leading `# Title`
              line so it doesn't duplicate the page header. */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Procedure
            </h3>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{stripLeadingH1(split.body)}</ReactMarkdown>
            </div>
          </div>
        </TabsContent>

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
              <span className="text-amber-700 dark:text-amber-400">Unsaved changes</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                Up to date
              </span>
            )}
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
