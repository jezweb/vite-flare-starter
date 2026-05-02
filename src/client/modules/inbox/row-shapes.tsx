/**
 * Inbox row-shape registry — pluggable renderers per row kind.
 *
 * Inbox rows take many shapes (decisions awaiting approval, findings
 * the AI noticed, digests of bulk activity, future: mentions, action
 * items). Rather than a single fat row component with N conditionals,
 * each shape is a self-contained renderer registered in
 * `ROW_RENDERERS`. The first matching renderer wins; FindingRow is
 * the fallback.
 *
 * Forks add new shapes by editing this file: add a renderer component,
 * a `match` predicate, slot it into `ROW_RENDERERS` before the
 * fallback FindingRow. No InboxPage changes needed — the page calls
 * `resolveRenderer(row)` and dispatches.
 *
 * Shared scaffolding (selection checkbox, ContextMenu with mark
 * read/archive, focus ring, keyboard friendliness) lives in `RowShell`.
 * Renderers compose RowShell and provide icon + meta + trailing slots.
 */
import { type ReactNode, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  Inbox,
  CheckSquare,
  FileText,
  Clock,
  AlertTriangle,
  ChevronRight,
  Check,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  ListRow,
  ListRowIcon,
  ListRowBody,
  ListRowTitle,
  ListRowMeta,
  ListRowTrailing,
} from '@/components/ui/list-row'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'
import { formatAgentClass, formatImportance } from '@/shared/format/agent'
import { useAgentCatalog } from '@/client/modules/routines/hooks/useAgentCatalog'

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export type Importance = 'high' | 'medium' | 'low'

export interface UnifiedRow {
  id: string
  source: 'inbox' | 'approval'
  kind: string
  summary: string
  importance: Importance | null
  agentClass: string | null
  createdAt: number
  dueAt: number | null
  decidedAt: number | null
  readAt: number | null
  status?: string
}

export interface RowRendererProps {
  row: UnifiedRow
  isSelected: boolean
  isFocused: boolean
  selectionMode: boolean
  onToggleSelect: () => void
  onFocusChange: () => void
  onOpenApproval: (id: string) => void
  rowRef: (el: HTMLDivElement | null) => void
}

export interface InboxRowRenderer {
  /** Stable id for the shape; surfaced for tests and devtools. */
  shape: string
  /** First match wins. The last entry must match-everything (fallback). */
  match: (row: UnifiedRow) => boolean
  /** React component that renders the row. */
  render: (props: RowRendererProps) => ReactNode
}

// ───────────────────────────────────────────────────────────────────────
// Shared helpers
// ───────────────────────────────────────────────────────────────────────

/**
 * `kind` is a free-form string the agent set when it called `inbox_add`
 * (e.g. "stale_lead", "stuck_ticket"). Convert snake_case → Title case
 * for display, with friendlier names for the well-known internal kinds.
 */
