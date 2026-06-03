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
import { useNavigate, useParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Play, Trash2, CheckCircle2, XCircle, AlertTriangle, Clock, Activity } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageContainer } from '@/components/ui/page-container'
import { DetailHeader } from '@/components/ui/detail-header'
import { useState } from 'react'
import {
  useRoutine,
  useRoutineRuns,
  useFireRoutine,
  useDeleteRoutine,
  useUpdateRoutine,
  type RoutineRun,
} from '../hooks/useRoutines'
import { useAgentCatalog } from '../hooks/useAgentCatalog'
import { formatCadence } from './RoutinesPage'
import { cn } from '@/lib/utils'
import {
  formatAgentClass,
  formatOutcome,
  formatTrigger,
  formatAdjustMode,
} from '@/shared/format/agent'

export function RoutineDetailPage() {
  const { routineId } = useParams<{ routineId: string }>()
  const navigate = useNavigate()
  const { data: routine, isLoading } = useRoutine(routineId)
  const { data: runsData } = useRoutineRuns(routineId)
  const { data: agentCatalog } = useAgentCatalog()
  const fire = useFireRoutine()
  const del = useDeleteRoutine()
  const update = useUpdateRoutine(routineId ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showInternal, setShowInternal] = useState(false)
  const agentRegistry = new Map((agentCatalog?.agents ?? []).map((a) => [a.className, a]))

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner size="lg" className="text-muted-foreground" />
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
    routine.effectiveInterval ?? routine.baseInterval ?? null
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
    <PageContainer type="detail" maxWidth="4xl">
      <DetailHeader
        title={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <span className="truncate">{routine.name}</span>
            {!routine.enabled && <Badge variant="outline">Paused</Badge>}
          </span>
        }
        docTitle={routine.name}
        backTo="/dashboard/routines"
        backLabel="Routines"
        subtitle={
          <>
            <span>
              Runs the {formatAgentClass(routine.agentClass, agentRegistry)} {cadence.toLowerCase()}
              .
            </span>
            {routine.description && (
              <span className="text-muted-foreground/80">· {routine.description}</span>
            )}
          </>
        }
        trailing={
          <>
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
              {fire.isPending ? <Spinner size="sm" /> : <Play className="size-3.5" />}
              Run now
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
          </>
        }
      />

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
            <KV k="Trigger" v={formatTrigger(routine.triggerKind)} />
            <KV k="Cadence" v={cadence} />
            {routine.minInterval && <KV k="Min interval" v={`${routine.minInterval}s`} />}
            {routine.maxInterval && <KV k="Max interval" v={`${routine.maxInterval}s`} />}
            <KV k="Adjust mode" v={formatAdjustMode(routine.adjustMode)} />
            {routine.dailyBudgetUsd != null && (
              <KV k="Daily budget" v={`$${routine.dailyBudgetUsd}`} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Behaviour</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            <KV
              k="Skills"
              v={skills.length ? skills.join(', ') : 'No starter skills'}
              mono={skills.length > 0}
            />
            <KV
              k="Tools allowed"
              v={tools.length ? tools.join(', ') : 'All tools available'}
              mono={tools.length > 0}
            />
            <KV
              k="After each run"
              v={
                Object.keys(hooks).length
                  ? Object.entries(hooks)
                      .map(([k, v]) => `${k}→${v}`)
                      .join(', ')
                  : 'Nothing extra'
              }
              mono={Object.keys(hooks).length > 0}
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

      <details className="group rounded border bg-muted/20 px-3 py-2" open={showInternal}>
        <summary
          className="cursor-pointer text-[11px] text-muted-foreground select-none"
          onClick={(e) => {
            e.preventDefault()
            setShowInternal((v) => !v)
          }}
        >
          {showInternal ? 'Hide' : 'Show'} internal IDs
        </summary>
        <div className="mt-2 space-y-1 text-[11px]">
          <KV k="Routine ID" v={routine.id} mono />
          <KV k="Agent class" v={routine.agentClass} mono />
          <KV k="Agent instance" v={routine.agentName} mono />
        </div>
      </details>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">Recent runs</CardTitle>
          {runsData && (
            <span className="text-[11px] text-muted-foreground">{runsData.total} total</span>
          )}
        </CardHeader>
        <CardContent>
          {!runsData ? (
            <Spinner size="md" className="text-muted-foreground" />
          ) : runsData.total === 0 ? (
            <p className="text-xs text-muted-foreground">
              No runs yet. The cron sweep fires every 15 min, or click "Run now" above.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {runsData.runs.map((r) => (
                <RunRow key={r.id} run={r} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}

function RunRow({ run }: { run: RoutineRun }) {
  const Icon =
    run.outcome === 'ok'
      ? CheckCircle2
      : run.outcome === 'error'
        ? XCircle
        : run.outcome === 'budget_exceeded'
          ? AlertTriangle
          : Activity
  const colour =
    run.outcome === 'ok'
      ? 'text-emerald-600'
      : run.outcome === 'error' || run.outcome === 'budget_exceeded'
        ? 'text-destructive'
        : 'text-muted-foreground'
  const ageStr = formatDistanceToNow(new Date(run.startedAt * 1000), { addSuffix: true })
  const duration = run.finishedAt ? `${run.finishedAt - run.startedAt}s` : null
  return (
    <li className="rounded-md border p-2.5">
      <div className="flex items-center gap-2 text-xs">
        <Icon className={cn('size-3.5 shrink-0', colour)} />
        <span className={cn('font-medium', colour)}>{formatOutcome(run.outcome)}</span>
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
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          #{run.runNumber}
        </span>
      </div>
      {run.outputSummary && (
        <p className="mt-1 text-xs leading-snug whitespace-pre-wrap">
          {renderRunSummary(run.outputSummary)}
        </p>
      )}
    </li>
  )
}

/**
 * Lightweight markdown for run summaries — only handles `**bold**` and
 * `*italic*`/`_italic_` because that's what models emit in 2-3 sentence
 * summaries. Pulling in the full chat markdown pipeline (Streamdown +
 * KaTeX + code-block themes) is overkill for a one-line status. If a
 * fork wants richer rendering, swap this for the chat MessageRenderer.
 */
function renderRunSummary(text: string): import('react').ReactNode[] {
  // Split on **bold** + _italic_ + *italic* in one pass.
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_\n]+_|\*[^*\n]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (
      (part.startsWith('_') && part.endsWith('_')) ||
      (part.startsWith('*') && part.endsWith('*'))
    ) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return <span key={i}>{part}</span>
  })
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
