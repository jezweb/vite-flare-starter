/**
 * Calendar tool renderers — calendar_upcoming, calendar_create.
 */
import {
  Calendar,
  CalendarPlus,
  CalendarSearch,
  CalendarClock,
  CalendarCheck,
  CalendarX,
  Video,
  MapPin,
  Users,
  ExternalLink,
} from 'lucide-react'
import type { ToolRenderer } from './_shared'
import { truncate } from './_shared'
import type {
  CalendarUpcomingOutput,
  CalendarCreateOutput,
  CalendarListEventsOutput,
  CalendarGetEventOutput,
  CalendarFindFreeSlotOutput,
  CalendarUpdateEventOutput,
  CalendarDeleteEventOutput,
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
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
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
              <span className="text-sm font-medium truncate">{truncate(e.summary, 100)}</span>
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

/**
 * Shared row renderer for a single calendar event — reused across
 * calendar_list_events, calendar_upcoming, and calendar_get_event.
 */
function CalendarEventRow({
  event,
}: {
  event: {
    id: string
    summary: string
    start?: string
    end?: string
    location?: string
    meetLink?: string
    attendees?: string[]
  }
}) {
  return (
    <li className="flex flex-col gap-0.5 px-2 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium truncate">{truncate(event.summary, 100)}</span>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {formatEventTime(event.start, event.end)}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
        {event.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {truncate(event.location, 40)}
          </span>
        )}
        {event.attendees && event.attendees.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" />
            {event.attendees.length} attending
          </span>
        )}
        {event.meetLink && (
          <a
            href={event.meetLink}
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
  )
}

export const calendarListEventsRenderer: ToolRenderer = {
  match: 'calendar_list_events',
  icon: CalendarSearch,
  displayName: 'Calendar — List',
  summary: (output) => {
    const o = output as CalendarListEventsOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.count === 0) return 'no events'
    return `${o.count} ${o.count === 1 ? 'event' : 'events'}`
  },
  expanded: ({ output, input }) => {
    const o = output as CalendarListEventsOutput | undefined
    const i = input as { range?: string; query?: string; naturalQuery?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    const translatedFrom = o.translatedFrom ?? i?.naturalQuery
    if (o.events.length === 0) {
      return (
        <div className="text-xs text-muted-foreground italic">
          No events in this window{i?.query ? ` for "${i.query}"` : ''}.
          {translatedFrom && (
            <span className="block mt-1 not-italic text-[11px]">
              Translated from: <span className="italic">{translatedFrom}</span>
            </span>
          )}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        {translatedFrom && (
          <div className="text-[11px]">
            <span className="text-muted-foreground font-medium">From:</span>{' '}
            <span className="italic">{translatedFrom}</span>
          </div>
        )}
        {(i?.range || i?.query) && (
          <div className="text-[11px] text-muted-foreground">
            {i?.range && (
              <span className="mr-3">
                Range: <span className="font-mono">{i.range}</span>
              </span>
            )}
            {i?.query && (
              <span>
                Query: <span className="font-mono">{i.query}</span>
              </span>
            )}
          </div>
        )}
        <ul className="divide-y divide-border/60 -mx-2">
          {o.events.map((e) => (
            <CalendarEventRow key={e.id} event={e} />
          ))}
        </ul>
      </div>
    )
  },
}

export const calendarGetEventRenderer: ToolRenderer = {
  match: 'calendar_get_event',
  icon: Calendar,
  displayName: 'Calendar — Event',
  summary: (output) => {
    const o = output as CalendarGetEventOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return truncate(o.summary || '(no title)', 40)
  },
  expanded: ({ output }) => {
    const o = output as CalendarGetEventOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div className="text-sm font-medium">{o.summary}</div>
        <div className="text-muted-foreground">{formatEventTime(o.start, o.end)}</div>
        {o.location && (
          <div className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="size-3" />
            {o.location}
          </div>
        )}
        {o.attendees && o.attendees.length > 0 && (
          <div>
            <span className="text-muted-foreground">Attendees:</span>{' '}
            <span className="font-mono">{o.attendees.join(', ')}</span>
          </div>
        )}
        {o.organizer && (
          <div>
            <span className="text-muted-foreground">Organizer:</span> <span>{o.organizer}</span>
          </div>
        )}
        {o.description && (
          <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap text-foreground/90 max-h-48 overflow-y-auto">
            {o.description}
          </div>
        )}
        {o.htmlLink && (
          <a
            href={o.htmlLink}
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

export const calendarFindFreeSlotRenderer: ToolRenderer = {
  match: 'calendar_find_free_slot',
  icon: CalendarClock,
  displayName: 'Calendar — Free Slots',
  summary: (output) => {
    const o = output as CalendarFindFreeSlotOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.candidateCount === 0) return 'no slots'
    return `${o.candidateCount} ${o.candidateCount === 1 ? 'slot' : 'slots'}`
  },
  expanded: ({ output, input }) => {
    const o = output as CalendarFindFreeSlotOutput | undefined
    const i = input as { durationMinutes?: number } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    if (o.candidateCount === 0) {
      return (
        <div className="text-xs text-muted-foreground italic">
          No {i?.durationMinutes ?? o.durationMinutes}-min slots found in that window. Try widening
          the range or shortening the duration.
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-muted-foreground">{o.durationMinutes}-minute slots</div>
        <ul className="space-y-1">
          {o.slots.map((s, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs"
            >
              <CalendarClock className="size-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium">{formatEventTime(s.start, s.end)}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  },
}

export const calendarUpdateEventRenderer: ToolRenderer = {
  match: 'calendar_update_event',
  icon: CalendarCheck,
  displayName: 'Calendar — Update',
  summary: (output) => {
    const o = output as CalendarUpdateEventOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return 'updated'
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as CalendarUpdateEventOutput | undefined
    const i = input as
      | {
          eventId?: string
          summary?: string
          start?: string
          end?: string
          location?: string
          description?: string
          addAttendees?: string[]
          removeAttendees?: string[]
        }
      | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    const changes: string[] = []
    if (i?.summary) changes.push(`Title: ${i.summary}`)
    if (i?.start) changes.push(`Start: ${formatEventTime(i.start)}`)
    if (i?.end) changes.push(`End: ${formatEventTime(i.end)}`)
    if (i?.location) changes.push(`Location: ${i.location}`)
    if (i?.addAttendees?.length) changes.push(`+ ${i.addAttendees.join(', ')}`)
    if (i?.removeAttendees?.length) changes.push(`− ${i.removeAttendees.join(', ')}`)

    return (
      <div className="space-y-2 text-xs">
        {changes.length > 0 && (
          <ul className="list-disc pl-4 text-muted-foreground">
            {changes.map((c, idx) => (
              <li key={idx}>{c}</li>
            ))}
          </ul>
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

export const calendarDeleteEventRenderer: ToolRenderer = {
  match: 'calendar_delete_event',
  icon: CalendarX,
  displayName: 'Calendar — Delete',
  summary: (output) => {
    const o = output as CalendarDeleteEventOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return 'cancelled'
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as CalendarDeleteEventOutput | undefined
    const i = input as { sendUpdates?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="text-xs text-muted-foreground">
        Event cancelled{i?.sendUpdates === 'all' ? ' — attendees notified' : ''}.
      </div>
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
    const i = input as
      | {
          summary?: string
          start?: string
          end?: string
          location?: string
          attendees?: string[]
          description?: string
        }
      | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div className="text-sm font-medium text-foreground">{i?.summary ?? o.summary}</div>
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