export function formatKind(kind: string): string {
  if (!kind) return ''
  switch (kind) {
    case 'memory_extraction':
    case 'memory':
      return 'AI memory'
  }
  return kind.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function ImportancePill({ importance }: { importance: Importance }) {
  const map = {
    high: 'bg-destructive/10 text-destructive border-destructive/40',
    medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40',
    low: 'bg-muted text-muted-foreground border-muted-foreground/30',
  } as const
  return (
    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', map[importance])}>
      {formatImportance(importance)}
    </Badge>
  )
}

/**
 * Standard meta line — kind / agent / age / due / status. Renderers
 * can pass a `prefix` to add shape-specific badges on the left
 * (e.g. "Needs approval" for decisions).
 */
function StandardMeta({
  row,
  agentRegistry,
  prefix,
}: {
  row: UnifiedRow
  agentRegistry: Map<string, { displayName: string }>
  prefix?: ReactNode
}) {
  const ageStr = formatDistanceToNow(new Date(row.createdAt * 1000), { addSuffix: true })
  return (
    <ListRowMeta>
      {prefix}
      <span>
        {formatKind(row.kind)}
        {row.agentClass && <> from {formatAgentClass(row.agentClass, agentRegistry)}</>}
      </span>
      <span>·</span>
      <span className="shrink-0">{ageStr}</span>
      {row.dueAt && (
        <>
          <span>·</span>
          <span className="inline-flex items-center gap-1 shrink-0">
            {row.dueAt * 1000 < Date.now() && (
              <AlertTriangle className="size-3 text-amber-500" />
            )}
            <Clock className="size-3" />
            due {formatDistanceToNow(new Date(row.dueAt * 1000), { addSuffix: true })}
          </span>
        </>
      )}
      {row.status && row.status !== 'pending' && (
        <>
          <span>·</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 leading-3 capitalize">
            {row.status}
          </Badge>
        </>
      )}
    </ListRowMeta>
  )
}

interface RowShellProps extends RowRendererProps {
  state: 'unread' | 'urgent' | 'default'
  icon: ReactNode
  meta: ReactNode
  trailing: ReactNode
  /** Called when the user clicks the row body (selection mode is handled internally). */
  onRowClick: () => void
  /** Optional extra ContextMenu items above the standard separator. */
  extraMenuItems?: ReactNode
}

/**
 * Shared scaffolding for built-in renderers — ContextMenu wrapping a
 * ListRow with selection checkbox + click distribution + standard menu
 * items (mark read, select, copy id, archive). Renderers provide the
 * icon, meta line, trailing area, and click handler via props.
 */
function RowShell({
  row,
  isSelected,
  isFocused,
  selectionMode,
  onToggleSelect,
  onFocusChange,
  onOpenApproval,
  rowRef,
  state,
  icon,
  meta,
  trailing,
  onRowClick,
  extraMenuItems,
}: RowShellProps) {
  const queryClient = useQueryClient()
  const isUnread = row.source === 'inbox' && row.readAt == null
  const isApproval = row.source === 'approval'

  const toggleRead = useMutation({
    mutationFn: () => apiClient.patch(`/api/inbox/${row.id}`, { read: !!isUnread }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  })

  const archive = useMutation({
    mutationFn: () => apiClient.delete(`/api/inbox/${row.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox'] })
      toast.success('Archived')
    },
  })

  const copyId = () => {
    void navigator.clipboard.writeText(row.id).then(() => {
      toast.success('Row ID copied')
    })
  }

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect()
      return
    }
    onRowClick()
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <ListRow
          ref={rowRef}
          state={state}
          interactive
          className={cn(
            isSelected && 'bg-primary/10 hover:bg-primary/15',
            isFocused && 'ring-2 ring-ring/50 ring-inset',
          )}
          onClick={handleClick}
          onMouseEnter={onFocusChange}
        >
          {/* a11y: the row used to have role="button" + tabIndex={0} alongside a
              focusable Review Link inside, which axe flags as nested-interactive.
              The row stays clickable via pointer (handleClick still fires); for
              keyboard users, selection happens via Checkbox or the j/k/x bulk
              shortcuts handled at the page level. */}
          <div
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect()
            }}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect()}
              onClick={(e) => e.stopPropagation()}
              aria-label={isSelected ? 'Deselect row' : 'Select row'}
            />
          </div>
          <ListRowIcon>{icon}</ListRowIcon>
          <ListRowBody>
            <div className="flex items-center gap-2 min-w-0">
              <ListRowTitle unread={isUnread}>{row.summary}</ListRowTitle>
              {row.importance === 'high' && <ImportancePill importance="high" />}
            </div>
            {meta}
          </ListRowBody>
          <ListRowTrailing>{trailing}</ListRowTrailing>
        </ListRow>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {row.source === 'inbox' && (
          <ContextMenuItem onSelect={() => toggleRead.mutate()}>
            {isUnread ? 'Mark read' : 'Mark unread'}
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={() => onToggleSelect()}>
          {isSelected ? 'Deselect' : 'Select'}
        </ContextMenuItem>
        {isApproval && (
          <ContextMenuItem onSelect={() => onOpenApproval(row.id)}>
            Review approval
          </ContextMenuItem>
        )}
        {extraMenuItems}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={copyId}>Copy row ID</ContextMenuItem>
        {row.source === 'inbox' && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => archive.mutate()}
              disabled={archive.isPending}
            >
              Archive
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * Hook to derive the agent-display Map from the catalog. Each renderer
 * calls this; React Query dedupes the underlying fetch so cost is just
 * the per-call Map construction (cheap).
 */
function useAgentRegistry(): Map<string, { displayName: string }> {
  const { data: agentCatalog } = useAgentCatalog()
  return useMemo(
    () => new Map((agentCatalog?.agents ?? []).map((a) => [a.className, a])),
    [agentCatalog],
  )
}

// ───────────────────────────────────────────────────────────────────────
// Built-in renderers
// ───────────────────────────────────────────────────────────────────────

/**
 * DecisionRow — for approval rows. Adds inline Approve / Reject
 * buttons so low-friction decisions ("save this memory", "approve
 * this tool call") don't require a Sheet round-trip. Tap the row body
 * to open the Sheet for full preview + reasoning when you want it.
 *
 * For non-pending approvals the buttons collapse to a status badge so
 * the row stays informative in the All tab without inviting a re-vote.
 */
function DecisionRow(props: RowRendererProps) {
  const { row, onOpenApproval } = props
  const queryClient = useQueryClient()
  const agentRegistry = useAgentRegistry()

  const isPending = !row.status || row.status === 'pending'
  const isUrgent =
    row.importance === 'high' || (row.dueAt != null && row.dueAt * 1000 < Date.now())

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['inbox'] })
    queryClient.invalidateQueries({ queryKey: ['approvals'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const approve = useMutation({
    mutationFn: () => apiClient.post(`/api/approvals/${row.id}/approve`, {}),
    onSuccess: () => {
      invalidateAll()
      toast.success('Approved')
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const reject = useMutation({
    mutationFn: () => apiClient.post(`/api/approvals/${row.id}/reject`, { reason: '' }),
    onSuccess: () => {
      invalidateAll()
      toast.success('Rejected')
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const busy = approve.isPending || reject.isPending

  const trailing = isPending ? (
    <span className="flex items-center gap-1">
      <Button
        size="sm"
        variant="default"
        className="h-7 px-2"
        onClick={(e) => {
          e.stopPropagation()
          approve.mutate()
        }}
        disabled={busy}
        aria-label="Approve"
        title="Approve"
      >
        <Check className="size-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2"
        onClick={(e) => {
          e.stopPropagation()
          reject.mutate()
        }}
        disabled={busy}
        aria-label="Reject"
        title="Reject"
      >
        <X className="size-3.5" />
      </Button>
      <span className="ml-1 hidden items-center gap-1 text-xs text-muted-foreground transition-colors group-hover/list-row:text-foreground sm:inline-flex">
        Review
        <ChevronRight className="size-3" />
      </span>
    </span>
  ) : (
    <Badge variant="outline" className="text-[10px] capitalize">
      {row.status}
    </Badge>
  )

  return (
    <RowShell
      {...props}
      state={isUrgent ? 'urgent' : 'default'}
      icon={<CheckSquare className="text-amber-500" />}
      meta={
        <StandardMeta
          row={row}
          agentRegistry={agentRegistry}
          prefix={
            <>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 leading-3">
                Needs approval
              </Badge>
              <span>·</span>
            </>
          }
        />
      }
      trailing={trailing}
      onRowClick={() => onOpenApproval(row.id)}
    />
  )
}

/**
 * DigestRow — for inbox rows whose `kind` ends in `_digest`/`-digest`.
 * Shows the row as a content artifact rather than a notification.
 *
 * Currently a visual differentiation only; clicking still toggles read
 * because there's no `/dashboard/digests/:id` route yet. When digest
 * detail lands, replace the click handler with `navigate('/dashboard/digests/' + row.id)`.
 */
function DigestRow(props: RowRendererProps) {
  const { row } = props
  const queryClient = useQueryClient()
  const agentRegistry = useAgentRegistry()
  const isUnread = row.source === 'inbox' && row.readAt == null

  const toggleRead = useMutation({
    mutationFn: () => apiClient.patch(`/api/inbox/${row.id}`, { read: !!isUnread }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  })

  return (
    <RowShell
      {...props}
      state={isUnread ? 'unread' : 'default'}
      icon={<FileText className={cn(isUnread ? 'text-primary' : 'text-muted-foreground')} />}
      meta={<StandardMeta row={row} agentRegistry={agentRegistry} />}
      trailing={
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover/list-row:text-foreground">
          {isUnread ? 'Open digest' : 'Open'}
          <ChevronRight className="size-3" />
        </span>
      }
      onRowClick={() => toggleRead.mutate()}
    />
  )
}

/**
 * FindingRow — fallback shape for inbox rows. The row already gives
 * the user the headline they need; a full detail page doesn't exist
 * yet, so clicking it toggles the read state.
 */
function FindingRow(props: RowRendererProps) {
  const { row } = props
  const queryClient = useQueryClient()
  const agentRegistry = useAgentRegistry()
  const isUnread = row.source === 'inbox' && row.readAt == null
  const isUrgent =
    row.importance === 'high' || (row.dueAt != null && row.dueAt * 1000 < Date.now())

  const toggleRead = useMutation({
    mutationFn: () => apiClient.patch(`/api/inbox/${row.id}`, { read: !!isUnread }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  })

  return (
    <RowShell
      {...props}
      state={isUnread ? 'unread' : isUrgent ? 'urgent' : 'default'}
      icon={<Inbox className={cn(isUnread ? 'text-primary' : 'text-muted-foreground')} />}
      meta={<StandardMeta row={row} agentRegistry={agentRegistry} />}
      trailing={
        <span className="text-[10px] text-muted-foreground/0 transition-colors group-hover/list-row:text-muted-foreground">
          {isUnread ? 'Mark read' : 'Mark unread'}
        </span>
      }
      onRowClick={() => toggleRead.mutate()}
    />
  )
}

// ───────────────────────────────────────────────────────────────────────
// Registry
// ───────────────────────────────────────────────────────────────────────

const isDigestKind = (kind: string) => /[_-]digest$/i.test(kind)

/**
 * Order matters — first match wins. Append new built-ins **before**
 * the FindingRow fallback. Forks add new shapes by editing this list
 * (or forking this file entirely).
 */
export const ROW_RENDERERS: InboxRowRenderer[] = [
  {
    shape: 'decision',
    match: (r) => r.source === 'approval',
    render: DecisionRow,
  },
  {
    shape: 'digest',
    match: (r) => r.source === 'inbox' && isDigestKind(r.kind),
    render: DigestRow,
  },
  {
    shape: 'finding',
    match: () => true, // fallback — must be last
    render: FindingRow,
  },
]

export function resolveRenderer(row: UnifiedRow): InboxRowRenderer {
  for (const r of ROW_RENDERERS) {
    if (r.match(row)) return r
  }
  // Unreachable — FindingRow matches everything — but satisfies TS.
  return ROW_RENDERERS[ROW_RENDERERS.length - 1]!
}
