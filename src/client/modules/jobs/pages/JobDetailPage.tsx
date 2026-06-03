/**
 * JobDetailPage — per-job progress + per-item results.
 *
 * Auto-refreshes every 3s while the job is running so the user watches
 * items flip from `pending` → `running` → `completed/failed` in real
 * time. Each item is expandable to reveal the AI's full output.
 *
 * Cancellation: the Cancel button flips the job to `cancelled`. The
 * Workflow notices on its next loop iteration and stops scheduling new
 * windows; in-flight items finish naturally.
 */
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  XCircle,
  Square,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { EmptyState } from '@/client/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/client/lib/api-client'

interface BatchJob {
  id: string
  instruction: string
  taskKind: string
  model: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  totalItems: number
  completedItems: number
  failedItems: number
  createdAt: string | number
  updatedAt: string | number
  resultSummary: string | null
}

interface BatchItem {
  id: string
  jobId: string
  refKind: 'r2_file' | 'url' | 'text'
  refValue: string
  label: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  result: string | null
  error: string | null
  attempts: number
  startedAt: string | number | null
  completedAt: string | number | null
}

interface JobResponse {
  job: BatchJob
  items: BatchItem[]
}

const ITEM_BADGE = {
  pending: { variant: 'outline' as const, Icon: Clock, label: 'Pending' },
  running: { variant: 'default' as const, Icon: Loader2, label: 'Running' },
  completed: { variant: 'secondary' as const, Icon: CheckCircle2, label: 'Done' },
  failed: { variant: 'destructive' as const, Icon: AlertCircle, label: 'Failed' },
}

const JOB_BADGE = {
  queued: { variant: 'outline' as const, Icon: Clock, label: 'Queued' },
  running: { variant: 'default' as const, Icon: Loader2, label: 'Running' },
  completed: { variant: 'secondary' as const, Icon: CheckCircle2, label: 'Completed' },
  failed: { variant: 'destructive' as const, Icon: AlertCircle, label: 'Failed' },
  cancelled: { variant: 'outline' as const, Icon: XCircle, label: 'Cancelled' },
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['batch-job', id],
    queryFn: () => apiClient.get<JobResponse>(`/api/jobs/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const job = query.state.data?.job
      return job && (job.status === 'running' || job.status === 'queued') ? 3_000 : 30_000
    },
  })

  const cancel = useMutation({
    mutationFn: () => apiClient.post(`/api/jobs/${id}/cancel`, {}),
    onSuccess: () => {
      toast.success('Job cancelled')
      void queryClient.invalidateQueries({ queryKey: ['batch-job', id] })
      void queryClient.invalidateQueries({ queryKey: ['batch-jobs'] })
    },
    onError: (err: Error) => toast.error(`Cancel failed: ${err.message}`),
  })

  if (isLoading) return <PageLoading />
  if (!data?.job) {
    return (
      <PageContainer type="detail">
        <EmptyState
          icon={Layers}
          title="Job not found"
          description="This job doesn't exist or you don't have access to it."
        />
      </PageContainer>
    )
  }

  const { job, items } = data
  const meta = JOB_BADGE[job.status]
  const pct =
    job.totalItems === 0
      ? 0
      : Math.round(((job.completedItems + job.failedItems) / job.totalItems) * 100)

  const toggleExpand = (itemId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  return (
    <PageContainer type="detail">
      <div className="mb-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/jobs">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            All jobs
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Batch job"
        subtitle={job.instruction}
        trailing={
          job.status === 'running' || job.status === 'queued' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              <Square className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
          ) : null
        }
      />

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={meta.variant} className="gap-1">
            <meta.Icon className={`h-3 w-3 ${job.status === 'running' ? 'animate-spin' : ''}`} />
            {meta.label}
          </Badge>
          <Badge variant="outline">{job.taskKind}</Badge>
          <span className="font-mono">{job.model}</span>
          <span>·</span>
          <span>
            {job.completedItems} done · {job.failedItems} failed · {job.totalItems} total
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${job.failedItems > 0 ? 'bg-amber-500' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-right text-xs tabular-nums text-muted-foreground">{pct}%</div>
      </div>

      <div className="mt-6 space-y-2">
        <div className="text-sm font-medium">Items</div>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">No items.</div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                expanded={expanded.has(item.id)}
                onToggle={() => toggleExpand(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  )
}

function ItemRow({
  item,
  expanded,
  onToggle,
}: {
  item: BatchItem
  expanded: boolean
  onToggle: () => void
}) {
  const meta = ITEM_BADGE[item.status]
  const label = item.label ?? item.refValue.slice(0, 80)

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Badge variant={meta.variant} className="shrink-0 gap-1 text-[10px]">
          <meta.Icon className={`h-3 w-3 ${item.status === 'running' ? 'animate-spin' : ''}`} />
          {meta.label}
        </Badge>
        <div className="min-w-0 flex-1 truncate font-mono text-xs">{label}</div>
        {item.attempts > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground">↻ {item.attempts}</span>
        )}
      </button>

      {expanded && (
        <div className="space-y-2 border-t bg-muted/20 px-4 py-3 text-sm">
          <div className="text-xs text-muted-foreground">
            <span className="font-mono">{item.refKind}</span>
            {' · '}
            <span className="font-mono">{item.refValue}</span>
          </div>
          {item.error && (
            <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
              <div className="font-medium">Error</div>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono">{item.error}</pre>
            </div>
          )}
          {item.result && (
            <div className="rounded bg-card p-2 text-xs">
              <div className="font-medium text-muted-foreground">Result</div>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono">{item.result}</pre>
            </div>
          )}
          {!item.result && !item.error && (
            <div className="text-xs text-muted-foreground">No output yet.</div>
          )}
        </div>
      )}
    </div>
  )
}

export default JobDetailPage
