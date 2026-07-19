/**
 * AnalyticsDemoPage — `/dashboard/analytics-demo` (Builder section)
 *
 * A worked example of the CF-dashboard display kit composed into a full
 * analytics surface, in the shape of Cloudflare's "Traffic overview":
 *
 *   PageHeader + TimeRangePicker
 *   → KPI StatGrid (delta chips + sparkline strips)
 *   → TimeseriesChart panel (ECharts — this route is lazy)
 *   → SegmentedBar + SeriesLegend (status codes)
 *   → BreakdownList panels (top paths / countries)
 *   → RadialGauge (budget) + LogTail (recent events)
 *
 * All data is synthetic, seeded per range so switching ranges visibly
 * reshapes every panel without a backend. Copy this page, replace the
 * generators with queries, and you have a real dashboard.
 */
import { useMemo, useState } from 'react'
import { TimeseriesChart } from '@cloudflare/kumo/components/chart'

import { echarts, useChartTheme } from '@/client/lib/echarts'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { StatGrid } from '@/components/ui/stat-grid'
import { DashboardPanel } from '@/components/ui/dashboard-panel'
import { BreakdownList } from '@/components/ui/breakdown-list'
import { SegmentedBar, SeriesLegend } from '@/components/ui/segmented-bar'
import { TimeRangePicker } from '@/components/ui/time-range-picker'
import { RadialGauge } from '@/components/ui/radial-gauge'
import { LogTail, type LogLine } from '@/components/ui/log-tail'

// ─── Synthetic data (seeded per range — deterministic, no backend) ────

/** mulberry32 — tiny seeded PRNG so each range renders stable data. */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RANGE_CONFIG: Record<string, { seed: number; points: number; stepMs: number; scale: number }> = {
  '24h': { seed: 24, points: 48, stepMs: 30 * 60_000, scale: 1 },
  '7d': { seed: 7, points: 84, stepMs: 2 * 3_600_000, scale: 6.4 },
  '30d': { seed: 30, points: 60, stepMs: 12 * 3_600_000, scale: 27 },
}

function useSyntheticData(range: string) {
  return useMemo(() => {
    const cfg = RANGE_CONFIG[range] ?? (RANGE_CONFIG['24h'] as NonNullable<(typeof RANGE_CONFIG)[string]>)
    const rand = rng(cfg.seed)
    const now = Date.now()
    const series: Array<[number, number]> = Array.from({ length: cfg.points }, (_, i) => {
      // Diurnal wave + noise, CF-traffic-shaped.
      const phase = (i / cfg.points) * Math.PI * 4
      const v = Math.round((6_000 + 3_500 * Math.sin(phase) + 4_000 * rand()) * cfg.scale)
      return [now - (cfg.points - 1 - i) * cfg.stepMs, Math.max(v, 200)]
    })
    const values = series.map(([, v]) => v)
    const total = values.reduce((a, b) => a + b, 0)
    const scale = (n: number) => Math.round(n * cfg.scale)
    return {
      series,
      values,
      total,
      visits: Math.round(total * 0.126),
      cacheHitPct: 28 + rand() * 12,
      bandwidthGb: (total / 56_000) * cfg.scale ** 0.15,
      statusCodes: [
        { label: '2xx', value: Math.round(total * 0.72) },
        { label: '3xx', value: Math.round(total * 0.14) },
        { label: '4xx', value: Math.round(total * 0.13), className: 'bg-warning' },
        { label: '5xx', value: Math.round(total * 0.003), className: 'bg-destructive' },
      ],
      topPaths: [
        { label: '/', value: scale(38_630) },
        { label: '/api/image', value: scale(21_860) },
        { label: '/api/search/autocomplete', value: scale(6_300) },
        { label: '/robots.txt', value: scale(4_770) },
        { label: '/api/pending', value: scale(3_090) },
        { label: '/widget.js', value: scale(2_660) },
      ],
      countries: [
        { label: 'Australia', value: scale(106_170) },
        { label: 'Netherlands', value: scale(85_630) },
        { label: 'United States', value: scale(47_830) },
        { label: 'Brazil', value: scale(33_120) },
        { label: 'France', value: scale(21_240) },
        { label: 'Germany', value: scale(19_700) },
      ],
      devices: [
        { label: 'Desktop', value: scale(333_100) },
        { label: 'Mobile', value: scale(23_410) },
        { label: 'Tablet', value: scale(4_370) },
      ],
    }
  }, [range])
}

/** Same helper the observability page uses — per-day-average delta. */
function halfDelta(series: number[]): number | undefined {
  if (series.length < 2) return undefined
  const mid = Math.floor(series.length / 2)
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const first = avg(series.slice(0, mid))
  if (first <= 0) return undefined
  return ((avg(series.slice(mid)) - first) / first) * 100
}

/**
 * Built per mount (NOT module scope — a module-level Date.now() freezes
 * the moment the chunk loads, so "1 minute ago" quietly ages forever in
 * a long-lived SPA session).
 */
