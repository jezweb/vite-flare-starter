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
 */
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  Inbox,
  CheckSquare,
  Clock,
  AlertTriangle,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/client/components/EmptyState'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'
import { formatAgentClass, formatImportance } from '@/shared/format/agent'
import { useAgentCatalog } from '@/client/modules/routines/hooks/useAgentCatalog'

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

export function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
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

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Findings + approvals, sorted by importance and due date.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
          <TabsList>
            <TabsTrigger value="undecided">Undecided</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Importance:</span>
          {(['high', 'medium', 'low'] as Importance[]).map((imp) => (
            <button
              key={imp}
              onClick={() => setImportance(importance === imp ? null : imp)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors',
                importance === imp
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {imp}
            </button>
          ))}
          {importance && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setImportance(null)}
            >
              clear
            </Button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

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
            'Findings come from Routines and ad-hoc agent runs (inbox_add tool).',
            'Approvals come from agents proposing destructive actions (approval_queue / requestApproval).',
          ]}
          action={
            status === 'undecided'
              ? { label: 'Open Routines', onClick: () => navigate('/dashboard/routines') }
              : undefined
          }
        />
      )}

      {!isLoading && data && data.total > 0 && (
        <ul className="divide-y rounded-md border bg-card">
          {data.items.map((row) => (
            <InboxRow key={`${row.source}:${row.id}`} row={row} />
          ))}
        </ul>
      )}
    </div>
  )
}

function InboxRow({ row }: { row: UnifiedRow }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: agentCatalog } = useAgentCatalog()
  const agentRegistry = useMemo(
    () => new Map((agentCatalog?.agents ?? []).map((a) => [a.className, a])),
    [agentCatalog],
  )
  const isApproval = row.source === 'approval'
  const isUnread = row.source === 'inbox' && row.readAt == null
  const isUrgent = row.importance === 'high' || (row.dueAt != null && row.dueAt * 1000 < Date.now())

  const markRead = useMutation({
    mutationFn: () => apiClient.patch(`/api/inbox/${row.id}`, { read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  })

  const handleClick = () => {
    if (isApproval) {
      navigate(`/dashboard/approvals?focus=${row.id}`)
    } else if (isUnread) {
      markRead.mutate()
    }
  }

  const ageStr = formatDistanceToNow(new Date(row.createdAt * 1000), { addSuffix: true })

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/30',
          isUnread && 'bg-primary/5',
          isUrgent && 'bg-amber-500/5',
        )}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="shrink-0">
          {isApproval ? (
            <CheckSquare className="size-4 text-amber-500" />
          ) : (
            <Inbox className={cn('size-4', isUnread ? 'text-primary' : 'text-muted-foreground')} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className={cn('text-sm truncate', isUnread && 'font-medium')}>
              {row.summary}
            </p>
            {row.importance === 'high' && (
              <ImportancePill importance="high" />
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
            {isApproval && (
              <>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 leading-3">
                  Needs approval
                </Badge>
                <span>·</span>
              </>
            )}
            <span className="truncate">
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
          </div>
        </div>
        {isApproval ? (
          <Link
            to={`/dashboard/approvals?focus=${row.id}`}
            className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            Review
            <ChevronRight className="size-3" />
          </Link>
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
        )}
      </div>
    </li>
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
 * Convert snake_case → Title case for display.
 */
function formatKind(kind: string): string {
  if (!kind) return ''
  return kind
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

export default InboxPage
