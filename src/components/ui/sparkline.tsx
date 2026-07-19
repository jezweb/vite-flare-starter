/**
 * Sparkline — tiny inline SVG trend line (CF-dashboard style).
 *
 * Deliberately NOT ECharts: sparklines appear inside stat cards and list
 * rows on non-lazy routes, and pulling ECharts into those would drag it
 * into the entry bundle. Plain SVG also reads CSS color tokens natively
 * (no canvas hex resolution needed) — color comes from `currentColor`,
 * so set it with a text-* class on the component (default text-primary).
 *
 * Scales to its container's width; `preserveAspectRatio="none"` +
 * `vector-effect: non-scaling-stroke` keep the stroke crisp under
 * non-uniform stretch.
 *
 * Decorative by default (aria-hidden). Pass `label` when the trend is
 * the only place the information appears.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

/** Fixed internal coordinate space; the SVG stretches to fit. */
const VIEW_W = 100
const VIEW_H = 32
/** Keeps the stroke from clipping at the top/bottom edges. */
const PAD_Y = 2

export interface SparklineProps {
  data: number[]
  /** 'area' (default) fills a fading gradient under the line, CF-style. */
  variant?: 'line' | 'area'
  /** Rendered height in px. Width always fills the container. */
  height?: number
  strokeWidth?: number
  /** Accessible label; omit for purely decorative use. */
  label?: string
  className?: string
}

function buildPoints(data: number[]): Array<[number, number]> {
  // A single point can't draw a line (and its area path degenerates
  // into a triangle) — duplicate it into a full-width flat line.
  if (data.length === 1) data = [data[0] as number, data[0] as number]
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min
  return data.map((v, i) => {
    const x = (i / (data.length - 1)) * VIEW_W
    // Flat series renders as a midline rather than hugging an edge.
    const y =
      span === 0 ? VIEW_H / 2 : PAD_Y + (1 - (v - min) / span) * (VIEW_H - PAD_Y * 2)
    return [x, y]
  })
}

export function Sparkline({
  data,
  variant = 'area',
  height = 32,
  strokeWidth = 1.5,
  label,
  className,
}: SparklineProps) {
  // useId emits colon-wrapped ids — strip them so the url(#…) fragment
  // stays safe for any downstream CSS/querySelector consumption.
  const gradientId = React.useId().replace(/:/g, '')
  // One NaN/Infinity poisons Math.min/max and every path coordinate —
  // drop non-finite entries (sparse series) rather than rendering M0,NaN.
  const clean = data.filter((v) => Number.isFinite(v))
  if (clean.length === 0) return null

  const points = buildPoints(clean)
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const area = `${line} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`

  return (
    <svg
      data-slot="sparkline"
      className={cn('block w-full text-primary', className)}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {variant === 'area' && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

Sparkline.displayName = 'Sparkline'
