/**
 * Single source-of-truth greeting helper.
 *
 * Both the dashboard home and the chat empty state used to compute
 * their own time-of-day string with different hour cutoffs, producing
 * "Good evening" on one surface and "Good night" on another at the
 * same minute. This helper unifies the rule.
 */

/**
 * Returns a time-of-day greeting for the supplied hour (0-23).
 * Defaults to local time.
 *
 * Cutoffs:
 *   - 0-4   → "Hello"          (late-night workers; "Good morning" feels
 *                                premature at 2am, "Good night" reads as
 *                                a farewell — neutral hello sidesteps both)
 *   - 5-11  → "Good morning"
 *   - 12-16 → "Good afternoon"
 *   - 17-23 → "Good evening"   (evening covers all the way to midnight;
 *                                no "Good night" branch — that's a bedtime
 *                                farewell, not a greeting at the start of work)
 */
export function getGreeting(hour: number = new Date().getHours()): string {
  if (hour < 5) return 'Hello'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
