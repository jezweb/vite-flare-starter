/**
 * AgentObservabilityPage — `/dashboard/agent-observability`
 *
 * Surfaces the agent_runs audit log, CF-dashboard style:
 *   - KPI StatGrid (runs / cost) with range deltas + sparkline trends
 *   - Runs per agent class (BreakdownList) — answers "what's running?"
 *   - Cost per day (TimeseriesChart) — answers "where's spend going?"
 *
 * Only the time-axis cost chart uses ECharts (Kumo's TimeseriesChart);
 * categorical breakdowns use the plain-DOM BreakdownList and KPI trends
 * use the inline-SVG Sparkline, so ECharts stays confined to this lazy
 * route. The chart's series color resolves from --chart-2 to canvas-safe
 * hex via useChartTheme (src/client/lib/echarts.ts) so light/dark and
 * fork rebrands carry through.
 *
 * For per-run drilldown: `GET /api/agent-observability/runs/:id`. The
 * Dashboard "Recent runs" panel shows the live tail (last 8). This
 * page is the historical view.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TimeseriesChart } from '@cloudflare/kumo/components/chart'
import { ChartBar } from '@phosphor-icons/react'

import { apiClient } from '@/client/lib/api-client'
import { echarts, useChartTheme } from '@/client/lib/echarts'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { BreakdownList } from '@/components/ui/breakdown-list'
import { DashboardPanel } from '@/components/ui/dashboard-panel'
import { StatGrid } from '@/components/ui/stat-grid'
import { EmptyState } from '@/client/components/EmptyState'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatAgentClass } from '@/shared/format/agent'

type Range = '7d' | '14d' | '30d' | '90d'

interface StatsResponse {
  range: Range
  sinceSeconds: number
  runsByAgent: Array<{ agentClass: string; count: number }>
  costByDay: Array<{ date: string; cost: number; runs: number }>
}

interface ToolUsageResponse {
  range: '7d' | '30d' | '90d'
  sinceSeconds: number
  tools: Array<{
    toolName: string
    count: number
    errorCount: number
    lastUsedAt: string | null
    totalCostUsd: number | null
  }>
}

/** Cost chart renders at the old ChartContainer height (h-64). */
const CHART_HEIGHT = 256

/**
 * Change across the range: second half vs first half of the daily
 * series, compared as per-day AVERAGES so an odd-length range (7d →
 * 3 vs 4 days) doesn't bias the delta. Undefined when the baseline
 * half is empty (fresh accounts) — a delta against zero reads as
 * noise, not signal.
 */
function halfOverHalfDelta(series: number[]): number | undefined {
  if (series.length < 2) return undefined
  const mid = Math.floor(series.length / 2)
  const firstHalf = series.slice(0, mid)
  const secondHalf = series.slice(mid)
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const first = avg(firstHalf)
  const second = avg(secondHalf)
  if (first <= 0) return undefined
  return ((second - first) / first) * 100
}

