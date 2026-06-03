/**
 * Shared bits used by built-in row renderers.
 *
 * Each renderer can reach for these or write its own — the registry
 * contract only requires that a renderer takes `RowRendererProps` and
 * returns a ReactNode. RowShell is the convenience layer that owns
 * selection / focus / ContextMenu so most renderers don't have to.
 */
import { type ReactNode, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Clock, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import type { InboxImportance, UnifiedRow } from '@/shared/schemas/inbox.schema'
import type { RowRendererProps } from '../../row-shapes'

/**
 * Items older than this register as "stale" — the age string renders
 * in an amber tint so the user notices items that have been sitting
 * unactioned. Tunable per-fork; 3 days is a reasonable default for
 * weekly-cadence work.
 */
const STALE_THRESHOLD_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Returns true when the row was created more than STALE_THRESHOLD_DAYS
 * ago and is still pending/unread (i.e. it has aged without action).
 * Renderers can use this for additional visual cues beyond the meta
 * line tint StandardMeta applies.
 */
export function isStale(row: UnifiedRow): boolean {
  const ageMs = Date.now() - row.createdAt * 1000
  if (ageMs < STALE_THRESHOLD_DAYS * DAY_MS) return false
  // Decided approvals + read findings aren't "waiting on you" anymore,
  // so they don't need the urgency cue even if old.
  if (row.source === 'approval' && row.status && row.status !== 'pending') return false
  if (row.source === 'inbox' && row.readAt != null) return false
  return true
}

/**
 * `kind` is a free-form string the agent set when it called `inbox_add`
 * (e.g. "stale_lead", "stuck_ticket"). Convert snake_case → Title case
 * for display, with friendlier names for well-known internal kinds.
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

export function ImportancePill({ importance }: { importance: InboxImportance }) {
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
 * pass an optional `prefix` for shape-specific badges (e.g. "Needs
 * approval" on decision rows).
 */
export function StandardMeta({
  row,
  agentRegistry,
  prefix,
}: {
  row: UnifiedRow
  agentRegistry: Map<string, { displayName: string }>
  prefix?: ReactNode
}) {
  const ageStr = formatDistanceToNow(new Date(row.createdAt * 1000), { addSuffix: true })
  const stale = isStale(row)
  return (
    <ListRowMeta>
      {prefix}
      <span>
        {formatKind(row.kind)}
        {row.agentClass && <> from {formatAgentClass(row.agentClass, agentRegistry)}</>}
      </span>
      <span>·</span>
      <span
        className={cn('shrink-0', stale && 'text-amber-700 dark:text-amber-400 font-medium')}
        title={stale ? 'This has been waiting for action — consider reviewing it soon' : undefined}
      >
        {ageStr}
      </span>
      {row.dueAt && (
        <>
          <span>·</span>
          <span className="inline-flex items-center gap-1 shrink-0">
            {row.dueAt * 1000 < Date.now() && <AlertTriangle className="size-3 text-amber-500" />}
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

/**
 * Hook to derive the agent-display Map from the catalog. Each renderer
 * calls this; React Query dedupes the underlying fetch so cost is just
 * the per-call Map construction (cheap).
 */
export function useAgentRegistry(): Map<string, { displayName: string }> {
  const { data: agentCatalog } = useAgentCatalog()
  return useMemo(
    () => new Map((agentCatalog?.agents ?? []).map((a) => [a.className, a])),
    [agentCatalog]
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
export function RowShell({
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
            isFocused && 'ring-2 ring-ring/50 ring-inset'
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
          <ContextMenuItem onSelect={() => onOpenApproval(row.id)}>Review approval</ContextMenuItem>
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
