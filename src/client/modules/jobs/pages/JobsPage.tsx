/**
 * JobsPage — list of batch-task jobs.
 *
 * Recent jobs appear first; per-row progress bar + status badge tell the
 * user at a glance which are still running. Auto-refreshes every 5s while
 * any job is in `running` or `queued`, then drops to 30s once everything
 * is settled.
 */
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Layers, Clock, CheckCircle2, AlertCircle, XCircle, Loader2 } from 'lucide-react'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { EmptyState } from '@/client/components/EmptyState'
import { Badge } from '@/components/ui/badge'
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
}

const STATUS_BADGE: Record<BatchJob['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; Icon: typeof Layers }> = {
  queued: { label: 'Queued', variant: 'outline', Icon: Clock },
  running: { label: 'Running', variant: 'default', Icon: Loader2 },
  completed: { label: 'Completed', variant: 'secondary', Icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'destructive', Icon: AlertCircle },
  cancelled: { label: 'Cancelled', variant: 'outline', Icon: XCircle },
}

export function JobsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['batch-jobs'],
    queryFn: () => apiClient.get<{ jobs: BatchJob[] }>('/api/jobs'),
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? []
      const anyActive = jobs.some((j) => j.status === 'running' || j.status === 'queued')
      return anyActive ? 5_000 : 30_000
    },
  })

  if (isLoading) return <PageLoading />

  const jobs = data?.jobs ?? []

  return (
    <PageContainer type="queue">
      <PageHeader
        title="Batch jobs"
        subtitle="Durable AI tasks running across many items at once. Started from chat with start_batch_task."
      />

      {jobs.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No jobs yet"
          description={
            'Ask the AI in chat to "do this task for each of these files" — when there are 6+ items the chat will use a batch job to process them in parallel.'
          }
          tips={[]}
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}

function JobRow({ job }: { job: BatchJob }) {
  const meta = STATUS_BADGE[job.status]
  const created = typeof job.createdAt === 'number'
    ? new Date(job.createdAt * 1000)
    : new Date(job.createdAt)
  const pct = job.totalItems === 0 ? 0 : Math.round(((job.completedItems + job.failedItems) / job.totalItems) * 100)

  return (
    <Link
      to={`/dashboard/jobs/${job.id}`}
      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium">{job.instruction}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">
              {job.taskKind}
            </Badge>
            <span className="font-mono">{job.model}</span>
            <span>·</span>
            <span>{created.toLocaleString()}</span>
          </div>
        </div>
        <Badge variant={meta.variant} className="shrink-0 gap-1">
          <meta.Icon className={`h-3 w-3 ${job.status === 'running' ? 'animate-spin' : ''}`} />
          {meta.label}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className="flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${
                job.failedItems > 0 ? 'bg-amber-500' : 'bg-primary'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className="tabular-nums text-muted-foreground">
          {job.completedItems}
          {job.failedItems > 0 && (
            <>
              {' / '}
              <span className="text-destructive">{job.failedItems} failed</span>
            </>
          )}
          {' / '}
          {job.totalItems}
        </span>
      </div>
    </Link>
  )
}

export default JobsPage
