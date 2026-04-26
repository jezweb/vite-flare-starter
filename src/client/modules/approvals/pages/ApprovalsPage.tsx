/**
 * ApprovalsPage — review queue for actions queued by autonomous agents
 *
 * Pairs with the agent-side `requestApproval` helper. Each row shows
 * the agent that queued the action, the action type, a one-line
 * summary, and the JSON payload (collapsible). Buttons: approve,
 * reject. Edit-payload-before-approve is intentionally not in v1 —
 * the JSON edit needs more careful UI than tonight's scope; users
 * reject + re-prompt for now.
 *
 * URL: ?focus=<approvalId> highlights one row (deep-link from the
 * notification toast). ?status=all shows resolved approvals too.
 */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  Inbox,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/client/components/EmptyState'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'

type Status = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'

interface Approval {
  id: string
  agentClass: string
  agentName: string
  action: string
  summary: string | null
  payload: unknown
  payloadOverride: unknown | null
  status: Status
  note: string | null
  result: unknown | null
  error: string | null
  createdAt: number
  resolvedAt: number | null
  executedAt: number | null
}

interface ListResponse {
  total: number
  approvals: Approval[]
}

type Filter = 'pending' | 'all'

export function ApprovalsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter: Filter = searchParams.get('status') === 'all' ? 'all' : 'pending'
  const focus = searchParams.get('focus')

  const setFilter = (next: Filter) => {
    const p = new URLSearchParams(searchParams)
    if (next === 'pending') p.delete('status')
    else p.set('status', 'all')
    setSearchParams(p, { replace: true })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', filter],
    queryFn: () =>
      apiClient.get<ListResponse>(`/api/approvals?status=${filter === 'all' ? 'all' : 'pending'}&limit=200`),
    refetchInterval: filter === 'pending' ? 15_000 : false,
  })

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Actions queued by autonomous agents waiting for your review.
        </p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {data && filter === 'pending' && data.total > 0 && (
              <Badge variant="secondary" className="ml-2 h-5">
                {data.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && data && data.total === 0 && (
        <EmptyState
          icon={Inbox}
          title={filter === 'pending' ? 'No pending approvals' : 'No approvals yet'}
          description={
            filter === 'pending'
              ? 'When an autonomous agent wants to take a destructive action (send email, post message), it queues here for your review.'
              : 'Resolved approvals will appear here once agents start queuing actions.'
          }
        />
      )}

      {!isLoading && data && data.total > 0 && (
        <div className="space-y-3">
          {data.approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} highlight={focus === a.id} />
          ))}
        </div>
      )}
    </div>
  )
}

function ApprovalCard({ approval, highlight }: { approval: Approval; highlight: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  const approve = useMutation({
    mutationFn: () => apiClient.post(`/api/approvals/${approval.id}/approve`, { note: note || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvals'] }),
  })
  const reject = useMutation({
    mutationFn: () => apiClient.post(`/api/approvals/${approval.id}/reject`, { note: note || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvals'] }),
  })

  const isPending = approval.status === 'pending'
  const ageStr = useMemo(
    () => formatDistanceToNow(new Date(approval.createdAt * 1000), { addSuffix: true }),
    [approval.createdAt],
  )

  return (
    <Card
      className={cn(
        'transition-colors',
        highlight && 'ring-2 ring-primary/50',
        approval.status === 'executed' && 'border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/10',
        approval.status === 'failed' && 'border-destructive/40 bg-destructive/5',
        approval.status === 'rejected' && 'opacity-60',
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={approval.status} />
              <span className="text-xs font-mono text-muted-foreground">
                {approval.agentClass}
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs font-mono text-muted-foreground truncate">
                {approval.agentName}
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono font-normal">
                {approval.action}
              </Badge>
            </div>
            <CardTitle className="mt-2 text-base leading-snug">
              {approval.summary || `${approval.action} (no summary)`}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">queued {ageStr}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {open ? 'Hide' : 'Show'} payload
        </button>
        {open && (
          <pre className="rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words max-h-72 overflow-auto">
            {JSON.stringify(approval.payload, null, 2)}
          </pre>
        )}

        {approval.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            <strong>Error:</strong> {approval.error}
          </div>
        )}
        {approval.note && (
          <div className="text-xs text-muted-foreground">
            Note: <span className="text-foreground">{approval.note}</span>
          </div>
        )}

        {isPending && (
          <div className="space-y-2 pt-2 border-t">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note for the audit log"
              className="w-full text-xs border rounded px-2 py-1 bg-background"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => approve.mutate()}
                disabled={approve.isPending || reject.isPending}
              >
                {approve.isPending ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Approving…
                  </>
                ) : (
                  'Approve & execute'
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reject.mutate()}
                disabled={approve.isPending || reject.isPending}
              >
                {reject.isPending ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
            {approve.isError && (
              <div className="text-xs text-destructive">
                {(approve.error as Error)?.message ?? 'Approval failed'}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const config: Record<Status, { label: string; icon: typeof Clock; className: string }> = {
    pending: { label: 'Pending', icon: Clock, className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' },
    approved: { label: 'Approved', icon: CheckCircle2, className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30' },
    executed: { label: 'Executed', icon: CheckCircle2, className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
    rejected: { label: 'Rejected', icon: XCircle, className: 'bg-muted text-muted-foreground border-muted-foreground/20' },
    failed: { label: 'Failed', icon: AlertCircle, className: 'bg-destructive/10 text-destructive border-destructive/40' },
  }
  const { label, icon: Icon, className } = config[status]
  return (
    <Badge variant="outline" className={cn('gap-1 text-[10px] px-1.5 py-0', className)}>
      <Icon className="size-3" />
      {label}
    </Badge>
  )
}
