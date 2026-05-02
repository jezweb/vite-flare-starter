/**
 * InboxPage — unified review surface for findings + pending approvals.
 *
 * Issue #50 decision A: Approvals fold into the Inbox UI as a saved
 * filter; we render both shapes uniformly. Sort defaults to importance
 * descending, then dueAt ascending, then createdAt descending.
 *
 * Slice B (2026-05-02): rows render through a pluggable row-shape
 * registry (`row-shapes.tsx`). Three built-in shapes ship — decision,
 * digest, finding — and forks add new shapes (mention, action_item,
 * …) by editing `ROW_RENDERERS`. The page itself only owns selection,
 * focus, keyboard navigation, bulk mutations, and the ApprovalSheet.
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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Inbox, X, Check, XCircle, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ListRowGroup } from '@/components/ui/list-row'
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
import { ApprovalSheet } from '../components/ApprovalSheet'
import {
  resolveRenderer,
  type InboxImportance,
  type UnifiedRow,
} from '../row-shapes'

type Status = 'unread' | 'undecided' | 'all'

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
  const importance = (searchParams.get('importance') as InboxImportance | null) ?? null

  const setStatus = (next: Status) => {
    const p = new URLSearchParams(searchParams)
    if (next === 'undecided') p.delete('status')
    else p.set('status', next)
    setSearchParams(p, { replace: true })
  }

  const setImportance = (next: InboxImportance | null) => {
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

  // Enter on the focused row. Approval rows open the Sheet; inbox rows
  // fall through to a read-toggle. Decision-shape inline buttons are
  // exposed via `a`/`r` keyboard shortcuts on the bulk path.
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
          {(['high', 'medium', 'low'] as InboxImportance[]).map((imp) => (
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
              const Renderer = resolveRenderer(row).render
              return (
                <li key={k}>
                  <Renderer
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

export default InboxPage
