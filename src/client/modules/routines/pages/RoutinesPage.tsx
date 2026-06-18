/**
 * RoutinesPage — list of all configured routines.
 *
 * Each routine card shows: name, target agent, cadence summary,
 * enabled toggle, last run + outcome. Click into the row to open the
 * detail page for runs / edit / fire-now.
 */
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Repeat,
  XCircle,
  AlertTriangle,
  Webhook,
  Hand,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/client/components/EmptyState'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { StatusPill } from '@/components/ui/status-pill'
import {
  ListRow,
  ListRowGroup,
  ListRowIcon,
  ListRowBody,
  ListRowTitle,
  ListRowMeta,
  ListRowTrailing,
} from '@/components/ui/list-row'
import { useRoutines, useUpdateRoutine, type Routine } from '../hooks/useRoutines'
import { useAgentCatalog } from '../hooks/useAgentCatalog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'
import { formatAgentClass, formatOutcome, formatCadenceInterval } from '@/shared/format/agent'

export function RoutinesPage() {
  const { data, isLoading } = useRoutines()
  const { data: agentCatalog } = useAgentCatalog()
  const queryClient = useQueryClient()
  const agentRegistry = new Map((agentCatalog?.agents ?? []).map((a) => [a.className, a]))
  const seed = useMutation({
    mutationFn: () => apiClient.post('/api/routines/seed-examples', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routines'] }),
  })

  return (
    <PageContainer type="queue">
      <div data-tour="routines-list">
        <PageHeader
          title="Routines"
          subtitle="Have your AI do something on a schedule — a daily morning brief, a weekly digest, a check on stuck leads. Each routine drops its findings into your Inbox."
          trailing={
            <Button asChild className="gap-1.5">
              <Link to="/dashboard/routines/new">
                <Plus className="size-4" />
                New routine
              </Link>
            </Button>
          }
        />
      </div>

      {isLoading && <PageLoading variant="list" count={3} />}

      {!isLoading && data && data.total === 0 && (
        <div className="space-y-4">
          <EmptyState
            icon={Repeat}
            title="No routines yet"
            description="Routines are saved configurations: an agent + a schedule + a tool allow-list + skills + hooks. They run automatically and post findings into your Inbox."
            tips={[
              'A routine fires its agent on a cron interval.',
              'The agent loads any skills you configured (markdown SKILL.md files).',
              'Tool calls are filtered to the allow-list you set.',
              'Findings land in the Inbox; destructive actions queue for approval.',
            ]}
            action={{
              label: 'Create your first routine',
              onClick: () => (window.location.href = '/dashboard/routines/new'),
            }}
          />
          <div className="text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => seed.mutate()}
              disabled={seed.isPending}
            >
              {seed.isPending ? <Spinner size="xs" /> : null}
              {seed.isPending ? 'Seeding…' : 'Or seed two example routines'}
            </Button>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Seeds the bundled example routines as paused — you can edit and turn them on.
            </p>
          </div>
        </div>
      )}

      {!isLoading && data && data.total > 0 && (
        <ListRowGroup>
          {data.routines.map((r) => (
            <li key={r.id}>
              <RoutineRow routine={r} agentRegistry={agentRegistry} />
            </li>
          ))}
        </ListRowGroup>
      )}
    </PageContainer>
  )
}

function RoutineRow({
  routine,
  agentRegistry,
}: {
  routine: Routine
  agentRegistry: Map<string, { displayName: string }>
}) {
  const update = useUpdateRoutine(routine.id)

  const onToggle = (next: boolean) => update.mutate({ enabled: next })

  const interval = routine.effectiveInterval ?? routine.baseInterval
  const cadence = formatCadence(routine.triggerKind, interval)
  const agentLabel = formatAgentClass(routine.agentClass, agentRegistry)
  const lastRun = routine.lastRunAt
    ? formatDistanceToNow(new Date(routine.lastRunAt * 1000), { addSuffix: true })
    : 'never'

  return (
    <ListRow state={routine.enabled ? 'default' : 'disabled'}>
      <ListRowIcon>
        <TriggerIcon kind={routine.triggerKind} />
      </ListRowIcon>
      <Link to={`/dashboard/routines/${routine.id}`} className="min-w-0 flex-1 block">
        <ListRowBody>
          <div className="flex items-center gap-2 min-w-0">
            <ListRowTitle unread>{routine.name}</ListRowTitle>
            <span className="text-[11px] text-muted-foreground shrink-0">{agentLabel}</span>
            {!routine.enabled && <StatusPill kind="neutral" label="Paused" />}
          </div>
          {routine.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {routine.description}
            </p>
          )}
          <ListRowMeta>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {cadence}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Activity className="size-3" />
              last run {lastRun}
            </span>
            {routine.lastOutcome && (
              <>
                <span>·</span>
                <OutcomeBadge outcome={routine.lastOutcome} />
              </>
            )}
          </ListRowMeta>
        </ListRowBody>
      </Link>
      <ListRowTrailing>
        <Switch
          checked={routine.enabled}
          onCheckedChange={onToggle}
          aria-label={`${routine.enabled ? 'Disable' : 'Enable'} ${routine.name}`}
        />
      </ListRowTrailing>
    </ListRow>
  )
}

function TriggerIcon({ kind }: { kind: Routine['triggerKind'] }) {
  switch (kind) {
    case 'webhook':
      return <Webhook className="size-4 text-purple-500" />
    case 'event':
      return <Zap className="size-4 text-amber-500" />
    case 'manual':
      return <Hand className="size-4 text-muted-foreground" />
    case 'schedule':
    default:
      return <Repeat className="size-4 text-primary" />
  }
}

function OutcomeBadge({ outcome }: { outcome: NonNullable<Routine['lastOutcome']> }) {
  const styleMap = {
    ok: { icon: CheckCircle2, cls: 'text-emerald-600' },
    error: { icon: XCircle, cls: 'text-destructive' },
    budget_exceeded: { icon: AlertTriangle, cls: 'text-destructive' },
    started: { icon: Loader2, cls: 'text-muted-foreground' },
  } as const
  const { icon: Icon, cls } = styleMap[outcome]
  return (
    <span className={cn('inline-flex items-center gap-1', cls)}>
      <Icon className={cn('size-3', outcome === 'started' && 'animate-spin')} />
      {formatOutcome(outcome)}
    </span>
  )
}

export function formatCadence(
  kind: Routine['triggerKind'],
  intervalSeconds: number | null
): string {
  if (kind === 'schedule') return formatCadenceInterval(intervalSeconds)
  if (kind === 'webhook') return 'On webhook'
  if (kind === 'event') return 'On event'
  if (kind === 'manual') return 'Manual only'
  return kind
}

export default RoutinesPage
