import { useEffect, useRef } from 'react'
import { usePreferences, useUpdatePreferences } from './useSettings'
import { getBrowserTimezone } from '@/lib/timezones'

/**
 * One-shot browser-timezone detection — auto-populates `preferences.timezone`
 * on first sign-in for users who haven't set one explicitly.
 *
 * Mounted in `DashboardLayout` so it fires once per app load for any
 * authenticated user. The PATCH is gated by a ref so a re-render never
 * triggers a duplicate write within the same session.
 *
 * Why this matters: routine schedules (reflect, heartbeat, etc.) need a
 * server-side timezone to fire at sensible local hours. Without auto-
 * detect, every new user would default to UTC until they manually set a
 * timezone in Settings — which most never would.
 *
 * Behaviour:
 *  - Preferences not loaded yet → no-op
 *  - `preferences.timezone` already set (string) → no-op
 *  - `preferences.timezone` null/undefined AND browser exposes a valid
 *    IANA tz → PATCH preferences with the detected tz
 *  - PATCH fails → silent (will retry on next app load)
 */
export function useEnsureTimezone(): void {
  const { data: preferences, isLoading } = usePreferences()
  const updatePreferences = useUpdatePreferences()
  const hasAttempted = useRef(false)

  useEffect(() => {
    if (isLoading) return
    if (!preferences) return
    if (hasAttempted.current) return
    if (preferences.timezone) return

    const detected = getBrowserTimezone()
    if (!detected) return

    hasAttempted.current = true
    updatePreferences.mutate(
      { ...preferences, timezone: detected },
      {
        onError: () => {
          // Allow retry on next app load — clear the gate so the next
          // mount re-attempts. Within this session we still don't loop.
          hasAttempted.current = false
        },
      }
    )
  }, [preferences, isLoading, updatePreferences])
}
