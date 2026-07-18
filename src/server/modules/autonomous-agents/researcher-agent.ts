/**
 * ResearcherAgent — multi-agent handoff worked example
 *
 * The agents-as-tools pattern, now on the agents SDK's native
 * `runAgentTool` (#113 adoption step 5). The LLM decides when to hand
 * off by calling a tool whose execution dispatches another agent as a
 * FACET CHILD — a child Durable Object spawned inside this one, named
 * by the runId, with its own isolated SQLite.
 *
 * Flow:
 *   1. User asks: "Research and write up X"
 *   2. ResearcherAgent's LLM calls `web_search` to gather info
 *   3. When it has enough material, the LLM calls
 *      `delegate_to_writer` with notes + brief
 *   4. The tool calls `this.runAgentTool(WriterAgent, ...)`:
 *      - **awaited** (default): blocks until the writer's facet
 *        completes, returns the polished text inline — with real
 *        interruption semantics (`retryable`, `childStillRunning`)
 *        instead of an opaque RPC failure.
 *      - **background: true**: dispatches DETACHED — the researcher's
 *        turn ends immediately; when the writer finishes (even across
 *        an eviction or deploy — a durable reconcile alarm on the
 *        parent guarantees delivery), `onWriterFinished` fires and
 *        posts the text as an in-app notification.
 *
 * Why this pattern over a single bigger agent?
 *   - **Separation of concerns** — research strategy and prose
 *     composition are different skills. Different prompts, models,
 *     temperatures.
 *   - **Cost** — research can run on a flagship model with grounding
 *     tools; writing on a cheaper model. Each agent picks its own.
 *   - **Reuse** — multiple specialist agents can all hand off to the
 *     same Writer.
 *   - **Durability** — the detached path survives DO eviction and
 *     deploys; the old getAgentByName+await handoff silently lost the
 *     run if either side died mid-write.
 *
 * The child side of the contract (startAgentToolRun etc.) is
 * implemented once on AutonomousAgent — any autonomous agent can be
 * dispatched this way, not just the Writer.
 *
 * Partition: `${userId}:${slug}` — same convention as AssistantAgent.
 * Each research topic can have its own researcher instance (so the
 * conversation history is scoped to that topic).
 */
import { z } from 'zod'
import { PaperPlaneTilt } from '@phosphor-icons/react'
import type { AgentToolLifecycleResult, AgentToolRunInfo } from 'agents'
import { drizzle } from 'drizzle-orm/d1'
import {
  AutonomousAgent,
  type AgentToolRunInput,
  type AgentToolRunOutput,
  type AutonomousAgentEnv,
  type AutonomousAgentState,
} from '@/server/lib/agents/autonomous-agent'
import type { ToolDefinition } from '@/shared/agent'
import { WriterAgent } from './writer-agent'

interface Env extends AutonomousAgentEnv {
  WriterAgent: DurableObjectNamespace<WriterAgent>
}

const RESEARCHER_PERSONA = `You are a research assistant. Your job:

1. Use \`web_search\` to gather concrete facts on the user's topic. Run multiple searches with different angles when one query isn't enough.
2. When you have enough material to answer well, call \`delegate_to_writer\` with:
   - \`notes\`: the relevant facts you gathered (URLs + 1-line summaries)
   - \`brief\`: what the user actually asked for, in your words

The writer composes the final response. After you call delegate_to_writer, return the writer's response verbatim — don't restate or summarise it.

If the user asked for the result to be delivered later, in the background, or as a notification, pass \`background: true\` — the writer then runs detached and the user is notified when the text is ready. In that case, confirm the dispatch briefly and end your turn.

If the topic is too narrow / personal / opinion-based for web search, skip search and call delegate_to_writer with a brief explaining what's needed.`

export class ResearcherAgent extends AutonomousAgent<Env, AutonomousAgentState> {
  static override readonly className = 'ResearcherAgent'
  static readonly metadata = {
    displayName: 'Researcher',
    description:
      'Searches the web, gathers information on a topic, then hands off a brief to the Writer. Use for: market research, competitor scans, "what\'s happening with X" digests.',
    userPurpose:
      'Use to gather context on a topic — searches the web and saves sources to memory before handing off to a writer.',
    category: 'researcher' as const,
  }

  override initialState: AutonomousAgentState = {
    ...AutonomousAgent.defaultInitialState(),
    name: 'ResearcherAgent',
    persona: RESEARCHER_PERSONA,
    // Flagship for research strategy + grounding. Writer downshifts
    // to Haiku for the composition step. Cost stays bounded.
    modelId: 'anthropic/claude-sonnet-4.6',
  }

  protected override async getToolDefinitions(): Promise<ToolDefinition<unknown, unknown>[]> {
    const { searchDefinitions } = await import('@/server/modules/chat/tools/search')
    return [...searchDefinitions, this.delegateToWriterTool()] as ToolDefinition<unknown, unknown>[]
  }

