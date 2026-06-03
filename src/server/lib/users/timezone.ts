/**
 * User timezone resolver — server-side helper for code that needs to
 * fire work at a user's local time (routine scheduler, reflection
 * skills, daily digests, anything time-of-day-sensitive).
 *
 * Reads `user.preferences.timezone` (IANA string, e.g. `Australia/Sydney`).
 * Falls back to UTC when:
 *   - the user has no preferences row
 *   - preferences exist but `timezone` is null/undefined
 *   - the stored value isn't a valid IANA tz
 *
 * The client mounts `useEnsureTimezone` in the dashboard layout, which
 * auto-detects the browser tz on first sign-in and PATCHes the
 * preferences. This function should rarely return UTC for an active
 * user — UTC is the safe fallback for never-signed-in users + edge
 * cases.
 */
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { user } from '@/server/modules/auth/db/schema'
import { isValidTimezone } from '@/lib/timezones'

export const DEFAULT_TIMEZONE = 'UTC'

/**
 * Look up a user's IANA timezone. Always returns a valid string —
 * UTC when the user hasn't configured one or the stored value is
 * invalid. Cheap (single indexed lookup) but cache at the call site
 * if firing in a hot loop.
 */
export async function getUserTimezone(db: D1Database, userId: string): Promise<string> {
  if (!userId) return DEFAULT_TIMEZONE
  try {
    const rows = await drizzle(db)
      .select({ preferences: user.preferences })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    const prefs = rows[0]?.preferences
    const tz = prefs?.timezone
    if (typeof tz === 'string' && tz.trim() !== '' && isValidTimezone(tz)) {
      return tz
    }
    return DEFAULT_TIMEZONE
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: 'get_user_timezone_failed',
        userId,
        error: err instanceof Error ? err.message : String(err),
      })
    )
    return DEFAULT_TIMEZONE
  }
}

/**
 * Compute the local hour (0-23) for a given user. Useful for routines
 * that fire only when the user's local time matches a configured hour
 * (e.g. "fire reflect at 22:00 local").
 */
export function localHourFor(timezone: string, when: Date = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    })
    const hour = parseInt(formatter.format(when), 10)
    if (Number.isNaN(hour)) return when.getUTCHours()
    return hour
  } catch {
    return when.getUTCHours()
  }
}
