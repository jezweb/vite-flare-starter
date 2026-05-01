/**
 * AgentsPage — `/dashboard/agents`
 *
 * Two-tab surface:
 *   - "My agents" — instances the user has actually run (from agent_runs)
 *     with current state pulled from each DO. Click a card to edit
 *     persona / model / daily budget.
 *   - "All classes" — read-only catalogue from /api/agents/registered.
 *     Shows what's available; a class without an instance hasn't been
 *     used yet.
 *
 * For chat-driven editing of agent state, see AdminAgent (#admin space).
 * The same patches go through PATCH /api/agent-instances/:class/:name
 * regardless of UI vs chat origin.
 */
import { useState } from 'react'
import { Bot, Plus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { EmptyState } from '@/client/components/EmptyState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/client/lib/format-time'
import { useAgentInstances, useRegisteredAgents } from '../hooks/useAgentInstances'
import { AgentEditSheet } from '../components/AgentEditSheet'

export function AgentsPage() {
  const instances = useAgentInstances()
  const registered = useRegisteredAgents()
  const [editTarget, setEditTarget] = useState<{ class: string; name: string } | null>(null)

  return (
    <PageContainer type="catalog">
      <PageHeader
        title="Agents"
        subtitle="Per-user agent instances — persona, model, daily budget. Each instance has its own state in DO storage. To create new ones, head to Routines or Admin chat."
        trailing={
          <Button asChild variant="outline">
            <Link to="/dashboard/admin-chat">
              <Sparkles className="mr-1.5 size-4" />
              Admin chat
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My agents</TabsTrigger>
          <TabsTrigger value="all">All classes</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-4">
          {instances.isLoading ? (
            <PageLoading variant="grid" count={4} />
          ) : (instances.data?.instances.length ?? 0) === 0 ? (
            <EmptyState
              icon={Bot}
              title="No agent instances yet"
              description="An agent instance is created on first use. Start a chat with an agent (via Admin chat or a Routine) and it'll appear here with editable state."
              tips={[
                'Admin chat creates an AdminAgent instance for you',
                'Routines create instances when they fire',
              ]}
              action={{
                label: 'Open Admin chat',
                onClick: () => (window.location.href = '/dashboard/admin-chat'),
              }}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {instances.data!.instances.map((inst) => (
                <Item
                  key={`${inst.agentClass}:${inst.agentName}`}
                  variant="default"
                  className="border bg-card transition-colors hover:bg-muted/30"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setEditTarget({ class: inst.agentClass, name: inst.agentName })
                    }
                    className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                  >
                    <ItemMedia variant="icon">
                      <Bot className="size-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>
                        <span className="truncate">{inst.displayName}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          /{inst.agentName}
                        </span>
                      </ItemTitle>
                      <ItemDescription className="line-clamp-2">
                        {inst.state?.persona.slice(0, 200) ?? '(state unavailable)'}
                      </ItemDescription>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono tabular-nums">
                          {inst.runs} {inst.runs === 1 ? 'run' : 'runs'}
                        </span>
                        {inst.totalCostUsd != null && (
                          <>
                            <span>·</span>
                            <span className="font-mono tabular-nums">
                              ${inst.totalCostUsd.toFixed(4)}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>
                          last {formatRelative(new Date(inst.lastRunAt * 1000).toISOString())}
                        </span>
                      </div>
                    </ItemContent>
                  </button>
                  <ItemActions className="shrink-0 self-start flex-col items-end gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {inst.category}
                    </Badge>
                    {inst.state?.dailyBudgetUsd != null && (
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        ≤ ${inst.state.dailyBudgetUsd}/d
                      </Badge>
                    )}
                  </ItemActions>
                </Item>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          {registered.isLoading ? (
            <PageLoading variant="grid" count={4} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {registered.data?.agents.map((cls) => {
                const used = instances.data?.instances.some((i) => i.agentClass === cls.className)
                return (
                  <div
                    key={cls.className}
                    className={cn(
                      'rounded-lg border bg-card p-4',
                      !used && 'opacity-70',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{cls.displayName}</h3>
                      <Badge variant="secondary" className="text-[10px]">
                        {cls.category}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                      {cls.description}
                    </p>
                    <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                      {cls.className}
                    </div>
                    {!used && (
                      <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Plus className="size-3" />
                        Not yet used — fires create the instance
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AgentEditSheet
        agentClass={editTarget?.class ?? null}
        agentName={editTarget?.name ?? null}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
      />
    </PageContainer>
  )
}

export default AgentsPage
