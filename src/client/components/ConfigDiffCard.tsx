/**
 * ConfigDiffCard — shared renderer for a staged ConfigDiffProposal.
 *
 * Used by:
 *  - Skills editor (Save + AI-sparkle flows)
 *  - Chat agent's `propose_patch` tool renderer
 *
 * Renders a line-level diff with +/- Tailwind colouring, plus Approve
 * and Reject buttons when status === 'pending'. Read-only once applied
 * or rejected.
 *
 * Line diff via the `diff` npm package (Myers). Word-level can be added
 * later if line-only feels too coarse.
 */
import { diffLines } from 'diff'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Check, ChevronDown, ChevronUp, FileDiff, Sparkles, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ConfigDiffProposal } from '@/shared/config/diff-proposal'

export interface ConfigDiffCardProps {
  proposal: ConfigDiffProposal
  /** Called when user clicks Approve. Parent handles the API call. */
  onApprove?: (proposal: ConfigDiffProposal) => void | Promise<void>
  /** Called when user clicks Reject. Parent handles the API call. */
  onReject?: (proposal: ConfigDiffProposal) => void | Promise<void>
  /** Hide the Approve/Reject buttons (e.g. when shown read-only in chat). */
  readOnly?: boolean
  /** Compact mode — smaller padding, collapsed reason by default. */
  compact?: boolean
  /** Disable buttons while the parent's apply/reject request is in flight. */
  busy?: boolean
  className?: string
}

interface DiffRow {
  type: 'context' | 'added' | 'removed'
  lines: string[]
}

function buildDiffRows(before: string, after: string): DiffRow[] {
  const parts = diffLines(before, after)
  return parts.map((p) => ({
    type: p.added ? 'added' : p.removed ? 'removed' : 'context',
    lines: p.value.replace(/\n$/, '').split('\n'),
  }))
}

function kindLabel(kind: ConfigDiffProposal['resource']['kind']): string {
  switch (kind) {
    case 'skill':
      return 'Skill'
    case 'system-prompt':
      return 'System prompt'
    case 'setting':
      return 'Setting'
    case 'connector-tool-policy':
      return 'Connector policy'
  }
}

function creatorIcon(type: ConfigDiffProposal['createdBy']['type']) {
  switch (type) {
    case 'user':
      return User
    case 'ai-sparkle':
      return Sparkles
    case 'agent':
      return FileDiff
  }
}

function creatorLabel(type: ConfigDiffProposal['createdBy']['type']): string {
  switch (type) {
    case 'user':
      return 'You'
    case 'ai-sparkle':
      return 'AI rewrite'
    case 'agent':
      return 'Agent proposal'
  }
}

export function ConfigDiffCard({
  proposal,
  onApprove,
  onReject,
  readOnly,
  compact,
  busy,
  className,
}: ConfigDiffCardProps) {
  const [showReason, setShowReason] = useState(!compact)
  const [expanded, setExpanded] = useState(true)
  const rows = useMemo(
    () => buildDiffRows(proposal.before, proposal.after),
    [proposal.before, proposal.after],
  )

  const addedCount = rows
    .filter((r) => r.type === 'added')
    .reduce((acc, r) => acc + r.lines.length, 0)
  const removedCount = rows
    .filter((r) => r.type === 'removed')
    .reduce((acc, r) => acc + r.lines.length, 0)

  const isPending = proposal.status === 'pending'
  const CreatorIcon = creatorIcon(proposal.createdBy.type)

  return (
    <div
      className={cn(
        'rounded-lg border bg-card text-card-foreground shadow-sm',
        className,
      )}
      data-testid="config-diff-card"
    >
      <div
        className={cn(
          'flex flex-wrap items-start gap-2 border-b p-3',
          compact && 'p-2',
        )}
      >
        <Badge variant="outline" className="gap-1 font-mono text-[10px]">
          <FileDiff className="h-3 w-3" />
          {kindLabel(proposal.resource.kind)}
        </Badge>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {proposal.resource.label}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {proposal.summary}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CreatorIcon className="h-3 w-3" />
            {creatorLabel(proposal.createdBy.type)}
          </span>
          <span className="tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">
              +{addedCount}
            </span>
            {' '}
            <span className="text-red-600 dark:text-red-400">
              −{removedCount}
            </span>
          </span>
          {proposal.status !== 'pending' ? (
            <Badge
              variant={proposal.status === 'applied' ? 'default' : 'secondary'}
              className="text-[10px]"
            >
              {proposal.status}
            </Badge>
          ) : null}
        </div>
      </div>

      {proposal.reason ? (
        <div className="border-b">
          <button
            type="button"
            onClick={() => setShowReason((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
          >
            <span>Rationale</span>
            {showReason ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {showReason ? (
            <div className="prose prose-sm dark:prose-invert max-w-none px-3 pb-3 text-sm">
              <ReactMarkdown>{proposal.reason}</ReactMarkdown>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="border-b">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
        >
          <span>Diff</span>
          {expanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
        {expanded ? (
          <div className="max-h-96 overflow-auto bg-muted/20 font-mono text-[11px] leading-relaxed">
            {rows.map((row, rIdx) =>
              row.lines.map((line, lIdx) => (
                <div
                  key={`${rIdx}-${lIdx}`}
                  className={cn(
                    'flex items-start gap-2 whitespace-pre-wrap break-words px-3 py-0.5',
                    row.type === 'added' &&
                      'bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
                    row.type === 'removed' &&
                      'bg-red-500/10 text-red-900 dark:text-red-200',
                  )}
                >
                  <span
                    className={cn(
                      'w-3 select-none',
                      row.type === 'added' && 'text-emerald-600 dark:text-emerald-400',
                      row.type === 'removed' && 'text-red-600 dark:text-red-400',
                      row.type === 'context' && 'text-muted-foreground',
                    )}
                  >
                    {row.type === 'added'
                      ? '+'
                      : row.type === 'removed'
                        ? '−'
                        : ' '}
                  </span>
                  <span className="flex-1">{line === '' ? ' ' : line}</span>
                </div>
              )),
            )}
          </div>
        ) : null}
      </div>

      {!readOnly && isPending ? (
        <div className="flex items-center justify-end gap-2 p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReject?.(proposal)}
            disabled={busy}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Reject
          </Button>
          <Button
            size="sm"
            onClick={() => onApprove?.(proposal)}
            disabled={busy}
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            {busy ? 'Applying…' : 'Approve'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
