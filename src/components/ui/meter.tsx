/**
 * Meter — a measured value within a known range (quota usage, storage,
 * budget burn). Kumo-anatomy: label + value line above a slim track.
 *
 * NOT a Progress bar: Progress is for indeterminate/ongoing operations;
 * Meter states "you are at 6.2 GB of 10 GB". Built on Base UI's Meter
 * primitive (proper role="meter" semantics for free).
 *
 *   <Meter label="Storage" value={6.2} max={10} format={(v) => `${v} GB`} />
 *
 * The track turns warning/destructive as usage approaches max (80% / 95%
 * by default) — the CF-dashboard quota idiom.
 */
import * as React from 'react'
import { Meter as BaseMeter } from '@base-ui/react/meter'
import { cn } from '@/lib/utils'

interface MeterProps {
  label?: React.ReactNode
  value: number
  min?: number
  max?: number
  /** Format the value/max for the trailing text (default: raw numbers). */
  format?: (value: number) => string
  /** Fraction of max where the fill turns warning / destructive. Pass null to disable. */
  thresholds?: { warning: number; danger: number } | null
  className?: string
}

const DEFAULT_THRESHOLDS = { warning: 0.8, danger: 0.95 }

export function Meter({
  label,
  value,
  min = 0,
  max = 100,
  format,
  thresholds = DEFAULT_THRESHOLDS,
  className,
}: MeterProps) {
  const fraction = max > min ? (value - min) / (max - min) : 0
  const fmt = format ?? ((v: number) => String(v))
  const fillClass =
    thresholds && fraction >= thresholds.danger
      ? 'bg-destructive'
      : thresholds && fraction >= thresholds.warning
        ? 'bg-warning'
        : 'bg-primary'

  return (
    <BaseMeter.Root value={value} min={min} max={max} className={cn('w-full', className)}>
      {(label || format) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label && <BaseMeter.Label className="text-sm font-medium">{label}</BaseMeter.Label>}
          <BaseMeter.Value className="text-xs text-muted-foreground tabular-nums">
            {() => `${fmt(value)} / ${fmt(max)}`}
          </BaseMeter.Value>
        </div>
      )}
      <BaseMeter.Track className="h-1.5 w-full overflow-hidden rounded-full bg-surface-recessed border border-hairline">
        <BaseMeter.Indicator
          className={cn('h-full rounded-full transition-all duration-300', fillClass)}
        />
      </BaseMeter.Track>
    </BaseMeter.Root>
  )
}
