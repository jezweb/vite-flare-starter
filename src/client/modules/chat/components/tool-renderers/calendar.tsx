/**
 * Calendar tool renderers — calendar_upcoming, calendar_create.
 */
import { Calendar, CalendarPlus, Video, MapPin, Users, ExternalLink } from 'lucide-react'
import type { ToolRenderer } from './_shared'
import { truncate } from './_shared'
import type {
  CalendarUpcomingOutput,
  CalendarCreateOutput,
} from '@/server/modules/chat/tools/google-workspace'

/**
 * Format a date/time pair compactly: "Fri 25 Apr · 2:00 PM – 3:00 PM".
 * Handles all-day events (date-only) and cross-day events gracefully.
 */
function formatEventTime(start?: string, end?: string): string {
  if (!start) return ''
  const s = new Date(start)
  if (isNaN(s.getTime())) return start
  const isAllDay = !start.includes('T')
  const dateLabel = s.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  if (isAllDay) return `${dateLabel} · all day`
  const timeLabel = s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (end) {
    const e = new Date(end)
    const sameDay = s.toDateString() === e.toDateString()
    const eTime = e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (sameDay) return `${dateLabel} · ${timeLabel} – ${eTime}`
    return `${dateLabel} ${timeLabel} → ${e.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${eTime}`
  }
  return `${dateLabel} · ${timeLabel}`
}

export const calendarUpcomingRenderer: ToolRenderer = {
  match: 'calendar_upcoming',
  icon: Calendar,
  displayName: 'Calendar',
  summary: (output) => {
    const o = output as CalendarUpcomingOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    const n = o.count
    if (n === 0) return 'no upcoming events'
    return `${n} ${n === 1 ? 'event' : 'events'}`
  },
  expanded: ({ output }) => {
    const o = output as CalendarUpcomingOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    const events = o.events
    if (events.length === 0) {
      return (
        <div className="text-xs text-muted-foreground italic">
          No upcoming events in this window.
        </div>
      )
    }
    return (
      <ul className="divide-y divide-border/60 -mx-2">
        {events.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5 px-2 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {truncate(e.summary, 100)}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {formatEventTime(e.start, e.end)}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
              {e.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {truncate(e.location, 40)}
                </span>
              )}
              {e.attendees && e.attendees.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3" />
                  {e.attendees.length} attending
                </span>
              )}
              {e.meetLink && (
                <a
                  href={e.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-foreground hover:underline"
                >
                  <Video className="size-3" />
                  Join
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    )
  },
}

export const calendarCreateRenderer: ToolRenderer = {
  match: 'calendar_create',
  icon: CalendarPlus,
  displayName: 'Calendar — Create Event',
  summary: (output) => {
    const o = output as CalendarCreateOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return 'created'
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as CalendarCreateOutput | undefined
    const i = input as {
      summary?: string
      start?: string
      end?: string
      location?: string
      attendees?: string[]
      description?: string
    } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div className="text-sm font-medium text-foreground">
          {i?.summary ?? o.summary}
        </div>
        <div className="text-muted-foreground">
          {formatEventTime(i?.start ?? o.start, i?.end ?? o.end)}
        </div>
        {i?.location && (
          <div className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="size-3" />
            {i.location}
          </div>
        )}
        {i?.attendees && i.attendees.length > 0 && (
          <div>
            <span className="text-muted-foreground">Attendees:</span>{' '}
            <span className="font-mono">{i.attendees.join(', ')}</span>
          </div>
        )}
        {i?.description && (
          <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap text-foreground/90 max-h-48 overflow-y-auto">
            {i.description}
          </div>
        )}
        {o.url && (
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-foreground hover:underline"
          >
            Open in Google Calendar
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    )
  },
}
