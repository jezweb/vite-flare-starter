/**
 * InboxPage — unified review surface for findings + pending approvals.
 *
 * Issue #50 decision A: Approvals fold into the Inbox UI as a saved
 * filter; we render both shapes uniformly. Sort defaults to importance
 * descending, then dueAt ascending, then createdAt descending.
 *
 * URL params:
 *   ?status=unread|undecided|all       (default undecided)
 *   ?importance=high|medium|low        (filter pill)
 *
 * Phase 5 — Power layer:
 *   - j / k       move focus down / up
 *   - x or Space  toggle row selection
 *   - Enter       open focused row
 *   - Esc         clear selection
 *   - m           mark selected findings as read
 *   - a / r       approve / reject selected approvals (in bulk)
 *
 * Bulk mutations fan-out client-side via Promise.allSettled — no backend
 * changes needed. For huge selections we'd add a /bulk endpoint but
 * this is fine at typical inbox sizes (<50).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  Inbox,
  CheckSquare,
  Clock,
  AlertTriangle,
  ChevronRight,
  X,
  Check,
  XCircle,
  Eye,
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
  ListRowGroup,
  ListRowIcon,
  ListRowBody,
  ListRowTitle,
  ListRowMeta,
  ListRowTrailing,
} from '@/components/ui/list-row'
import { TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/client/components/EmptyState'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import {
  PageFilters,
  PageFilterTabs,
  PageFilterGroup,
  PageFilterChip,
} from '@/components/ui/page-filters'
import { PageLoading } from '@/client/components/PageState'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'
import { formatAgentClass, formatImportance } from '@/shared/format/agent'
import { useAgentCatalog } from '@/client/modules/routines/hooks/useAgentCatalog'
import { ApprovalSheet } from '../components/ApprovalSheet'

type Importance = 'high' | 'medium' | 'low'
type Status = 'unread' | 'undecided' | 'all'

interface UnifiedRow {
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

interface ListResponse {
  total: number
  items: UnifiedRow[]
}

const rowKey = (r: UnifiedRow) => `${r.source}:${r.id}`

export function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const status: Status = (() => {
    const s = searchParams.get('status')
    return s === 'unread' || s === 'all' || s === 'undecided' ? s : 'undecided'
  })()
  const importance = (searchParams.get('importance') as Importance | null) ?? null

  const setStatus = (next: Status) => {
    const p = new URLSearchParams(searchParams)
    if (next === 'undecided') p.delete('status')
    else p.set('status', next)
    setSearchParams(p, { replace: true })
  }

  const setImportance = (next: Importance | null) => {
    const p = new URLSearchParams(searchParams)
    if (next) p.set('importance', next)
    else p.delete('importance')
    setSearchParams(p, { replace: true })
  }

  const queryKey = useMemo(
    () => ['inbox', status, importance ?? 'any'] as const,
    [status, importance],
  )

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      apiClient.get<ListResponse>(
        `/api/inbox?status=${status}&limit=200${importance ? `&importance=${importance}` : ''}`,
      ),
    refetchInterval: 30_000,
  })

  const items = data?.items ?? []
  const keys = useMemo(() => items.map(rowKey), [items])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [approvalSheetId, setApprovalSheetId] = useState<string | null>(null)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  // Drop selections that no longer exist after a refetch (e.g. another
  // tab approved one). Without this we'd leak ghost selections forever.
  useEffect(() => {
    setSelected((prev) => {
      const live = new Set(keys)
      const next = new Set<string>()
      for (const k of prev) if (live.has(k)) next.add(k)
      return next.size === prev.size ? prev : next
    })
  }, [keys])

  // Reset focus when the underlying list changes (filter switch, etc.)
  useEffect(() => {
    if (focusedKey && !keys.includes(focusedKey)) setFocusedKey(null)
  }, [keys, focusedKey])

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(keys))
  const clearSelection = () => setSelected(new Set())

  const focusRow = (key: string | null) => {
    setFocusedKey(key)
    if (key) {
      const el = rowRefs.current.get(key)
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }

  // Bulk mutations — fan-out parallel calls. Toast aggregates the outcome
  // so we don't spam the user with one toast per row.
  const bulkMarkRead = async () => {
    const inboxKeys = items
      .filter((r) => r.source === 'inbox' && selected.has(rowKey(r)))
      .map((r) => r.id)
    if (inboxKeys.length === 0) return
    const results = await Promise.allSettled(
      inboxKeys.map((id) => apiClient.patch(`/api/inbox/${id}`, { read: true })),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - ok
    queryClient.invalidateQueries({ queryKey: ['inbox'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    clearSelection()
    if (failed === 0) toast.success(`Marked ${ok} as read`)
    else toast.error(`Marked ${ok}, ${failed} failed`)
  }

  const bulkApprove = async () => {
    const approvalIds = items
      .filter((r) => r.source === 'approval' && selected.has(rowKey(r)))
      .map((r) => r.id)
    if (approvalIds.length === 0) return
    const results = await Promise.allSettled(
      approvalIds.map((id) => apiClient.post(`/api/approvals/${id}/approve`, {})),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - ok
    queryClient.invalidateQueries({ queryKey: ['inbox'] })
    queryClient.invalidateQueries({ queryKey: ['approvals'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    clearSelection()
    if (failed === 0) toast.success(`Approved ${ok}`)
    else toast.error(`Approved ${ok}, ${failed} failed`)
  }

  const bulkReject = async () => {
    const approvalIds = items
      .filter((r) => r.source === 'approval' && selected.has(rowKey(r)))
      .map((r) => r.id)
    if (approvalIds.length === 0) return
    const results = await Promise.allSettled(
      approvalIds.map((id) =>
        apiClient.post(`/api/approvals/${id}/reject`, { reason: 'bulk-rejected' }),
      ),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - ok
    queryClient.invalidateQueries({ queryKey: ['inbox'] })
    queryClient.invalidateQueries({ queryKey: ['approvals'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    clearSelection()
    if (failed === 0) toast.success(`Rejected ${ok}`)
    else toast.error(`Rejected ${ok}, ${failed} failed`)
  }

  const openFocused = () => {
    if (!focusedKey) return
    const row = items.find((r) => rowKey(r) === focusedKey)
    if (!row) return
    if (row.source === 'approval') {
      setApprovalSheetId(row.id)
    } else if (row.readAt == null) {
      void apiClient.patch(`/api/inbox/${row.id}`, { read: true }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['inbox'] })
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      })
    }
  }

  // Keyboard navigation — only fires when the inbox is mounted, items
  // are loaded, and the user isn't typing in an input. The page-level
  // KeyboardShortcuts.tsx handles `g <key>` leader nav already; we add
  // the local list keys here so they only apply on this page.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      if (inInput) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (items.length === 0) return

      // Determine current focus index
      const idx = focusedKey ? keys.indexOf(focusedKey) : -1

      if (e.key === 'j') {
        e.preventDefault()
        const next = idx < 0 ? 0 : Math.min(idx + 1, items.length - 1)
        focusRow(keys[next] ?? null)
      } else if (e.key === 'k') {
        e.preventDefault()
        const next = idx < 0 ? 0 : Math.max(idx - 1, 0)
        focusRow(keys[next] ?? null)
      } else if (e.key === 'x' || e.key === ' ') {
        if (focusedKey) {
          e.preventDefault()
          toggleSelect(focusedKey)
        }
      } else if (e.key === 'Enter') {
        if (focusedKey) {
          e.preventDefault()
          openFocused()
        }
      } else if (e.key === 'Escape') {
        if (selected.size > 0) {
          e.preventDefault()
          clearSelection()
        }
      } else if (e.key === 'm' && selected.size > 0) {
        e.preventDefault()
        void bulkMarkRead()
      } else if (e.key === 'a' && selected.size > 0) {
        e.preventDefault()
        void bulkApprove()
      } else if (e.key === 'r' && selected.size > 0) {
        e.preventDefault()
        void bulkReject()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [items, keys, focusedKey, selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRows = items.filter((r) => selected.has(rowKey(r)))
  const selectedFindings = selectedRows.filter((r) => r.source === 'inbox').length
  const selectedApprovals = selectedRows.filter((r) => r.source === 'approval').length
  const allSelected = items.length > 0 && selected.size === items.length

  return (
    <PageContainer type="queue">
      <PageHeader
        title="Inbox"
        subtitle="Things your AI noticed, plus anything waiting on a yes / no. Most-important first."
      />

      <PageFilters>
        <PageFilterTabs value={status} onValueChange={(v) => setStatus(v as Status)}>
          <TabsTrigger value="undecided">Undecided</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </PageFilterTabs>
        <PageFilterGroup
          label="Importance:"
          onClear={importance ? () => setImportance(null) : undefined}
        >
          {(['high', 'medium', 'low'] as Importance[]).map((imp) => (
            <PageFilterChip
              key={imp}
              active={importance === imp}
              onClick={() => setImportance(importance === imp ? null : imp)}
            >
              {imp}
            </PageFilterChip>
          ))}
        </PageFilterGroup>
      </PageFilters>

      {isLoading && <PageLoading variant="list" count={5} />}

      {!isLoading && data && data.total === 0 && (
        <EmptyState
          icon={Inbox}
          title={status === 'unread' ? 'All caught up' : 'Nothing to review'}
          description={
            status === 'all'
              ? 'No findings or approvals on file yet. They land here as agents emit them.'
              : status === 'unread'
              ? "You've opened everything that's come in."
              : 'Nothing waiting on a decision right now. Check the Unread or All tabs to see older items.'
          }
          tips={[
            'Findings appear when a routine notices something while running on a schedule.',
            'Approvals appear when an AI agent wants to send a message, save a memory, or take another action you should sign off on.',
          ]}
          action={
            status === 'undecided'
              ? { label: 'Open Routines', onClick: () => navigate('/dashboard/routines') }
              : undefined
          }
        />
      )}

      {!isLoading && data && data.total > 0 && (
        <>
          <InboxToolbar
            total={items.length}
            selectedCount={selected.size}
            selectedFindings={selectedFindings}
            selectedApprovals={selectedApprovals}
            allSelected={allSelected}
            onSelectAll={selectAll}
            onClear={clearSelection}
            onMarkRead={bulkMarkRead}
            onApprove={bulkApprove}
            onReject={bulkReject}
          />
          <ListRowGroup>
            {items.map((row) => {
              const k = rowKey(row)
              return (
                <li key={k}>
                  <InboxRow
                    row={row}
                    isSelected={selected.has(k)}
                    isFocused={focusedKey === k}
                    selectionMode={selected.size > 0}
                    onToggleSelect={() => toggleSelect(k)}
                    onFocusChange={() => focusRow(k)}
                    onOpenApproval={(id) => setApprovalSheetId(id)}
                    rowRef={(el) => {
                      if (el) rowRefs.current.set(k, el)
                      else rowRefs.current.delete(k)
                    }}
                  />
                </li>
              )
            })}
          </ListRowGroup>
        </>
      )}

      <ApprovalSheet
        approvalId={approvalSheetId}
        open={approvalSheetId !== null}
        onClose={() => setApprovalSheetId(null)}
      />
    </PageContainer>
  )
}

interface InboxToolbarProps {
  total: number
  selectedCount: number
  selectedFindings: number
  selectedApprovals: number
  allSelected: boolean
  onSelectAll: () => void
  onClear: () => void
  onMarkRead: () => void | Promise<void>
  onApprove: () => void | Promise<void>
  onReject: () => void | Promise<void>
}

/**
 * Sticky toolbar that surfaces above the list when at least one row is
 * selected. Hidden in the empty selection state to keep the queue calm
 * for casual scanning. Buttons disable themselves when the selection
 * doesn't include any rows of the right kind.
 */
