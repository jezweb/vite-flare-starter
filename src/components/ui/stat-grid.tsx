/**
 * StatGrid + StatCard — replaces hand-rolled stat rows on Admin / Files
 * / Activity. Up to 4 stats, even widths, consistent typography.
 *
 * Layout:
 *   ┌─────────────────┬─────────────────┬─────────────────┐
 *   │ LABEL           │ LABEL           │ LABEL           │
 *   │ Big number      │ Big number      │ Big number      │
 *   │ optional sub    │ optional sub    │ optional sub    │
 *   └─────────────────┴─────────────────┴─────────────────┘
 *
 * Use the `items` prop for declarative use, or pass children for
 * custom row shapes. `items` is preferred — it forces consistency.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface StatItem {
  label: string
  value: React.ReactNode
  /** Optional secondary line (e.g. "this week", "+12%"). */
  sub?: React.ReactNode
  /** Optional accent for the value (e.g. "text-emerald-600"). */
  valueClassName?: string
}

interface StatGridProps {
  items: StatItem[]
  className?: string
}

export function StatGrid({ items, className }: StatGridProps) {
  const cols = Math.min(items.length, 4)
  return (
    <div
      data-slot="stat-grid"
      className={cn(
        'grid gap-3',
        cols === 1 && 'grid-cols-1',
        cols === 2 && 'grid-cols-2',
        cols === 3 && 'grid-cols-2 sm:grid-cols-3',
        cols === 4 && 'grid-cols-2 sm:grid-cols-4',
        className
      )}
    >
      {items.map((it, i) => (
        <StatCard key={`${it.label}-${i}`} {...it} />
      ))}
    </div>
  )
}

export function StatCard({ label, value, sub, valueClassName }: StatItem) {
  return (
    <div data-slot="stat-card" className="rounded-md border bg-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', valueClassName)}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

StatGrid.displayName = 'StatGrid'
StatCard.displayName = 'StatCard'
