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
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/client/components/EmptyState'
import { useRoutines, useUpdateRoutine, type Routine } from '../hooks/useRoutines'
import { useAgentCatalog } from '../hooks/useAgentCatalog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'
import {
  formatAgentClass,
  formatOutcome,
  formatCadenceInterval,
} from '@/shared/format/agent'

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
    <div className="container mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Routines</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recurring agent workflows. Each routine fires its target agent on a
            schedule (or webhook), with a tool allow-list, skills, and hooks.
          </p>
        </div>
        <Button asChild className="gap-1.5">
          <Link to="/dashboard/routines/new">
            <Plus className="size-4" />
            New routine
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

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
              {seed.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
              {seed.isPending ? 'Seeding…' : 'Or seed two example routines'}
            </Button>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Seeds <span className="font-mono">routine-health</span> + <span className="font-mono">youtube-digest</span> as disabled
              examples you can edit and enable.
            </p>
          </div>
        </div>
      )}

      {!isLoading && data && data.total > 0 && (
        <ul className="space-y-2">
          {data.routines.map((r) => (
            <RoutineRow key={r.id} routine={r} agentRegistry={agentRegistry} />
          ))}
        </ul>
      )}
    </div>
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
    <li>
      <Card className="transition-colors hover:bg-muted/30">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <div className="mt-1 shrink-0">
              <TriggerIcon kind={routine.triggerKind} />
            </div>
            <Link to={`/dashboard/routines/${routine.id}`} className="min-w-0 flex-1 block">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">{routine.name}</span>
                <span className="text-[11px] text-muted-foreground">{agentLabel}</span>
                {!routine.enabled && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Disabled</Badge>
                )}
              </div>
              {routine.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {routine.description}
                </p>
              )}
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {cadence}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Activity className="size-3" />
                  last run {lastRun}
                </span>
                {routine.lastOutcome && <OutcomeBadge outcome={routine.lastOutcome} />}
              </div>
            </Link>
            <div className="shrink-0 flex items-center gap-2">
              <Switch
                checked={routine.enabled}
                onCheckedChange={onToggle}
                aria-label={`${routine.enabled ? 'Disable' : 'Enable'} ${routine.name}`}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </li>
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
  intervalSeconds: number | null,
): string {
  if (kind === 'schedule') return formatCadenceInterval(intervalSeconds)
  if (kind === 'webhook') return 'On webhook'
  if (kind === 'event') return 'On event'
  if (kind === 'manual') return 'Manual only'
  return kind
}

export default RoutinesPage
