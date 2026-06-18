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
      <div data-tour="agents-list">
        <PageHeader
          title="Agents"
          subtitle="Your AI agents — the per-user assistants you chat with, hand off work to, or schedule. Each has its own persona, memory, and budget. Click a card to edit it."
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
      </div>

      <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          What's a "type"? What kinds of agent exist?
        </summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            A <strong className="text-foreground">type</strong> is a pattern shipped with the
            starter — like a template. The 5 here cover the main AI-agent shapes:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong className="text-foreground">AI assistant</strong> — general purpose. Chat with
              it, give it tools. Default for most cases.
            </li>
            <li>
              <strong className="text-foreground">Researcher → Writer</strong> — specialist handoff.
              Researcher gathers info, Writer turns it into prose.
            </li>
            <li>
              <strong className="text-foreground">Sweeper</strong> — runs on a schedule, scans for
              things needing action.
            </li>
            <li>
              <strong className="text-foreground">Platform Admin</strong> — configures the platform
              on your behalf via chat.
            </li>
          </ul>
          <p>
            Each one you create here gets its own{' '}
            <strong className="text-foreground">persona</strong> (system prompt),{' '}
            <strong className="text-foreground">model</strong>, and{' '}
            <strong className="text-foreground">budget cap</strong>. Saving creates a per-user
            instance you can chat with or schedule.
          </p>
          <p className="text-[11px]">
            Other agent patterns (voice, video, MCP, simple cron) live as worked examples elsewhere
            in the dashboard — those are different shapes that don't have a "persona to edit"
            surface.
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
                inst.dormant && 'opacity-75'
              )}
            >
              <button
                type="button"
                onClick={() => setEditTarget({ class: inst.agentClass, name: inst.agentName })}
                className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
              >
                <ItemMedia variant="icon">
                  <Bot className="size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    <span className="truncate">{inst.displayName}</span>
                    {/* Only show the slug when it's a real user-chosen one
                        (lowercase + hyphens). Seed agents default the slug
                        to the class name (e.g. `AutonomousAgent`); showing
                        that next to the friendly name leaks implementation
                        detail with no user value. */}
                    {/^[a-z][a-z0-9-]*$/.test(inst.agentName) && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        /{inst.agentName}
                      </span>
                    )}
                  </ItemTitle>
                  <ItemDescription className="line-clamp-3">
                    {inst.dormant
                      ? (inst.userPurpose ?? inst.description)
                      : (inst.state?.persona.slice(0, 200) ?? inst.userPurpose ?? inst.description)}
                  </ItemDescription>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    {inst.dormant ? (
                      <span
                        className="inline-flex items-center gap-1"
                        title="Activating creates the agent instance for your account. It only runs when you message it or schedule a routine. No charges until it actually does work."
                      >
                        <Plus className="size-3" />
                        Activate (no work runs until you ask)
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
