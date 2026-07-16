/**
 * Shared ECharts core for Kumo chart components.
 *
 * Kumo's `Chart` / `TimeseriesChart` take the ECharts instance as a prop so
 * the consumer controls which modules get bundled (tree-shaking). This module
 * registers the minimal set the starter's charts need — import `echarts` from
 * here and pass it to the Kumo component. Add chart types (PieChart, …) or
 * components here as new surfaces need them.
 *
 * Keep this import inside route-lazy pages only: ECharts is the heavyweight
 * dependency (~340KB min), and it stays out of the entry bundle as long as
 * every importer is a `lazy()` route chunk (AgentObservabilityPage today).
 */
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  AriaComponent,
  BrushComponent,
  GridComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useMemo } from 'react'

import { useResolvedMode } from '@/client/components/theme-provider'

// Brush + Toolbox are TimeseriesChart internals (time-range selection);
// Aria backs its `ariaDescription` / screen-reader support.
echarts.use([
  BarChart,
  LineChart,
  AriaComponent,
  BrushComponent,
  GridComponent,
  ToolboxComponent,
  TooltipComponent,
  CanvasRenderer,
])

export { echarts }

/**
 * Resolve a CSS custom property (e.g. `--chart-1`) to a concrete color string
 * ECharts can use on canvas. Our tokens are `light-dark(oklch(…), oklch(…))`
 * expressions — canvas (and Kumo's gradient helper, which only parses
 * hex/rgb) can't consume those, so we:
 *   1. apply the var to a probe element and read the *computed* color, which
 *      resolves light-dark() against the current color-scheme
 *   2. paint a 1×1 canvas and read the pixel back, which clamps any modern
 *      color syntax (oklch, color-mix, …) into sRGB `#rrggbb` / `rgba(…)`.
 *      (A bare fillStyle readback is NOT enough — Chromium serialises modern
 *      syntaxes back verbatim, and `oklch(…)` reaching Kumo's hex-only
 *      gradient parser paints `rgba(NaN,…)` and kills the whole series.)
 */
export function resolveCssColor(cssVar: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${cssVar})`
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()

  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return computed
  ctx.fillStyle = computed
  ctx.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data
  if (a === 255) {
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${hex(r)}${hex(g)}${hex(b)}`
  }
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
}

/**
 * Resolve theme tokens to canvas-safe colors, re-resolving when the rendered
 * color mode flips (light ⇄ dark) so charts follow the theme live.
 *
 * Returns colors in the same order as the vars passed in. Also returns the
 * resolved mode so callers can feed Kumo's `isDarkMode` prop from the same
 * source of truth.
 */
export function useChartTheme<const T extends readonly string[]>(
  ...cssVars: T
): {
  colors: { [K in keyof T]: string }
  isDarkMode: boolean
} {
  const mode = useResolvedMode()
  const key = cssVars.join(',')
  const colors = useMemo(
    () => key.split(',').filter(Boolean).map(resolveCssColor),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key encodes the var list; mode triggers re-resolution
    [key, mode]
  ) as { [K in keyof T]: string }
  return { colors, isDarkMode: mode === 'dark' }
}
