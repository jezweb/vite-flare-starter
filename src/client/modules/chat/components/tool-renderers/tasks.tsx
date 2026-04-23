/**
 * Google Tasks tool renderers — tasks_list, tasks_create.
 */
import { ListTodo, ListPlus, Circle, CheckCircle2 } from 'lucide-react'
import type { ToolRenderer } from './_shared'
import { truncate } from './_shared'
import type {
  TasksListOutput,
  TasksCreateOutput,
} from '@/server/modules/chat/tools/google-workspace'

function formatDue(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const now = new Date()
  const days = Math.round((+d - +now) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${-days}d overdue`
  if (days < 7) return `In ${days}d`
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export const tasksListRenderer: ToolRenderer = {
  match: 'tasks_list',
  icon: ListTodo,
  displayName: 'Tasks — List',
  summary: (output) => {
    const o = output as TasksListOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.count === 0) return 'no tasks'
    return `${o.count} ${o.count === 1 ? 'task' : 'tasks'}`
  },
  expanded: ({ output }) => {
    const o = output as TasksListOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    if (o.tasks.length === 0) {
      return (
        <div className="text-xs text-muted-foreground italic">
          No tasks in this list.
        </div>
      )
    }
    return (
      <ul className="space-y-1 text-xs">
        {o.tasks.map((t) => {
          const done = t.status === 'completed'
          const Icon = done ? CheckCircle2 : Circle
          return (
            <li
              key={t.id}
              className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2"
            >
              <Icon
                className={`size-3.5 shrink-0 mt-0.5 ${done ? 'text-green-600' : 'text-muted-foreground'}`}
              />
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-medium ${done ? 'line-through text-muted-foreground' : ''}`}
                >
                  {truncate(t.title, 80)}
                </div>
                {t.notes && (
                  <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                    {t.notes}
                  </div>
                )}
              </div>
              {t.due && (
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatDue(t.due)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    )
  },
}

export const tasksCreateRenderer: ToolRenderer = {
  match: 'tasks_create',
  icon: ListPlus,
  displayName: 'Tasks — Create',
  summary: (output) => {
    const o = output as TasksCreateOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return truncate(o.title, 30)
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as TasksCreateOutput | undefined
    const i = input as { notes?: string; due?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-1 text-xs">
        <div className="text-sm font-medium">{o.title}</div>
        {i?.due && (
          <div className="text-muted-foreground">Due: {formatDue(i.due)}</div>
        )}
        {i?.notes && (
          <div className="rounded-md bg-muted/50 p-2 whitespace-pre-wrap text-foreground/90">
            {i.notes}
          </div>
        )}
      </div>
    )
  },
}
