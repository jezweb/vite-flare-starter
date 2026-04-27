/**
 * RoutineDetailPage — single routine view: config + run history.
 *
 * Sections:
 *   - Header — name, agent target, fire-now button, delete
 *   - Config snapshot — interval, skills, tools, hooks (read-only for slice 6)
 *   - Run history — last 50 runs with outcome + summary + cost
 *
 * Edit (in-place) deferred to slice 7+ — for now users delete + recreate.
 * That's annoying but keeps slice 6 small; the form is already in
 * NewRoutinePage so a "duplicate to edit" workflow is one nav away.
 */
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  ArrowLeft,
  Loader2,
  Play,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Activity,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useState } from 'react'
import {
  useRoutine,
  useRoutineRuns,
  useFireRoutine,
  useDeleteRoutine,
  useUpdateRoutine,
  type RoutineRun,
} from '../hooks/useRoutines'
import { formatCadence } from './RoutinesPage'
import { cn } from '@/lib/utils'

export function RoutineDetailPage() {
  const { routineId } = useParams<{ routineId: string }>()
  const navigate = useNavigate()
  const { data: routine, isLoading } = useRoutine(routineId)
  const { data: runsData } = useRoutineRuns(routineId)
  const fire = useFireRoutine()
  const del = useDeleteRoutine()
  const update = useUpdateRoutine(routineId ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!routine) {
    return (
      <div className="container mx-auto max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Routine not found.</p>
      </div>
    )
  }

  const cadence = formatCadence(
    routine.triggerKind,
    routine.effectiveInterval ?? routine.baseInterval ?? null,
  )
  const skills = parseList(routine.skillsLoadedJson)
  const tools = parseList(routine.toolsAllowedJson)
  const hooks = parseHooks(routine.hooksJson)
  const inputTemplate = parseInputTemplate(routine.inputTemplateJson)

  const handleDelete = async () => {
    if (!routineId) return
    await del.mutateAsync(routineId)
    navigate('/dashboard/routines')
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link to="/dashboard/routines">
          <ArrowLeft className="size-3.5" />
          Routines
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{routine.name}</h1>
            {!routine.enabled && <Badge variant="outline">Disabled</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Fires <span className="font-mono">{routine.agentClass}:{routine.agentName}</span> {cadence}.
          </p>
          {routine.description && (
            <p className="mt-2 text-sm text-muted-foreground">{routine.description}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Switch
            checked={routine.enabled}
            onCheckedChange={(next) => update.mutate({ enabled: next })}
            aria-label={`${routine.enabled ? 'Disable' : 'Enable'} routine`}
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => fire.mutate(routine.id)}
            disabled={fire.isPending}
          >
            {fire.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Fire now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete routine"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete routine?"
        description="This stops the routine and removes all run history. This cannot be undone."
        confirmLabel="Delete routine"
        variant="destructive"
        onConfirm={handleDelete}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            <KV k="Trigger" v={routine.triggerKind} />
            <KV k="Cadence" v={cadence} />
            {routine.minInterval && <KV k="Min interval" v={`${routine.minInterval}s`} />}
            {routine.maxInterval && <KV k="Max interval" v={`${routine.maxInterval}s`} />}
            <KV k="Adjust mode" v={routine.adjustMode} />
            {routine.dailyBudgetUsd != null && <KV k="Daily budget" v={`$${routine.dailyBudgetUsd}`} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Behaviour</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            <KV k="Skills" v={skills.length ? skills.join(', ') : '(none)'} mono />
            <KV k="Tools allowed" v={tools.length ? tools.join(', ') : 'all available'} mono />
            <KV
              k="Hooks"
              v={
                Object.keys(hooks).length
                  ? Object.entries(hooks).map(([k, v]) => `${k}→${v}`).join(', ')
                  : '(none)'
              }
              mono
            />
          </CardContent>
        </Card>
      </div>

      {inputTemplate && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Input template</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded border bg-muted/30 p-2 text-xs whitespace-pre-wrap break-words font-sans">
              {inputTemplate}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">Recent runs</CardTitle>
          {runsData && (
            <span className="text-[11px] text-muted-foreground">
              {runsData.total} total
            </span>
          )}
        </CardHeader>
        <CardContent>
          {!runsData ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : runsData.total === 0 ? (
            <p className="text-xs text-muted-foreground">
              No runs yet. The cron sweep fires every 15 min, or click "Fire now" above.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {runsData.runs.map((r) => <RunRow key={r.id} run={r} />)}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RunRow({ run }: { run: RoutineRun }) {
  const Icon = run.outcome === 'ok'
    ? CheckCircle2
    : run.outcome === 'error'
    ? XCircle
    : run.outcome === 'budget_exceeded'
    ? AlertTriangle
    : Activity
  const colour = run.outcome === 'ok'
    ? 'text-emerald-600'
    : run.outcome === 'error' || run.outcome === 'budget_exceeded'
    ? 'text-destructive'
    : 'text-muted-foreground'
  const ageStr = formatDistanceToNow(new Date(run.startedAt * 1000), { addSuffix: true })
  const duration = run.finishedAt ? `${(run.finishedAt - run.startedAt)}s` : null
  return (
    <li className="rounded-md border p-2.5">
      <div className="flex items-center gap-2 text-xs">
        <Icon className={cn('size-3.5 shrink-0', colour)} />
        <span className="font-mono">#{run.runNumber}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{ageStr}</span>
        {duration && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3" />
              {duration}
            </span>
          </>
        )}
        {run.costUsd != null && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">${run.costUsd.toFixed(4)}</span>
          </>
        )}
      </div>
      {run.outputSummary && (
        <p className="mt-1 text-xs leading-snug">{run.outputSummary}</p>
      )}
    </li>
  )
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn(mono && 'font-mono break-all')}>{v}</span>
    </div>
  )
}

function parseList(json: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function parseHooks(json: string | null): Record<string, string> {
  if (!json) return {}
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

function parseInputTemplate(json: string | null): string | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && typeof v.input === 'string') return v.input
    return null
  } catch {
    return null
  }
}

export default RoutineDetailPage
