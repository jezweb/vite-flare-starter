import { Check, Circle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_SOLID } from '@/client/lib/status-colors'

interface Event {
  title: string
  date?: string
  description?: string
  status?: 'completed' | 'current' | 'upcoming'
}

interface Props {
  title?: string
  events: Event[]
}

const ICONS = { completed: Check, current: Clock, upcoming: Circle }
const COLORS = {
  completed: STATUS_SOLID.success,
  current: 'bg-primary text-primary-foreground border-primary',
  upcoming: 'bg-background text-muted-foreground border-border',
}

export function Timeline({ title, events }: Props) {
  return (
    <div className="rounded-lg border border-border p-3">
      {title && <h3 className="font-semibold text-sm mb-3">{title}</h3>}
      <div className="space-y-3">
        {events.map((event, i) => {
          const status = event.status || 'upcoming'
          const Icon = ICONS[status]
          const isLast = i === events.length - 1
          return (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'size-6 rounded-full border-2 flex items-center justify-center',
                    COLORS[status]
                  )}
                >
                  <Icon className="size-3" />
                </div>
                {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
              </div>
              <div className="flex-1 min-w-0 pb-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium text-sm">{event.title}</div>
                  {event.date && (
                    <div className="text-xs text-muted-foreground shrink-0">{event.date}</div>
                  )}
                </div>
                {event.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{event.description}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
