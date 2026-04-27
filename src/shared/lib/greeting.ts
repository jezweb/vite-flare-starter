/**
 * Single source-of-truth greeting helper.
 *
 * Both the dashboard home and the chat empty state used to compute
 * their own time-of-day string with different hour cutoffs, producing
 * "Good evening" on one surface and "Good night" on another at the
 * same minute. This helper unifies the rule.
 */

/**
 * Returns "Good morning" / "Good afternoon" / "Good evening" / "Good night"
 * based on the supplied hour (0-23). Defaults to local time.
 *
 * Cutoffs intentionally match the chat module's prior logic:
 *   - 0-4   → night
 *   - 5-11  → morning
 *   - 12-16 → afternoon
 *   - 17-20 → evening
 *   - 21-23 → night
 */
export function getGreeting(hour: number = new Date().getHours()): string {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Good night'
}
