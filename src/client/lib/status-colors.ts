/**
 * Semantic status colour classes that work in both light and dark mode.
 *
 * Use these constants instead of bare Tailwind colour utilities (e.g. `text-green-500`)
 * for status indicators (success, info, warning, danger). They encode the dark-mode
 * counterpart so contrast remains correct under either theme.
 *
 * The shadcn semantic tokens (`bg-primary`, `bg-destructive`, etc.) should still be
 * preferred when applicable; this helper exists for the cases where we need a
 * specific traffic-light hue (e.g. distinguishing create vs. update vs. delete).
 */

export type StatusKind = 'success' | 'info' | 'warning' | 'danger'

/** Plain text colour for icons and inline labels. */
export const STATUS_TEXT: Record<StatusKind, string> = {
  success: 'text-green-600 dark:text-green-400',
  info: 'text-blue-600 dark:text-blue-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
}

/** Soft tinted background + matching text + border (alerts, badges, banners). */
export const STATUS_SOFT_BG: Record<StatusKind, string> = {
  success:
    'bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30',
  info:
    'bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  warning:
    'bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  danger:
    'bg-red-500/10 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
}

/** Solid filled status (e.g. completed step indicators on coloured circles). */
export const STATUS_SOLID: Record<StatusKind, string> = {
  success:
    'bg-green-600 dark:bg-green-500 text-white border-green-600 dark:border-green-500',
  info: 'bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500',
  warning:
    'bg-amber-500 dark:bg-amber-500 text-white border-amber-500',
  danger: 'bg-red-600 dark:bg-red-500 text-white border-red-600 dark:border-red-500',
}