function buildDemoLog(now: number): LogLine[] {
  return [
    { id: 'l1', ts: now - 4 * 60_000, level: 'info', text: 'GET /api/search/autocomplete 200 · 42ms · SYD' },
    { id: 'l2', ts: now - 3 * 60_000, level: 'info', text: 'POST /api/entities 201 · 88ms · SYD' },
    {
      id: 'l3',
      ts: now - 2 * 60_000,
      level: 'warn',
      text: 'GET /api/image 429 · rate limited · AMS',
      detail: '{\n  "ray": "8f3c2a1b9d4e",\n  "colo": "AMS",\n  "limit": "100 req/min",\n  "clientIP": "203.0.113.7"\n}',
    },
    {
      id: 'l4',
      ts: now - 60_000,
      level: 'error',
      text: 'GET /api/export 500 · D1_ERROR · SYD',
      detail: '{\n  "ray": "8f3c2b774a01",\n  "error": "D1_ERROR: no such table: exports",\n  "stack": "at prepareExport (worker.js:1204)"\n}',
    },
    { id: 'l5', ts: now - 20_000, level: 'info', text: 'GET / 200 · 12ms · cached · SYD' },
  ]
}

// ─── Page ─────────────────────────────────────────────────────────────

const DEMO_RANGES = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

export function AnalyticsDemoPage() {
  const [range, setRange] = useState('24h')
  const data = useSyntheticData(range)
  const demoLog = useMemo(() => buildDemoLog(Date.now()), [])
  // isDarkMode is the ECharts-only escape hatch: canvas can't read CSS
  // light-dark(), so the chart alone needs a JS theme signal. Never
  // copy this pattern for DOM styling.
  const {
    colors: [requestsColor],
    isDarkMode,
  } = useChartTheme('--chart-1')

  const delta = halfDelta(data.values)
  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

  return (
    <PageContainer type="hub">
      <PageHeader
        title="Analytics demo"
        subtitle="The CF-dashboard display kit composed into a full surface — synthetic data, every panel is a copyable pattern."
        trailing={<TimeRangePicker value={range} onValueChange={setRange} options={DEMO_RANGES} />}
      />

      {/* KPI row — StatCard v2 with delta chips + sparkline strips */}
      <StatGrid
        items={[
          { label: 'Total requests', value: fmt(data.total), delta, sparkline: data.values },
          { label: 'Total visits', value: fmt(data.visits), delta: delta !== undefined ? delta * 0.8 : undefined, sparkline: data.values.map((v) => v * 0.126) },
          {
            label: 'Cache hit rate',
            value: `${data.cacheHitPct.toFixed(1)}%`,
            delta: (data.cacheHitPct - 32) / 2,
            deltaTone: 'signal',
            sparkline: data.values.map((v, i) => 40 - Math.sin(i / 5) * 4 - (v % 977) / 300),
          },
          { label: 'Bandwidth', value: `${data.bandwidthGb.toFixed(2)} GB`, delta: 1.0, sparkline: data.values.map((v) => v / 56) },
        ]}
      />

      {/* Requests over time — the one ECharts panel (route is lazy) */}
      <DashboardPanel
        title="Requests over time"
        actions={<SeriesLegend items={[{ label: 'Requests', value: data.total }]} formatValue={(v) => fmt(v)} />}
      >
        <TimeseriesChart
          echarts={echarts}
          data={[{ name: 'Requests', color: requestsColor, data: data.series }]}
          type="line"
          gradient
          isDarkMode={isDarkMode}
          height={240}
          yAxisTickFormat={(v) => fmt(v)}
          tooltipValueFormat={(v) => v.toLocaleString()}
          tooltipFollowCursor="x"
          ariaDescription="Synthetic request volume over the selected range"
        />
      </DashboardPanel>

      {/* Status codes — SegmentedBar + SeriesLegend pair */}
      <DashboardPanel title="Status codes">
        <div className="space-y-3">
          <SeriesLegend items={data.statusCodes} formatValue={(v) => fmt(v)} />
          <SegmentedBar segments={data.statusCodes} heightClassName="h-3" />
        </div>
      </DashboardPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardPanel title="Top paths" actions={<span className="text-xs text-muted-foreground">by requests</span>}>
          <BreakdownList items={data.topPaths.map((p) => ({ ...p, title: p.label }))} formatValue={(v) => fmt(v)} />
        </DashboardPanel>
        <DashboardPanel title="Requests by country">
          <BreakdownList items={data.countries} formatValue={(v) => fmt(v)} />
        </DashboardPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Budget/quota — RadialGauge idiom */}
        <DashboardPanel title="Monthly budget">
          <div className="flex items-center gap-6">
            <RadialGauge
              value={Math.min(data.total / 400_000, 5)}
              max={5}
              warnAt={0.8}
              format={(v) => `$${v.toFixed(2)}`}
              label="Budget used"
            />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Workers paid plan</p>
              <p className="text-muted-foreground">
                Gauge flips to warning at 80%, destructive at the cap — the CF
                threshold idiom, shared with Meter.
              </p>
            </div>
          </div>
        </DashboardPanel>

        {/* Device split — SeriesLegend + SegmentedBar again, smaller */}
        <DashboardPanel title="Requests by device type">
          <div className="space-y-3">
            <SeriesLegend items={data.devices} formatValue={(v) => fmt(v)} />
            <SegmentedBar segments={data.devices} />
          </div>
        </DashboardPanel>
      </div>

      {/* Live tail — LogTail with expandable detail rows */}
      <DashboardPanel
        title="Recent events"
        actions={<span className="text-xs text-muted-foreground">wrangler-tail idiom · click rows with a caret</span>}
        bodyClassName="p-0"
      >
        <LogTail lines={demoLog} maxHeight={260} className="rounded-none border-0" />
      </DashboardPanel>
    </PageContainer>
  )
}

export default AnalyticsDemoPage