  /**
   * The handoff tool, on the agents SDK's native `runAgentTool`. Both
   * delivery modes go through the same machinery:
   *
   *   - awaited (default): the writer runs as a facet child; this call
   *     blocks until its terminal state and returns the text inline.
   *   - background: detached dispatch — returns a runId immediately;
   *     `onWriterFinished` (referenced by METHOD NAME, the same
   *     eviction-surviving contract as `schedule`) delivers the result
   *     as a notification when the child completes.
   *
   * Defined as a method (not a const) so `this` is bound — the
   * dispatch runs on the researcher's own DO.
   */
  private delegateToWriterTool(): ToolDefinition<
    { notes: string; brief: string; model?: string; background?: boolean },
    | { ok: true; text: string; writerModel: string }
    | { ok: true; background: true; runId: string; note: string }
    | { ok: false; error: string; retryable?: boolean }
  > {
    const userId = this.state.userId ?? ''
    return {
      name: 'delegate_to_writer',
      description:
        'Hand off research notes to the WriterAgent for polishing. Call this once you have enough material to answer the user. Default: waits for the text — relay it back verbatim. Pass background: true only when the user asked for later/background delivery; the polished text then arrives as a notification.',
      inputSchema: z.object({
        notes: z
          .string()
          .min(10)
          .max(20_000)
          .describe('Research notes — facts, URLs, 1-line summaries.'),
        brief: z
          .string()
          .min(5)
          .max(2000)
          .describe('What the user actually asked for, in your words.'),
        model: z
          .string()
          .optional()
          .describe('Override the writer model (default: Haiku). Use sparingly.'),
        background: z
          .boolean()
          .optional()
          .describe(
            'Run the writer detached: dispatch now, deliver the text as a notification when ready. Survives evictions and deploys.'
          ),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          text: z.string(),
          writerModel: z.string(),
        }),
        z.object({
          ok: z.literal(true),
          background: z.literal(true),
          runId: z.string(),
          note: z.string(),
        }),
        z.object({
          ok: z.literal(false),
          error: z.string(),
          retryable: z.boolean().optional(),
        }),
      ]),
      execute: async ({ notes, brief, model, background }) => {
        if (!userId) {
          return {
            ok: false as const,
            error: 'ResearcherAgent has no owner — call setOwner first.',
          }
        }
        const input: AgentToolRunInput = {
          input: `Brief: ${brief}\n\n## Research notes\n\n${notes}`,
          userId,
          ...(model && { model }),
        }
        const writerModel = model ?? 'anthropic/claude-haiku-4.5'
        try {
          if (background) {
            const dispatch = await this.runAgentTool(WriterAgent, {
              input,
              detached: { onFinish: 'onWriterFinished' },
            })
            if (dispatch.status === 'error') {
              return { ok: false as const, error: dispatch.error ?? 'Dispatch failed' }
            }
            return {
              ok: true as const,
              background: true as const,
              runId: dispatch.runId,
              note: 'Writer dispatched in the background — the polished text will arrive as a notification when ready.',
            }
          }
          const result = await this.runAgentTool<AgentToolRunInput, AgentToolRunOutput>(
            WriterAgent,
            { input }
          )
          if (result.status === 'completed') {
            return {
              ok: true as const,
              text: result.output?.text ?? result.summary ?? '',
              writerModel,
            }
          }
          return {
            ok: false as const,
            error: result.error ?? `Writer run ${result.status}`,
            // `interrupted` = transient (child superseded by deploy /
            // parent recovery) — worth a single re-dispatch.
            retryable: result.status === 'interrupted',
          }
        } catch (err) {
          return {
            ok: false as const,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
      render: { icon: PaperPlaneTilt, displayName: 'Delegate to Writer' },
    }
  }

  /**
   * Durable completion callback for detached writer runs. The framework
   * delivers this at-least-once (claim + lease in the parent's SQLite),
   * surviving evictions and deploys between dispatch and completion —
   * so it must be idempotent: the notification insert uses a
   * deterministic id derived from the runId and ignores conflicts.
   */
  async onWriterFinished(run: AgentToolRunInfo, result: AgentToolLifecycleResult): Promise<void> {
    const userId = this.state.userId
    if (!userId) {
      // Nothing sensible to deliver to — log loudly rather than retry
      // forever (an ownerless researcher is a wiring bug, not transient).
      console.error(
        JSON.stringify({ event: 'writer_finish_no_owner', runId: run.runId })
      )
      return
    }

    // Pull the full text from the child facet's run row (the lifecycle
    // result carries status + summary only). The child's summary is
    // truncated to 280 chars, so a failed fetch here would permanently
    // degrade the notification (deterministic id + conflict-ignore means
    // a later re-delivery can't replace it) — fall back to the summary
    // only when the fetch itself returned cleanly with no text.
    let text: string | undefined
    if (result.status === 'completed') {
      const child = await this.subAgent(WriterAgent, run.runId)
      const inspection = await child.inspectAgentToolRun(run.runId)
      text = (inspection?.output as { text?: string } | undefined)?.text
    }

    const ok = result.status === 'completed'
    try {
      const { userNotifications } = await import('@/server/modules/notifications/db/schema')
      await drizzle((this.env as { DB: D1Database }).DB)
        .insert(userNotifications)
        .values({
          // Deterministic id = idempotency across re-deliveries.
          id: `writer-run-${run.runId}`,
          userId,
          type: ok ? 'success' : 'warning',
          title: ok ? 'Your write-up is ready' : 'Background write-up failed',
          message: ok
            ? (text ?? result.summary ?? 'Writer finished.').slice(0, 2000)
            : (result.error ?? `Writer run ${result.status}`).slice(0, 500),
          data: JSON.stringify({
            agentClass: 'ResearcherAgent',
            writerRunId: run.runId,
            status: result.status,
          }),
        })
        .onConflictDoNothing()
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'writer_finish_notification_failed',
          runId: run.runId,
          error: err instanceof Error ? err.message : String(err),
        })
      )
      // RETHROW (brains-trust 2026-07-18, cross-validated): swallowing a
      // transient D1 failure here would consume the framework's delivery
      // lease and silently lose the notification forever. Throwing keeps
      // the claim unstamped so the reconcile backbone re-delivers; the
      // deterministic id makes the eventual success idempotent.
      throw err
    }
  }
}
