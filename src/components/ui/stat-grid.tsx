/**
 * StatGrid + StatCard — replaces hand-rolled stat rows on Admin / Files
 * / Activity. Up to 4 stats, even widths, consistent typography.
 *
 * Layout (CF-dashboard KPI shape):
 *   ┌─────────────────┬─────────────────┐
 *   │ LABEL           │ LABEL           │
 *   │ Big number ↑12% │ Big number      │
 *   │ optional sub    │ optional sub    │
 *   │ ~~sparkline~~   │                 │
 *   └─────────────────┴─────────────────┘
 *
 * `delta` renders a directional change chip beside the value; `sparkline`
 * renders a full-bleed trend strip hugging the card's bottom edge. Both
 * optional — existing plain-number consumers are unaffected.
 *
 * Use the `items` prop for declarative use, or pass children for
 * custom row shapes. `items` is preferred — it forces consistency.
 */
import * as React from 'react'
import { ArrowDown, ArrowUp } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Sparkline } from '@/components/ui/sparkline'

export interface StatItem {
  label: string
  value: React.ReactNode
  /** Optional secondary line (e.g. "this week"). */
  sub?: React.ReactNode
  /** Optional accent for the value (e.g. "text-emerald-600"). */
  valueClassName?: string
  /**
   * Percent change vs the previous period; the arrow follows the sign.
   * CF convention renders it muted — pass deltaTone="signal" for
   * green-up / red-down colouring when direction implies good/bad.
   */
  delta?: number
  deltaTone?: 'neutral' | 'signal'
  /** Trend series rendered as a full-bleed strip at the card's bottom. */
  sparkline?: number[]
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

function DeltaChip({ delta, tone = 'neutral' }: { delta: number; tone?: 'neutral' | 'signal' }) {
  const up = delta >= 0
  const Arrow = up ? ArrowUp : ArrowDown
  return (
    <span
      data-slot="stat-delta"
      className={cn(
        'inline-flex items-baseline gap-0.5 text-xs font-medium tabular-nums',
        tone === 'neutral' && 'text-muted-foreground',
        tone === 'signal' && (up ? 'text-success' : 'text-destructive')
      )}
    >
      <Arrow className="size-3 self-center" aria-hidden />
      <span className="sr-only">{up ? 'up' : 'down'} </span>
      {Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 1 })}%
    </span>
  )
}

export function StatCard({
  label,
  value,
  sub,
  valueClassName,
  delta,
  deltaTone,
  sparkline,
}: StatItem) {
  const hasSparkline = sparkline !== undefined && sparkline.length > 0
  return (
    <div
      data-slot="stat-card"
      className={cn('rounded-md border bg-card', hasSparkline ? 'overflow-hidden pt-3' : 'p-3')}
    >
      <div className={cn(hasSparkline && 'px-3')}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            'mt-1 flex items-baseline gap-1.5 text-2xl font-semibold tracking-tight tabular-nums',
            valueClassName
          )}
        >
          {value}
          {delta !== undefined && <DeltaChip delta={delta} tone={deltaTone} />}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {hasSparkline && (
        <div className="mt-2">
          <Sparkline data={sparkline} height={36} />
        </div>
      )}
    </div>
  )
}

StatGrid.displayName = 'StatGrid'
StatCard.displayName = 'StatCard'