export function AgentObservabilityPage() {
  const [range, setRange] = useState<Range>('7d')

  // Canvas-safe color resolved from theme tokens (re-resolve on mode flip).
  const {
    colors: [costColor],
    isDarkMode,
  } = useChartTheme('--chart-2')

  const stats = useQuery({
    queryKey: ['agent-observability', 'stats', range],
    queryFn: () => apiClient.get<StatsResponse>(`/api/agent-observability/stats?range=${range}`),
    refetchInterval: 60_000,
  })

  // Per-tool usage stats — closes the chat-tools audit gap of "we have
  // no idea which tools actually fire". Same range filter as stats; the
  // tool-usage endpoint maps 14d → 30d under the hood.
  const toolRange: '7d' | '30d' | '90d' = range === '7d' ? '7d' : range === '90d' ? '90d' : '30d'
  const toolUsage = useQuery({
    queryKey: ['agent-observability', 'tool-usage', toolRange],
    queryFn: () =>
      apiClient.get<ToolUsageResponse>(`/api/agent-observability/tool-usage?range=${toolRange}`),
    refetchInterval: 60_000,
  })

  const runsByAgent = useMemo(
    () =>
      stats.data?.runsByAgent.map((r) => ({
        ...r,
        label: formatAgentClass(r.agentClass),
      })) ?? [],
    [stats.data]
  )
  const costByDay = stats.data?.costByDay ?? []
  const totalRuns = runsByAgent.reduce((sum, r) => sum + r.count, 0)
  const totalCost = costByDay.reduce((sum, d) => sum + d.cost, 0)

  // KPI trends derive from the same daily buckets as the cost chart.
  const runsSeries = costByDay.map((d) => d.runs)
  const costSeriesRaw = costByDay.map((d) => d.cost)
  const runsDelta = halfOverHalfDelta(runsSeries)
  const costDelta = halfOverHalfDelta(costSeriesRaw)

  // Dates arrive as YYYY-MM-DD day buckets. Anchor each bucket to LOCAL
  // midnight (not Date.parse's UTC) so Kumo's built-in tooltip header —
  // which formats in local time — shows the same calendar date everywhere;
  // the axis tick formatter below then reads the local date back out.
  const costSeries = useMemo(
    () => [
      {
        name: 'Cost (USD)',
        color: costColor,
        data: costByDay.map((d) => {
          const [y = 1970, m = 1, day = 1] = d.date.split('-').map(Number)
          return [new Date(y, m - 1, day).getTime(), d.cost] as [number, number]
        }),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats.data, costColor]
  )

  return (
    <PageContainer type="hub">
      <PageHeader
        title="Agent observability"
        subtitle="How much agent work happened and what it cost. Pulled from the agent_runs audit log."
        trailing={
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[range]}
            onValueChange={([v]) => v && setRange(v as Range)}
            aria-label="Date range"
          >
            <ToggleGroupItem value="7d">7d</ToggleGroupItem>
            <ToggleGroupItem value="14d">14d</ToggleGroupItem>
            <ToggleGroupItem value="30d">30d</ToggleGroupItem>
            <ToggleGroupItem value="90d">90d</ToggleGroupItem>
          </ToggleGroup>
        }
      />

      {stats.isLoading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Spinner size="lg" className="mr-2" />
          Loading stats…
        </div>
      ) : totalRuns === 0 ? (
        <EmptyState
          icon={ChartBar}
          title="No agent runs yet"
          description="Agents log a row to agent_runs every time they run. Trigger an agent (REST, schedule, webhook, or inter-agent) and stats land here."
          tips={[
            'See the live tail on the Home page (Recent runs panel)',
            'AutonomousAgent.runOnce is what writes the rows — every subclass gets observability for free',
          ]}
        />
      ) : (
        <>
          {/* Headline KPIs — CF-style: big number + range delta + trend
              strip, all derived from the same daily buckets as the chart. */}
          <StatGrid
            items={[
              {
                label: 'Total runs',
                value: totalRuns.toLocaleString(),
                delta: runsDelta,
                sub: runsDelta !== undefined ? 'vs first half of range' : undefined,
                sparkline: runsSeries,
              },
              {
                label: 'Total cost',
                value: `$${totalCost.toFixed(4)}`,
                delta: costDelta,
                sub: costDelta !== undefined ? 'vs first half of range' : undefined,
                sparkline: costSeriesRaw,
              },
            ]}
            className="sm:grid-cols-2"
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <DashboardPanel
              title="Runs per agent"
              actions={
                <span className="text-xs text-muted-foreground">
                  {runsByAgent.length} agent{runsByAgent.length === 1 ? '' : 's'}
                </span>
              }
            >
              <BreakdownList
                items={runsByAgent.map((r) => ({
                  key: r.agentClass,
                  label: r.label,
                  value: r.count,
                }))}
              />
            </DashboardPanel>

            <DashboardPanel title="Cost per day">
              <>
                {costByDay.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No cost data in this range.
                  </div>
                ) : (
                  <TimeseriesChart
                    echarts={echarts}
                    data={costSeries}
                    type="line"
                    gradient
                    isDarkMode={isDarkMode}
                    height={CHART_HEIGHT}
                    xAxisTickFormat={(ts) => {
                      const d = new Date(ts)
                      const pad = (n: number) => String(n).padStart(2, '0')
                      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
                    }}
                    yAxisTickFormat={(v) => `$${v.toFixed(2)}`}
                    tooltipValueFormat={(v) => `$${v.toFixed(4)}`}
                    tooltipFollowCursor="x"
                    ariaDescription="Daily agent cost in US dollars over the selected date range"
                  />
                )}
              </>
            </DashboardPanel>
          </div>

          {/* Per-tool usage — closes the chat-tools audit gap. Surfaces
              which tools actually fire so we can validate Phase A+B
              activation rates moved + spot dead tools. */}
          <DashboardPanel
            title={
              <span className="flex items-center gap-2">
                <ChartBar className="size-4" />
                Tool usage
              </span>
            }
            actions={
              <span className="text-xs text-muted-foreground">
                {toolUsage.data?.tools.length ?? 0} distinct tools fired
              </span>
            }
          >
            <>
              {toolUsage.isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <Spinner />
                </div>
              ) : !toolUsage.data?.tools.length ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No tool calls in this range yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Tool</th>
                        <th className="pb-2 text-right font-medium">Calls</th>
                        <th className="pb-2 text-right font-medium">Errors</th>
                        <th className="pb-2 text-right font-medium">Cost (USD)</th>
                        <th className="pb-2 text-right font-medium">Last used</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {toolUsage.data.tools.map((t) => {
                        const errorRate = t.count > 0 ? (t.errorCount / t.count) * 100 : 0
                        const last = t.lastUsedAt ? new Date(t.lastUsedAt) : null
                        const ageDays = last
                          ? Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24))
                          : null
                        return (
                          <tr key={t.toolName} className="hover:bg-muted/30">
                            <td className="py-1.5 font-mono text-xs">{t.toolName}</td>
                            <td className="py-1.5 text-right tabular-nums">{t.count}</td>
                            <td
                              className={`py-1.5 text-right tabular-nums ${errorRate > 10 ? 'text-destructive' : 'text-muted-foreground'}`}
                            >
                              {t.errorCount}
                              {errorRate > 0 ? (
                                <span className="ml-1 text-[10px] opacity-70">
                                  ({errorRate.toFixed(0)}%)
                                </span>
                              ) : null}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                              {t.totalCostUsd != null ? `$${t.totalCostUsd.toFixed(4)}` : '—'}
                            </td>
                            <td className="py-1.5 text-right text-xs text-muted-foreground">
                              {ageDays === null ? '—' : ageDays === 0 ? 'today' : `${ageDays}d ago`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          </DashboardPanel>
        </>
      )}
    </PageContainer>
  )
}

export default AgentObservabilityPage
