/**
 * Time — accessible timestamp display.
 *
 * Renders a `<time>` element with a `dateTime` attribute (machine-readable
 * ISO) and visible label per the chosen format. Hover shows the absolute
 * form via `title=` so users can disambiguate "5 minutes ago" without
 * leaving the page.
 *
 *   <Time value={createdAt} display="relative" />     // "5 minutes ago"
 *   <Time value={createdAt} display="short" />        // "Apr 24" or "Mon" or "10:42 am"
 *   <Time value={createdAt} display="absolute" />     // "24 Apr 2026, 10:42 am"
 *
 * Replaces ad-hoc `formatDistanceToNow(...)` + `<span title="...">` markup
 * everywhere the codebase used to roll its own.
 */
import * as React from 'react'
import {
  formatRelative,
  formatShort,
  formatAbsolute,
  parseTimestamp,
  formatRelativeSafe,
} from '@/shared/format/datetime'
import { cn } from '@/lib/utils'

interface TimeProps extends Omit<React.TimeHTMLAttributes<HTMLTimeElement>, 'dateTime'> {
  value: Date | string | number | null | undefined
  display?: 'relative' | 'short' | 'absolute'
  /**
   * Falls back to a stable placeholder ("just now" / "recently") on
   * unparseable input instead of throwing. Default true for relative;
   * false for short/absolute (callers usually want errors visible).
   */
  safe?: boolean
}

export function Time({
  value,
  display = 'relative',
  safe,
  className,
  ...rest
}: TimeProps) {
  const useSafe = safe ?? display === 'relative'
  if (value == null) {
    if (useSafe) {
      return (
        <time data-slot="time" className={cn(className)} {...rest}>
          —
        </time>
      )
    }
    return null
  }

  let date: Date | null = null
  let label = ''
  let iso: string | undefined

  try {
    date = parseTimestamp(value)
    iso = date.toISOString()
    label =
      display === 'relative'
        ? useSafe
          ? formatRelativeSafe(value)
          : formatRelative(value)
        : display === 'short'
          ? formatShort(value)
          : formatAbsolute(value)
  } catch {
    if (useSafe) {
      label = 'recently'
    } else {
      throw new Error('Time: invalid value passed without safe=true')
    }
  }

  const tooltip = date ? formatAbsolute(date) : undefined
  return (
    <time
      data-slot="time"
      dateTime={iso}
      title={display === 'absolute' ? undefined : tooltip}
      className={cn(className)}
      {...rest}
    >
      {label}
    </time>
  )
}

Time.displayName = 'Time'
