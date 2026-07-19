/**
 * DashboardPanel — CF-dashboard titled panel shell: recessed header
 * strip (title left, actions right) over a card body. Every analytics
 * panel on the Cloudflare dashboard is this shape; composing it with
 * Sparkline / BreakdownList / Chart gives the CF-style dashboard grid
 * without each page re-rolling its own header row.
 *
 * Differs from Card/CardHeader: the header is a visually distinct strip
 * (recessed tint + hairline divider) with a slot for controls — range
 * selects, bar⇄chart toggles, kebab menus — rather than in-flow heading
 * text. Use Card for prose-y content; DashboardPanel for data panels.
 *
 * `bodyClassName="p-0"` for flush content (tables, full-bleed charts).
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

interface DashboardPanelProps {
  title: React.ReactNode
  /** Right-hand header slot: selects, toggles, menus. */
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

export function DashboardPanel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: DashboardPanelProps) {
  return (
    <section
      data-slot="dashboard-panel"
      className={cn('overflow-hidden rounded-md border bg-card', className)}
    >
      <header className="flex min-h-10 items-center justify-between gap-2 border-b border-hairline bg-surface-recessed/60 px-4 py-1.5">
        <h3 className="truncate text-sm font-medium">{title}</h3>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </header>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

DashboardPanel.displayName = 'DashboardPanel'
