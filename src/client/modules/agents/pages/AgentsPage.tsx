/**
 * AgentsPage — `/dashboard/agents`
 *
 * One unified card grid: every registered agent class appears, plus
 * any extra named instances the user has created (e.g.
 * `researcher:cf-workers` alongside the default `researcher`). Cards
 * are clickable regardless of state — click a "dormant" card and the
 * edit sheet's save creates the DO with the edited state.
 *
 * For chat-driven editing, see AdminAgent (#admin-chat). The same
 * PATCH /api/agent-instances/:class/:name endpoint serves both surfaces.
 */
import { useState } from 'react'
import { Bot, Plus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
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
import { useAgentInstances } from '../hooks/useAgentInstances'
import { AgentEditSheet } from '../components/AgentEditSheet'
import { NewAgentDialog } from '../components/NewAgentDialog'

export function AgentsPage() {
  const instances = useAgentInstances()
  const [editTarget, setEditTarget] = useState<{ class: string; name: string } | null>(null)
  const [newAgentOpen, setNewAgentOpen] = useState(false)

  return (
    <PageContainer type="catalog">
      <PageHeader
        title="Agents"
        subtitle="Per-user agent instances — persona, model, daily budget. Click any card to edit. Dormant agents wake up when you save."
        trailing={
          <>
            <Button onClick={() => setNewAgentOpen(true)}>
              <Plus className="mr-1.5 size-4" />
              New agent
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard/admin-chat">
                <Sparkles className="mr-1.5 size-4" />
                Admin chat
              </Link>
            </Button>
          </>
        }
      />

      <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          How are these agents defined?
        </summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            Each agent CLASS is TypeScript code (in{' '}
            <code className="font-mono">src/server/modules/autonomous-agents/</code>) backed by a Cloudflare Durable Object. To add a new class, fork the starter and write a class file. The 5 shipped here are worked examples for forks to copy.
          </p>
          <p>
            Each agent INSTANCE is per-user runtime state in DO storage. Dormant cards (empty state) become active when you save edits or when something fires the agent (a routine, the Researcher → Writer handoff, etc.).
          </p>
        </div>
      </details>

      {instances.isLoading ? (
        <PageLoading variant="grid" count={5} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {instances.data!.instances.map((inst) => (
            <Item
              key={`${inst.agentClass}:${inst.agentName}`}
              className={cn(
                'border bg-card transition-colors hover:bg-muted/30',
                inst.dormant && 'opacity-75',
              )}
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
                    {inst.dormant
                      ? inst.description
                      : (inst.state?.persona.slice(0, 200) ?? inst.description)}
                  </ItemDescription>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    {inst.dormant ? (
                      <span className="inline-flex items-center gap-1">
                        <Plus className="size-3" />
                        Dormant — click to activate
                      </span>
                    ) : (
                      <>
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
                      </>
                    )}
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

      <AgentEditSheet
        agentClass={editTarget?.class ?? null}
        agentName={editTarget?.name ?? null}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
      />

      <NewAgentDialog
        open={newAgentOpen}
        onOpenChange={setNewAgentOpen}
        onCreate={(agentClass, agentName) => {
          setNewAgentOpen(false)
          setEditTarget({ class: agentClass, name: agentName })
        }}
      />
    </PageContainer>
  )
}

export default AgentsPage
