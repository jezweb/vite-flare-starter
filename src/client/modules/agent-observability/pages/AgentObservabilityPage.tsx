/**
 * AgentObservabilityPage — `/dashboard/agent-observability`
 *
 * Surfaces the agent_runs audit log as charts + a recent-runs list.
 * Two charts on top:
 *   - Runs per agent class (bar) — answers "what's running?"
 *   - Cost per day (area)         — answers "where's spend going?"
 *
 * Both use shadcn Chart (Recharts under the hood) so theme tokens
 * (--chart-1..5) carry across light/dark and forks rebrand cleanly.
 *
 * Empty state: chart components handle the no-data case via a textual
 * fallback rather than a broken-axis Recharts render.
 *
 * For per-run drilldown: `GET /api/agent-observability/runs/:id`. The
 * Dashboard "Recent runs" panel shows the live tail (last 8). This
 * page is the historical view.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, XAxis, Area, AreaChart, YAxis } from 'recharts'
import { TrendingUp, BarChart3, DollarSign } from 'lucide-react'

import { apiClient } from '@/client/lib/api-client'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/client/components/EmptyState'
import { Spinner } from '@/components/ui/spinner'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
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

const runsConfig: ChartConfig = {
  count: {
    label: 'Runs',
    theme: { light: 'hsl(var(--chart-1))', dark: 'hsl(var(--chart-1))' },
  },
}

const costConfig: ChartConfig = {
  cost: {
    label: 'Cost (USD)',
    theme: { light: 'hsl(var(--chart-2))', dark: 'hsl(var(--chart-2))' },
  },
}

export function AgentObservabilityPage() {
  const [range, setRange] = useState<Range>('7d')

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

  const runsByAgent =
    stats.data?.runsByAgent.map((r) => ({
      ...r,
      label: formatAgentClass(r.agentClass),
    })) ?? []
  const costByDay = stats.data?.costByDay ?? []
  const totalRuns = runsByAgent.reduce((sum, r) => sum + r.count, 0)
  const totalCost = costByDay.reduce((sum, d) => sum + d.cost, 0)

  return (
    <PageContainer type="hub">
      <PageHeader
        title="Agent observability"
        subtitle="How much agent work happened and what it cost. Pulled from the agent_runs audit log."
        trailing={
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={range}
            onValueChange={(v) => v && setRange(v as Range)}
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
          icon={BarChart3}
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
                  <TrendingUp className="size-5" />
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
                  <DollarSign className="size-5" />
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
                <ChartContainer config={runsConfig} className="h-64">
                  <BarChart data={runsByAgent} margin={{ left: 0, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      interval={0}
                      angle={-15}
                      height={48}
                      fontSize={11}
                    />
                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost per day</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={costConfig} className="h-64">
                  <AreaChart data={costByDay} margin={{ left: 0, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(d: string) => d.slice(5)}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={4}
                      width={48}
                      fontSize={11}
                      tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          indicator="dot"
                          formatter={(value, name) => (
                            <div className="flex w-full items-center justify-between gap-3">
                              <span className="text-muted-foreground">{String(name)}</span>
                              <span className="font-mono font-medium">
                                ${(value as number).toFixed(4)}
                              </span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Area
                      dataKey="cost"
                      type="monotone"
                      fill="var(--color-cost)"
                      stroke="var(--color-cost)"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ChartContainer>
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
                  <BarChart3 className="size-4" />
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
