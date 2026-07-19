/**
 * SegmentedBar + SeriesLegend — CF-dashboard distribution idiom.
 *
 * SegmentedBar is the 100%-stacked horizontal bar Cloudflare uses for
 * status-code splits, storage composition, and quota breakdowns: each
 * segment's width is its share of the total. Pair it with SeriesLegend
 * (dot + label + value) — CF always renders the two together because
 * the bar alone isn't label-readable.
 *
 *   <SegmentedBar segments={[
 *     { label: '2xx', value: 179_730 },
 *     { label: '3xx', value: 78_460 },
 *     { label: '4xx', value: 102_490, className: 'bg-warning' },
 *     { label: '5xx', value: 172, className: 'bg-destructive' },
 *   ]} />
 *   <SeriesLegend items={...same array...} />
 *
 * Colors: explicit `className` (e.g. "bg-destructive") wins; otherwise
 * segments cycle through the --chart-1..5 tokens by index. Pass the
 * SAME array to both components so colors stay aligned.
 *
 * Not a Meter (single value in a range) and not a BreakdownList
 * (per-item bars against a max) — this shows composition of a whole.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

/** Shared index → chart-token color cycle (bar fills + legend dots). */
const CHART_BG = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5']
export function chartColorClass(index: number): string {
  return CHART_BG[index % CHART_BG.length] as string
}

export interface SegmentItem {
  label: string
  value: number
  /** Fill override, e.g. "bg-destructive". Defaults to chart-token cycle. */
  className?: string
}

interface SegmentedBarProps {
  segments: SegmentItem[]
  /** Bar thickness (Tailwind height class). */
  heightClassName?: string
  className?: string
  /** Accessible summary; defaults to "label value, label value, …". */
  label?: string
}

export function SegmentedBar({
  segments,
  heightClassName = 'h-2',
  className,
  label,
}: SegmentedBarProps) {
  const shown = segments.filter((s) => Number.isFinite(s.value) && s.value > 0)
  const total = shown.reduce((sum, s) => sum + s.value, 0)
  // Summary announces what the bar can actually draw (finite values,
  // zeros included for completeness) — never NaN or negatives the
  // visual silently dropped.
  const summary =
    label ??
    segments
      .filter((s) => Number.isFinite(s.value) && s.value >= 0)
      .map((s) => `${s.label} ${s.value.toLocaleString()}`)
      .join(', ')

  return (
    <div
      data-slot="segmented-bar"
      role="img"
      aria-label={summary}
      className={cn(
        'flex w-full gap-px overflow-hidden rounded-full',
        total === 0 && 'bg-muted',
        heightClassName,
        className
      )}
    >
      {total > 0 &&
        shown.map((s) => {
          // Index into the ORIGINAL array so legend colors stay aligned
          // even when zero-value segments are dropped from the bar.
          const originalIndex = segments.indexOf(s)
          return (
            <div
              key={`${s.label}-${originalIndex}`}
              className={cn('h-full', s.className ?? chartColorClass(originalIndex))}
              // minWidth keeps trace segments (the 172-of-360k 5xx case)
              // visible; with MANY tiny segments widths can sum past 100%
              // and overflow-hidden clips the tail — cap segment count
              // upstream if that matters.
              style={{ width: `${(s.value / total) * 100}%`, minWidth: '2px' }}
            />
          )
        })}
    </div>
  )
}

interface SeriesLegendProps {
  items: SegmentItem[]
  formatValue?: (value: number) => React.ReactNode
  /** Hide values, showing labels only (chart legends without counts). */
  hideValues?: boolean
  className?: string
}

export function SeriesLegend({ items, formatValue, hideValues, className }: SeriesLegendProps) {
  return (
    <div
      data-slot="series-legend"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}
    >
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1.5 text-xs">
          <span
            aria-hidden
            className={cn('size-2 shrink-0 rounded-full', item.className ?? chartColorClass(i))}
          />
          <span className="text-muted-foreground">{item.label}</span>
          {!hideValues && (
            <span className="font-medium tabular-nums">
              {formatValue ? formatValue(item.value) : item.value.toLocaleString()}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

SegmentedBar.displayName = 'SegmentedBar'
SeriesLegend.displayName = 'SeriesLegend'
