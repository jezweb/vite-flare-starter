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
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  Inbox,
  ChevronRight,
  Brain,
  ArrowUpRight,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/client/components/EmptyState'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageFilters, PageFilterTabs } from '@/components/ui/page-filters'
import { PageLoading } from '@/client/components/PageState'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'
import { formatAgentClass } from '@/shared/format/agent'
import { useAgentCatalog } from '@/client/modules/routines/hooks/useAgentCatalog'

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
  const navigate = useNavigate()
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
    <PageContainer type="queue">
      <PageHeader
        title="Approvals"
        subtitle="Your AI is asking before sending an email, posting a message, or updating its memory. Approve, reject, or edit before it acts."
      />

      <PageFilters>
        <PageFilterTabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsTrigger value="pending">
            Pending
            {data && filter === 'pending' && data.total > 0 && (
              <Badge variant="secondary" className="ml-2 h-5">
                {data.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </PageFilterTabs>
      </PageFilters>

      {isLoading && <PageLoading variant="list" count={3} />}

      {!isLoading && data && data.total === 0 && (
        <EmptyState
          icon={Inbox}
          title={filter === 'pending' ? 'No pending approvals' : 'No approvals yet'}
          description={
            filter === 'pending'
              ? "Nothing to review. When the AI proposes a destructive action (sending an email, posting a message, saving a memory), it'll queue here first."
              : 'Resolved approvals will appear here once agents start queuing actions.'
          }
          tips={
            filter === 'pending'
              ? [
                  'Ask the AI in chat to draft and send an email',
                  'Memory updates the AI proposes also land here',
                ]
              : undefined
          }
          action={
            filter === 'pending'
              ? { label: 'Open chat', onClick: () => navigate('/dashboard/chat') }
              : undefined
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
    </PageContainer>
  )
}

function ApprovalCard({ approval, highlight }: { approval: Approval; highlight: boolean }) {
  const queryClient = useQueryClient()
  const { data: agentCatalog } = useAgentCatalog()
  const agentRegistry = useMemo(
    () => new Map((agentCatalog?.agents ?? []).map((a) => [a.className, a])),
    [agentCatalog],
  )
  const [note, setNote] = useState('')

  const approve = useMutation({
    mutationFn: (opts?: { alwaysAllow?: boolean }) =>
      apiClient.post(`/api/approvals/${approval.id}/approve`, {
        note: note || undefined,
        ...(opts?.alwaysAllow && { alwaysAllow: true }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvals'] }),
  })
  const reject = useMutation({
    mutationFn: () => apiClient.post(`/api/approvals/${approval.id}/reject`, { note: note || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvals'] }),
  })

  const isPending = approval.status === 'pending'
  const isMemory = approval.agentClass === 'memory_extraction'
  const ageStr = useMemo(
    () => formatDistanceToNow(new Date(approval.createdAt * 1000), { addSuffix: true }),
    [approval.createdAt],
  )
  // Stale = pending for more than 24h. Subtle indicator only — colour-only
  // signalling would fail accessibility, so the badge has both icon + text.
  const isStale = useMemo(() => {
    if (approval.status !== 'pending') return false
    const ageSeconds = Math.floor(Date.now() / 1000) - approval.createdAt
    return ageSeconds > 24 * 60 * 60
  }, [approval.status, approval.createdAt])

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
            <CardTitle className="text-base leading-snug">
              {plainTitle(approval, isMemory)}
            </CardTitle>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <StatusBadge status={approval.status} />
              <span className="text-[11px] text-muted-foreground">
                {sourceLabel(approval, agentRegistry, isMemory)} · {ageStr}
              </span>
              {isStale && (
                <Badge
                  variant="outline"
                  className="gap-1 text-[10px] px-1.5 py-0 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  title="Pending for more than 24 hours"
                >
                  <Clock className="size-2.5" />
                  Stale
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {isMemory && <MemoryProposalPreview payload={approval.payload} />}

        <details className="group">
          <summary className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground select-none hover:text-foreground">
            <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
            Technical details
          </summary>
          <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-muted-foreground">Agent class</dt>
              <dd className="font-mono break-all">{approval.agentClass}</dd>
              <dt className="text-muted-foreground">Instance</dt>
              <dd className="font-mono break-all">{approval.agentName}</dd>
              <dt className="text-muted-foreground">Action ID</dt>
              <dd className="font-mono">{approval.action}</dd>
            </dl>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Raw payload</p>
              <pre className="rounded border bg-background p-2 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all max-h-56 overflow-auto">
                {JSON.stringify(approval.payload, null, 2)}
              </pre>
            </div>
          </div>
        </details>

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
                variant="outline"
                onClick={() => reject.mutate()}
                disabled={approve.isPending || reject.isPending}
              >
                {reject.isPending ? 'Rejecting…' : 'Reject'}
              </Button>
              <Button
                size="sm"
                onClick={() => approve.mutate({})}
                disabled={approve.isPending || reject.isPending}
              >
                {approve.isPending && !approve.variables?.alwaysAllow ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Approving…
                  </>
                ) : (
                  'Approve'
                )}
              </Button>
              {isMemory && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => approve.mutate({ alwaysAllow: true })}
                  disabled={approve.isPending || reject.isPending}
                  title="Approve and stop asking for future memory updates in this scope"
                >
                  {approve.isPending && approve.variables?.alwaysAllow ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Approving…
                    </>
                  ) : (
                    'Approve and stop asking'
                  )}
                </Button>
              )}
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

// ─── Memory proposal preview ──────────────────────────────────────────
//
// memory_extraction approvals carry a structured payload:
//   { update: MemoryUpdate, conversationId, projectId, userId }
// Render a friendly preview rather than dumping JSON. Add/update/remove
// each get distinct visual treatment + a link back to the source chat
// for provenance.
interface MemoryUpdatePayload {
  update?: {
    scope?: 'project' | 'user'
    action?: 'add' | 'update' | 'remove'
    name?: string
    description?: string
    type?: string
    content?: string
    targetMemoryId?: string
    isPrivate?: boolean
    reason?: string
  }
  conversationId?: string
}

function MemoryProposalPreview({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as MemoryUpdatePayload
  const update = p.update
  if (!update) return null

  const action = update.action ?? 'add'
  const scope = update.scope ?? 'user'
  const verbColor =
    action === 'remove'
      ? 'text-destructive bg-destructive/5 border-destructive/30'
      : action === 'update'
      ? 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30'

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Brain className="size-3.5 text-muted-foreground" />
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider border', verbColor)}>
          {action}
        </span>
        <span className="text-muted-foreground">in</span>
        <span className="font-medium">{scope === 'project' ? 'project memory' : 'your memory'}</span>
        {update.isPrivate && (
          <span title="Sensitive — never auto-injected">
            <Lock className="size-3 text-amber-600" aria-label="Private" />
          </span>
        )}
        {update.type && (
          <span className="text-[10px] uppercase tracking-wider rounded-full bg-muted px-1.5 py-0.5">
            {update.type}
          </span>
        )}
      </div>
      {update.name && (
        <div className="text-sm font-medium">{update.name}</div>
      )}
      {/*
        * Render content when present (richer); fall back to description
        * only when content is empty. Avoids the description+content
        * "looks duplicated" effect when content is description plus a
        * few extra clauses.
        */}
      {action !== 'remove' && update.content ? (
        <pre className="rounded border bg-background p-2 text-xs whitespace-pre-wrap break-words max-h-40 overflow-auto font-sans">
          {update.content}
        </pre>
      ) : update.description ? (
        <div className="text-xs text-muted-foreground">{update.description}</div>
      ) : null}
      {update.reason && (
        <div className="text-[11px] text-muted-foreground italic border-l-2 border-border pl-2">
          {update.reason}
        </div>
      )}
      {p.conversationId && (
        <Link
          to={`/dashboard/chat/${p.conversationId}`}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          title="Open the conversation that produced this proposal"
        >
          from chat
          <ArrowUpRight className="size-2.5" />
        </Link>
      )}
    </div>
  )
}

// Friendlier fallback when an agent didn't supply a summary.
// Turns `send_email` → `Send email`, falls back to the raw token.
function prettifyAction(action: string): string {
  if (!action) return 'Action'
  const spaced = action.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * Plain-language title for the approval card hero. Memory approvals
 * have a kebab-case ID for the slot ("tool-troubleshooting-preference")
 * which is meaningless to a user; render it as a sentence instead. For
 * other actions, the agent's `summary` is the canonical hero text;
 * fall back to the prettified action name.
 */
function plainTitle(approval: Approval, isMemory: boolean): string {
  if (isMemory) {
    const p = approval.payload as MemoryUpdatePayload | null
    const action = p?.update?.action ?? 'add'
    const verb = action === 'remove' ? 'forget' : action === 'update' ? 'update' : 'remember'
    const scope = p?.update?.scope === 'project' ? 'project memory' : 'your memory'
    return `The AI wants to ${verb} something to ${scope}`
  }
  return approval.summary || prettifyAction(approval.action)
}

/**
 * Friendly source label for the metadata strip. The synthetic
 * `memory_extraction` agent class would format as "Memory Extraction"
 * which is still jargon; collapse it to "AI memory" and fall back to
 * `formatAgentClass` for everything else.
 */
function sourceLabel(
  approval: Approval,
  registry: Map<string, { displayName: string }>,
  isMemory: boolean,
): string {
  if (isMemory) return 'From AI memory'
  const friendly = formatAgentClass(approval.agentClass, registry)
  return `From ${friendly}`
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
