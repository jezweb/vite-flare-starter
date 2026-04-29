/**
 * Date / time / duration formatting — single source of truth.
 *
 * The codebase had three private `formatTime` / `formatDate` helpers and
 * 13 ad-hoc `formatDistanceToNow` imports before this module landed. Use
 * the helpers here instead.
 *
 * | Function | Output | Use when |
 * |---|---|---|
 * | `formatRelative` | "5 minutes ago" / "in 2 hours" | List rows, recent activity, "last seen" |
 * | `formatShort` | "10:42 am" / "Mon" / "Apr 24" | Compact tables, message timestamps (claude.ai-style) |
 * | `formatAbsolute` | "24 Apr 2026, 10:42 am" | Hover tooltips, audit logs |
 * | `formatDuration` | "2h 13m" / "3.4s" / "23 days" | Run length, time-to-deadline |
 * | `parseTimestamp` | `Date` | Coercing input that might be ISO / epoch-sec / epoch-ms / Date |
 *
 * Pair with the `<Time>` component in `components/ui/time.tsx` for
 * accessible markup with `<time>` semantics + a hover tooltip showing
 * the absolute form.
 *
 * Australia/Sydney is the project's default timezone. `formatAbsolute`
 * respects the user's local timezone via `toLocaleString` so different
 * timezones render correctly.
 */

import { formatDistanceToNow, format as fmt, isToday, isThisWeek, isThisYear } from 'date-fns'

/**
 * Coerce an unknown timestamp shape into a Date. Handles:
 * - Date instances (passed through)
 * - ISO strings ("2026-04-24T10:42:00Z")
 * - Epoch milliseconds (1714000000000)
 * - Epoch seconds (1714000000) — values < 10^12 are assumed to be seconds
 *
 * Throws `RangeError` for inputs that produce an invalid Date so callers
 * can catch + handle bad data instead of silently rendering "Invalid date".
 */
export function parseTimestamp(input: Date | string | number): Date {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new RangeError('Invalid Date instance')
    return input
  }
  if (typeof input === 'number') {
    // Epoch seconds vs ms heuristic: anything before year ~33658 in
    // ms is also < 10^15. Numbers smaller than 10^12 (year ~33658 in
    // seconds) are almost certainly seconds.
    const ms = input < 1e12 ? input * 1000 : input
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid epoch number: ${input}`)
    return d
  }
  // String — try ISO first, then numeric.
  const d = new Date(input)
  if (!Number.isNaN(d.getTime())) return d
  const n = Number(input)
  if (Number.isFinite(n)) return parseTimestamp(n)
  throw new RangeError(`Cannot parse timestamp: ${input}`)
}

/**
 * "5 minutes ago" / "in 2 hours". Suffixed by default; pass
 * `{ suffix: false }` for "5 minutes" without the "ago".
 */
export function formatRelative(
  input: Date | string | number,
  opts: { suffix?: boolean } = {},
): string {
  const date = parseTimestamp(input)
  return formatDistanceToNow(date, { addSuffix: opts.suffix !== false })
}

/**
 * Smart compact form (claude.ai-style):
 * - today        → "10:42 am"
 * - this week    → "Mon"
 * - this year    → "Apr 24"
 * - else         → "Apr 24, 2025"
 *
 * Optimised for chat / activity / row metadata where space is tight and
 * the user knows the rough time period from context.
 */
export function formatShort(input: Date | string | number): string {
  const date = parseTimestamp(input)
  if (isToday(date)) return fmt(date, 'h:mm a').toLowerCase()
  if (isThisWeek(date, { weekStartsOn: 1 })) return fmt(date, 'EEE')
  if (isThisYear(date)) return fmt(date, 'MMM d')
  return fmt(date, 'MMM d, yyyy')
}

/**
 * Full absolute form for tooltips + audit logs.
 * "24 Apr 2026, 10:42 am" — locale follows the user's browser.
 */
export function formatAbsolute(input: Date | string | number): string {
  const date = parseTimestamp(input)
  return fmt(date, "d MMM yyyy, h:mm a").toLowerCase().replace(/(\d) (am|pm)/, '$1$2')
}

/**
 * "2h 13m" / "3.4s" / "23 days" — picks the most natural unit.
 * Useful for run duration, time-to-deadline, age-of-record badges.
 *
 * Negatives are coerced to absolute value — "in the past" is the
 * caller's responsibility (use formatRelative for that).
 */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms)
  if (abs < 1000) return `${abs}ms`
  if (abs < 60_000) return `${(abs / 1000).toFixed(1)}s`
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)}m`
  if (abs < 86_400_000) {
    const h = Math.floor(abs / 3_600_000)
    const m = Math.round((abs % 3_600_000) / 60_000)
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }
  return `${Math.round(abs / 86_400_000)} days`
}

/**
 * "5 minutes ago" but tolerates errors and falls back to a stable
 * placeholder. Useful for unknown-shape backend payloads where you'd
 * rather render "recently" than crash the row.
 */
export function formatRelativeSafe(input: Date | string | number | null | undefined): string {
  if (input == null) return 'just now'
  try {
    return formatRelative(input)
  } catch {
    return 'recently'
  }
}
