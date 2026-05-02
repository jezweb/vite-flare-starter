/**
 * ApprovalCard — one approval row's full detail view.
 *
 * Extracted from ApprovalsPage so it can render BOTH on the standalone
 * Approvals page AND inside Inbox's right-side Sheet (Slice A-prime).
 *
 * The card owns its own approve/reject mutations and invalidates both
 * `['approvals']` and `['inbox']` query keys so changes propagate to
 * either entry surface.
 *
 * For the memory_extraction agent class, the payload is structured —
 * `MemoryProposalPreview` renders a friendly preview instead of dumping
 * raw JSON. Other agents fall through to the generic technical-details
 * disclosure.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ChevronRight,
  Brain,
  ArrowUpRight,
  Lock,
} from 'lucide-react'

import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusPill } from '@/components/ui/status-pill'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'
import { formatAgentClass } from '@/shared/format/agent'
import { useAgentCatalog } from '@/client/modules/routines/hooks/useAgentCatalog'

export type Status = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'

export interface Approval {
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

export function ApprovalCard({
  approval,
  highlight = false,
}: {
  approval: Approval
  highlight?: boolean
}) {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      queryClient.invalidateQueries({ queryKey: ['inbox'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
  const reject = useMutation({
    mutationFn: () =>
      apiClient.post(`/api/approvals/${approval.id}/reject`, {
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      queryClient.invalidateQueries({ queryKey: ['inbox'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const isPending = approval.status === 'pending'
  const isMemory = approval.agentClass === 'memory_extraction'
  const ageStr = useMemo(
    () => formatDistanceToNow(new Date(approval.createdAt * 1000), { addSuffix: true }),
    [approval.createdAt],
  )
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
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusBadge status={approval.status} />
              <span className="text-[11px] text-muted-foreground">
                {sourceLabel(approval, agentRegistry, isMemory)} · {ageStr}
              </span>
              {isStale && (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-700 dark:text-amber-400"
                  title="Pending for more than 24 hours — context may have moved on"
                >
                  <Clock className="size-2.5" />
                  Older than a day
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {isMemory && <MemoryProposalPreview payload={approval.payload} />}

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
          <div className="space-y-2 pt-1">
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
                    <Spinner size="xs" />
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
                      <Spinner size="xs" />
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

            <details className="group pt-1">
              <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                Add a note (optional)
              </summary>
              <div className="mt-1.5">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why? Stored with this decision so future-you knows."
                  className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                />
              </div>
            </details>
          </div>
        )}

        <details className="group">
          <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
            Technical details
          </summary>
          <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-muted-foreground">Agent class</dt>
              <dd className="break-all font-mono">{approval.agentClass}</dd>
              <dt className="text-muted-foreground">Instance</dt>
              <dd className="break-all font-mono">{approval.agentName}</dd>
              <dt className="text-muted-foreground">Action ID</dt>
              <dd className="font-mono">{approval.action}</dd>
            </dl>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Raw payload
              </p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded border bg-background p-2 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(approval.payload, null, 2)}
              </pre>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}

// ─── Memory proposal preview ──────────────────────────────────────────

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
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Brain className="size-3.5 text-muted-foreground" />
        <span className={cn('rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider', verbColor)}>
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
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
            {update.type}
          </span>
        )}
      </div>
      {update.name && <div className="text-sm font-medium">{update.name}</div>}
      {action !== 'remove' && update.content ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border bg-background p-2 font-sans text-xs">
          {update.content}
        </pre>
      ) : update.description ? (
        <div className="text-xs text-muted-foreground">{update.description}</div>
      ) : null}
      {update.reason && (
        <div className="border-l-2 border-border pl-2 text-[11px] italic text-muted-foreground">
          {update.reason}
        </div>
      )}
      {p.conversationId && (
        <Link
          to={`/dashboard/chat/${p.conversationId}`}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground decoration-dotted underline-offset-2 hover:text-foreground hover:underline"
          title="Open the conversation that produced this proposal"
        >
          from chat
          <ArrowUpRight className="size-2.5" />
        </Link>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────

function prettifyAction(action: string): string {
  if (!action) return 'Action'
  const spaced = action.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

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
  const config: Record<
    Status,
    { label: string; icon: typeof Clock; kind: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }
  > = {
    pending: { label: 'Pending', icon: Clock, kind: 'warning' },
    approved: { label: 'Approved', icon: CheckCircle2, kind: 'info' },
    executed: { label: 'Done', icon: CheckCircle2, kind: 'success' },
    rejected: { label: 'Rejected', icon: XCircle, kind: 'neutral' },
    failed: { label: 'Failed', icon: AlertCircle, kind: 'danger' },
  }
  const { label, icon: Icon, kind } = config[status]
  return <StatusPill kind={kind} label={label} icon={<Icon />} />
}
