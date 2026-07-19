/**
 * BreakdownList — CF-dashboard "Top N" shape: label + proportional bar
 * + right-aligned value. The workhorse of the Cloudflare analytics
 * dashboards (Top Paths / Hosts / Countries / Status Codes are all this
 * one component).
 *
 * Bars scale against the largest value (or an explicit `max`, e.g. the
 * grand total when you want bars to read as share-of-whole). Renders
 * plain rows by default; pass `onSelect` to make rows clickable.
 *
 * Compose inside DashboardPanel for the titled-card look:
 *
 *   <DashboardPanel title="Top paths">
 *     <BreakdownList items={paths.map(p => ({ label: p.path, value: p.hits }))} />
 *   </DashboardPanel>
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BreakdownItem {
  label: React.ReactNode
  value: number
  /** Formatted value cell; defaults to value.toLocaleString(). */
  display?: React.ReactNode
  /** Tooltip — useful when `label` truncates (paths, URLs). */
  title?: string
  /** Stable key when labels aren't unique strings. */
  key?: string
}

interface BreakdownListProps {
  items: BreakdownItem[]
  /** Scale denominator; defaults to the largest item value. */
  max?: number
  formatValue?: (value: number) => React.ReactNode
  /** Makes rows interactive (drill-down filters etc.). */
  onSelect?: (item: BreakdownItem, index: number) => void
  /** Bar fill override, e.g. "bg-chart-2". */
  barClassName?: string
  className?: string
}

export function BreakdownList({
  items,
  max,
  formatValue,
  onSelect,
  barClassName,
  className,
}: BreakdownListProps) {
  if (items.length === 0) return null
  const denominator = max ?? Math.max(...items.map((it) => it.value), 0)

  return (
    <div data-slot="breakdown-list" className={cn('flex flex-col', className)}>
      {items.map((item, i) => {
        // Zero must render as zero — the minimum visible width only
        // rescues small-but-real values from rounding to invisibility.
        const pct =
          denominator > 0 && item.value > 0
            ? Math.max((item.value / denominator) * 100, 0.75)
            : 0
        const display =
          item.display ?? (formatValue ? formatValue(item.value) : item.value.toLocaleString())
        const row = (
          <>
            <span className="min-w-0 truncate text-left text-sm" title={item.title}>
              {item.label}
            </span>
            <span
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="presentation"
            >
              <span
                className={cn('block h-full rounded-full bg-primary', barClassName)}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </span>
            <span className="text-right text-sm tabular-nums text-muted-foreground">
              {display}
            </span>
          </>
        )
        const rowClass =
          'grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-3 rounded px-1 py-1.5'
        return onSelect ? (
          <button
            key={item.key ?? `${i}`}
            type="button"
            onClick={() => onSelect(item, i)}
            className={cn(rowClass, 'cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50')}
          >
            {row}
          </button>
        ) : (
          <div key={item.key ?? `${i}`} className={rowClass}>
            {row}
          </div>
        )
      })}
    </div>
  )
}

BreakdownList.displayName = 'BreakdownList'
