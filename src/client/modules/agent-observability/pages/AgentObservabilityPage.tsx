/**
 * AgentObservabilityPage — `/dashboard/agent-observability`
 *
 * Surfaces the agent_runs audit log as charts + a recent-runs list.
 * Two charts on top:
 *   - Runs per agent class (bar) — answers "what's running?"
 *   - Cost per day (line+gradient) — answers "where's spend going?"
 *
 * Charts are Kumo's ECharts wrappers (`@cloudflare/kumo/components/chart`):
 * TimeseriesChart for the time-axis cost chart, low-level Chart for the
 * categorical bar chart. Series colors come from our --chart-1..5 tokens,
 * resolved to canvas-safe hex via useChartTheme (src/client/lib/echarts.ts)
 * so light/dark and fork rebrands carry through.
 *
 * For per-run drilldown: `GET /api/agent-observability/runs/:id`. The
 * Dashboard "Recent runs" panel shows the live tail (last 8). This
 * page is the historical view.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Chart, TimeseriesChart, type KumoChartOption } from '@cloudflare/kumo/components/chart'
import { TrendUp, ChartBar, CurrencyDollar } from '@phosphor-icons/react'

import { apiClient } from '@/client/lib/api-client'
import { echarts, useChartTheme } from '@/client/lib/echarts'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

/** Both charts render at the old ChartContainer height (h-64). */
const CHART_HEIGHT = 256

export function AgentObservabilityPage() {
  const [range, setRange] = useState<Range>('7d')

  // Canvas-safe colors resolved from theme tokens (re-resolve on mode flip).
  const {
    colors: [runsColor, costColor, axisTextColor],
    isDarkMode,
  } = useChartTheme('--chart-1', '--chart-2', '--muted-foreground')

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

  // Runs-per-agent is categorical, so it uses the low-level Chart wrapper
  // (TimeseriesChart is time-axis only). Tooltip is ECharts' HTML tooltip —
  // DOM-rendered, so it can consume our kumo interop CSS vars directly.
  const runsOptions = useMemo<KumoChartOption>(
    () => ({
      backgroundColor: 'transparent',
      // ECharts 6 contains axis labels by default (containLabel is legacy).
      grid: { left: 8, right: 12, top: 16, bottom: 0 },
      xAxis: {
        type: 'category',
        data: runsByAgent.map((r) => r.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, interval: 0, rotate: 15, color: axisTextColor },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 11, color: axisTextColor },
        splitLine: { lineStyle: { type: 'dashed', width: 1 } },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'var(--color-kumo-base)',
        borderColor: 'var(--color-kumo-line)',
        borderWidth: 1,
        padding: 8,
        textStyle: { color: 'var(--text-color-kumo-default)', fontSize: 13 },
        extraCssText: 'border-radius: 0.5rem;',
        valueFormatter: (value) => Number(value).toLocaleString(),
      },
      series: [
        {
          type: 'bar',
          name: 'Runs',
          data: runsByAgent.map((r) => r.count),
          itemStyle: { color: runsColor, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 48,
        },
      ],
    }),
    [runsByAgent, runsColor, axisTextColor]
  )

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
          {/* Headline numbers — at-a-glance KPIs above the charts. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <TrendUp className="size-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total runs</p>
                  <p className="font-mono text-2xl tabular-nums">{totalRuns.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <CurrencyDollar className="size-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total cost</p>
                  <p className="font-mono text-2xl tabular-nums">${totalCost.toFixed(4)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Runs per agent</CardTitle>
              </CardHeader>
              <CardContent>
                <Chart
                  echarts={echarts}
                  options={runsOptions}
                  isDarkMode={isDarkMode}
                  height={CHART_HEIGHT}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost per day</CardTitle>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </div>

          {/* Per-tool usage — closes the chat-tools audit gap. Surfaces
              which tools actually fire so we can validate Phase A+B
              activation rates moved + spot dead tools. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ChartBar className="size-4" />
                  Tool usage
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {toolUsage.data?.tools.length ?? 0} distinct tools fired
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                              {t.totalCostUsd ? `$${t.totalCostUsd.toFixed(4)}` : '—'}
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
            </CardContent>
          </Card>
        </>
      )}
    </PageContainer>
  )
}

export default AgentObservabilityPage