function InboxToolbar({
  total,
  selectedCount,
  selectedFindings,
  selectedApprovals,
  allSelected,
  onSelectAll,
  onClear,
  onMarkRead,
  onApprove,
  onReject,
}: InboxToolbarProps) {
  if (selectedCount === 0) {
    return (
      <p className="px-1 pb-1 text-[11px] text-muted-foreground">
        <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">j</kbd>
        {' / '}
        <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">k</kbd>
        {' to move, '}
        <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">x</kbd>
        {' to select, '}
        <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">m</kbd>
        {' / '}
        <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">a</kbd>
        {' / '}
        <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">r</kbd>
        {' for bulk mark-read / approve / reject.'}
      </p>
    )
  }
  return (
    <div className="sticky top-0 z-10 -mx-1 mb-1 flex flex-wrap items-center gap-2 rounded-md border bg-popover px-3 py-2 shadow-sm">
      <Checkbox
        checked={allSelected}
        onCheckedChange={() => (allSelected ? onClear() : onSelectAll())}
        aria-label={allSelected ? 'Clear selection' : 'Select all'}
      />
      <span className="text-sm font-medium">
        {selectedCount} of {total} selected
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onMarkRead()}
          disabled={selectedFindings === 0}
        >
          <Eye className="mr-1.5 size-3.5" />
          Mark read
          {selectedFindings > 0 && ` (${selectedFindings})`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onApprove()}
          disabled={selectedApprovals === 0}
        >
          <Check className="mr-1.5 size-3.5" />
          Approve
          {selectedApprovals > 0 && ` (${selectedApprovals})`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onReject()}
          disabled={selectedApprovals === 0}
        >
          <XCircle className="mr-1.5 size-3.5" />
          Reject
          {selectedApprovals > 0 && ` (${selectedApprovals})`}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
          <X className="size-3.5" />
        </Button>
      </span>
    </div>
  )
}

