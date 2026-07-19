/**
 * RadialGauge — CF-dashboard "billable usage" circle: a value in a
 * known range as a ring, with the number in the middle. The radial
 * sibling of Meter (linear) — same semantics (role="meter"), different
 * shape. Reach for this for at-a-glance quota/budget/progress circles;
 * use Meter in dense settings lists.
 *
 * Inline SVG (no ECharts): arc color comes from `currentColor`, so set
 * it with a text-* class — and like Meter, it adopts the CF threshold
 * idiom automatically when `warnAt` is given (arc flips to warning /
 * destructive as usage approaches max).
 *
 *   <RadialGauge value={6.2} max={10} format={(v) => `$${v.toFixed(2)}`}
 *     label="Budget used" warnAt={0.8} />
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

interface RadialGaugeProps {
  value: number
  max: number
  /** Center line, defaults to value.toLocaleString(). */
  format?: (value: number, max: number) => React.ReactNode
  /**
   * Accessible name AND center caption ("Budget used"). Name the
   * measurement, not the range — falls back to "value of max".
   */
  label?: string
  /** Rendered size in px (square). */
  size?: number
  strokeWidth?: number
  /**
   * Fraction of max (0..1) where the arc flips to warning tone;
   * >= 100% flips to destructive. Omit for a single-tone gauge.
   */
  warnAt?: number
  className?: string
}

export function RadialGauge({
  value,
  max,
  format,
  label,
  size = 112,
  strokeWidth = 8,
  warnAt,
  className,
}: RadialGaugeProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1
  const safeValue = Number.isFinite(value) ? value : 0
  const clamped = Math.min(Math.max(safeValue, 0), safeMax)
  const fraction = clamped / safeMax
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const tone =
    warnAt !== undefined && fraction >= 1
      ? 'text-destructive'
      : warnAt !== undefined && fraction >= warnAt
        ? 'text-warning'
        : 'text-primary'

  return (
    <div
      data-slot="radial-gauge"
      role="meter"
      // ARIA mirrors the sanitised values the arc draws — a raw max of
      // 0/NaN or an over-cap value would otherwise announce an invalid
      // meter (valuenow > valuemax) to assistive tech.
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label ?? `${safeValue.toLocaleString()} of ${safeMax.toLocaleString()}`}
      className={cn('relative inline-flex items-center justify-center', tone, className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        {/* Progress arc — starts at 12 o'clock, sweeps clockwise. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground">
        <span className="text-lg font-semibold tracking-tight tabular-nums">
          {format ? format(value, max) : value.toLocaleString()}
        </span>
        {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
      </div>
    </div>
  )
}

RadialGauge.displayName = 'RadialGauge'
