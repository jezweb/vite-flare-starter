/**
 * Single source of truth for relative + absolute time labels in the UI.
 *
 * Lock to one rule across every surface:
 *   < 60s          → "just now"
 *   < 60m          → "5m ago"
 *   < 24h          → "6h ago"
 *   < 7d           → "3d ago"
 *   ≥ 7d           → "19 Apr"           (same year)
 *   different year → "19 Apr 2024"
 *
 * Why fixed: the dashboard, project cards, inbox rows, and spaces messages
 * were each picking their own format (`6h ago` vs `19/04/2026` vs full
 * datetime), which reads as "different developers" to a design-conscious
 * eye. One helper, one rule, used everywhere.
 *
 * Accepts: ISO string, epoch seconds (number), or Date.
 */

const MONTH_DAY = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' })
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatRelative(input: string | number | Date | null | undefined): string {
  if (input == null) return ''
  const date = toDate(input)
  if (!date) return ''

  const now = Date.now()
  const ms = now - date.getTime()
  const seconds = Math.floor(ms / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`

  // ≥ 7 days — switch to absolute, drop year if same as current
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return sameYear ? MONTH_DAY.format(date) : MONTH_DAY_YEAR.format(date)
}

/**
 * Same scheme but with a leading verb — e.g. "Updated 6h ago" /
 * "Updated 19 Apr". Use on cards / list rows where the time is
 * accompanied by a label.
 */
export function formatRelativeWithPrefix(
  prefix: string,
  input: string | number | Date | null | undefined
): string {
  const rel = formatRelative(input)
  if (!rel) return ''
  return `${prefix} ${rel}`
}

function toDate(input: string | number | Date): Date | null {
  if (input instanceof Date) return isFinite(input.getTime()) ? input : null
  if (typeof input === 'number') {
    // Epoch seconds (< 1e12) vs ms (≥ 1e12) — both common in this codebase
    const ms = input < 1e12 ? input * 1000 : input
    const d = new Date(ms)
    return isFinite(d.getTime()) ? d : null
  }
  const d = new Date(input)
  return isFinite(d.getTime()) ? d : null
}
