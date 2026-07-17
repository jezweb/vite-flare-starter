/**
 * TimeLogger — start/stop timer + manual time logging for any record
 * (#62(3) time entries).
 *
 * Attach to any entity: <TimeLogger entityType="entity" entityId={id} />.
 * The running timer survives navigation — start time is persisted to
 * localStorage (scoped per record), so closing the sheet or reloading
 * doesn't lose the clock; stopping logs the elapsed minutes (minimum 1).
 *
 * Server contract: /api/time-entries (see the module docblock). Access
 * follows the record's visibility; entries are author-deletable only.
 */
import * as React from 'react'
import { toast } from 'sonner'
import { Play, Stop, Timer, Trash } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/client/lib/api-client'
import { appConfig } from '@/shared/config/app'

interface TimeEntryRow {
  id: string
  userId: string
  durationMinutes: number
  description: string | null
  date: string
  billable: boolean
  userName?: string | null
}

interface TimeEntriesResponse {
  entries: TimeEntryRow[]
  totalMinutes: number
  billableMinutes: number
}

const formatMinutes = (mins: number) => {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const timerKey = (entityType: string, entityId: string) =>
  `${appConfig.id}:timer:${entityType}:${entityId}`

interface TimeLoggerProps {
  entityType: string
  entityId: string
}

export function TimeLogger({ entityType, entityId }: TimeLoggerProps) {
  const queryClient = useQueryClient()
  const queryKey = ['time-entries', entityType, entityId] as const

  const { data } = useQuery({
    queryKey,
    queryFn: () =>
      apiClient.get<TimeEntriesResponse>('/api/time-entries', {
        params: { entityType, entityId },
      }),
  })

  // ── Running timer (localStorage-backed) ─────────────────────────
  const [startedAt, setStartedAt] = React.useState<number | null>(() => {
    const raw = localStorage.getItem(timerKey(entityType, entityId))
    return raw ? Number(raw) : null
  })
  const [, forceTick] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    if (startedAt === null) return
    const t = setInterval(forceTick, 30_000)
    return () => clearInterval(t)
  }, [startedAt])

  // ── Manual entry state ──────────────────────────────────────────
  const [minutes, setMinutes] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [billable, setBillable] = React.useState(false)

  const createEntry = useMutation({
    mutationFn: (input: { durationMinutes: number; description?: string; billable: boolean }) =>
      apiClient.post('/api/time-entries', { entityType, entityId, ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => toast.error(err.message || 'Could not log time'),
  })

  const deleteEntry = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/time-entries/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const handleStart = () => {
    const now = Date.now()
    localStorage.setItem(timerKey(entityType, entityId), String(now))
    setStartedAt(now)
  }

  const handleStop = () => {
    if (startedAt === null) return
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 60_000))
    localStorage.removeItem(timerKey(entityType, entityId))
    setStartedAt(null)
    createEntry.mutate(
      { durationMinutes: elapsed, description: description.trim() || undefined, billable },
      { onSuccess: () => setDescription('') }
    )
  }

  const handleManualAdd = () => {
    const mins = Number(minutes)
    if (!Number.isInteger(mins) || mins < 1) {
      toast.error('Enter whole minutes (1 or more)')
      return
    }
    createEntry.mutate(
      { durationMinutes: mins, description: description.trim() || undefined, billable },
      {
        onSuccess: () => {
          setMinutes('')
          setDescription('')
        },
      }
    )
  }

  const runningMinutes =
    startedAt === null ? 0 : Math.max(0, Math.round((Date.now() - startedAt) / 60_000))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Timer className="size-4" /> Time
        </span>
        {data && data.totalMinutes > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatMinutes(data.totalMinutes)} logged
            {data.billableMinutes > 0 && ` · ${formatMinutes(data.billableMinutes)} billable`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {startedAt === null ? (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleStart}>
            <Play className="size-3.5" /> Start timer
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={handleStop}>
            <Stop className="size-3.5" /> Stop · {formatMinutes(runningMinutes)}
          </Button>
        )}
        <Input
          type="number"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="min"
          className="w-20"
          aria-label="Minutes to log"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleManualAdd}
          disabled={createEntry.isPending || !minutes}
        >
          Log
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was the time spent on?"
          className="flex-1"
          aria-label="Time entry description"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={billable} onCheckedChange={(v) => setBillable(v === true)} />
          Billable
        </label>
      </div>

      {data && data.entries.length > 0 && (
        <ul className="divide-y divide-hairline text-sm">
          {data.entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 py-1.5">
              <span className="w-14 shrink-0 tabular-nums">{formatMinutes(entry.durationMinutes)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {entry.description || entry.userName || '—'}
                {entry.billable && ' · billable'}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{entry.date}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                aria-label="Delete entry"
                onClick={() => deleteEntry.mutate(entry.id)}
              >
                <Trash className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