interface InboxRowProps {
  row: UnifiedRow
  isSelected: boolean
  isFocused: boolean
  selectionMode: boolean
  onToggleSelect: () => void
  onFocusChange: () => void
  onOpenApproval: (id: string) => void
  rowRef: (el: HTMLDivElement | null) => void
}

function InboxRow({
  row,
  isSelected,
  isFocused,
  selectionMode,
  onToggleSelect,
  onFocusChange,
  onOpenApproval,
  rowRef,
}: InboxRowProps) {
  const queryClient = useQueryClient()
  const { data: agentCatalog } = useAgentCatalog()
  const agentRegistry = useMemo(
    () => new Map((agentCatalog?.agents ?? []).map((a) => [a.className, a])),
    [agentCatalog],
  )
  const isApproval = row.source === 'approval'
  const isUnread = row.source === 'inbox' && row.readAt == null
  const isUrgent = row.importance === 'high' || (row.dueAt != null && row.dueAt * 1000 < Date.now())

  // Toggle the read state both ways — clicking a read row marks it
  // unread again. That gives findings real interactivity (the row was
  // looking clickable but doing nothing on the second click before).
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
    if (isApproval) {
      onOpenApproval(row.id)
      return
    }
    if (row.source === 'inbox') {
      toggleRead.mutate()
    }
  }

  const ageStr = formatDistanceToNow(new Date(row.createdAt * 1000), { addSuffix: true })

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <ListRow
      ref={rowRef}
      state={isUnread ? 'unread' : isUrgent ? 'urgent' : 'default'}
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
          keyboard users, the Review Link IS the focus stop for approval rows,
          and selection happens via Checkbox or the j/k/x bulk shortcuts. */}
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
      <ListRowIcon>
        {isApproval ? (
          <CheckSquare className="text-amber-500" />
        ) : (
          <Inbox className={cn(isUnread ? 'text-primary' : 'text-muted-foreground')} />
        )}
      </ListRowIcon>
      <ListRowBody>
        <div className="flex items-center gap-2 min-w-0">
          <ListRowTitle unread={isUnread}>{row.summary}</ListRowTitle>
          {row.importance === 'high' && <ImportancePill importance="high" />}
        </div>
        <ListRowMeta>
          {isApproval && (
            <>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 leading-3">
                Needs approval
              </Badge>
              <span>·</span>
            </>
          )}
          <span>
            {formatKind(row.kind)}
            {row.agentClass && (
              <> from {formatAgentClass(row.agentClass, agentRegistry)}</>
            )}
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
      </ListRowBody>
      <ListRowTrailing>
        {isApproval ? (
          // Approval rows open a Sheet inline — no route change. The
          // span styling matches the Link before it; click bubbles up
          // to the row's onClick which calls onOpenApproval.
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover/list-row:text-foreground">
            Review
            <ChevronRight className="size-3" />
          </span>
        ) : (
          // Findings don't navigate anywhere — clicking them toggles the
          // read state. We surface that as a hover hint instead of a
          // chevron so users don't expect a detail page that doesn't
          // exist yet.
          <span className="text-[10px] text-muted-foreground/0 group-hover/list-row:text-muted-foreground transition-colors">
            {isUnread ? 'Mark read' : 'Mark unread'}
          </span>
        )}
      </ListRowTrailing>
    </ListRow>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => toggleRead.mutate()}>
          {isUnread ? 'Mark read' : 'Mark unread'}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onToggleSelect()}>
          {isSelected ? 'Deselect' : 'Select'}
        </ContextMenuItem>
        {isApproval && (
          <ContextMenuItem onSelect={() => onOpenApproval(row.id)}>
            Review approval
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={copyId}>
          Copy row ID
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={() => archive.mutate()}
          disabled={archive.isPending}
        >
          Archive
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
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
 * `kind` is a free-form string set by the agent when it called
 * `inbox_add` (e.g. "stale_lead", "stuck_ticket", "schema_drift").
 * Convert snake_case → Title case for display, with friendlier names
 * for the well-known internal kinds so the UI doesn't read like a
 * database enum.
 */
function formatKind(kind: string): string {
  if (!kind) return ''
  // Special cases for internal events the agent emits directly. Keep
  // the user-facing label aligned with the same surface elsewhere
  // (Approvals page collapses memory_extraction the same way).
  switch (kind) {
    case 'memory_extraction':
      return 'AI memory'
    case 'memory':
      return 'AI memory'
  }
  return kind
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

export default InboxPage
