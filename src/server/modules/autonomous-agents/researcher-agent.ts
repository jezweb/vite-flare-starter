/**
 * ResearcherAgent — multi-agent handoff worked example
 *
 * The agents-as-tools pattern from the OpenAI Agents SDK / Mastra /
 * Anthropic Claude Agent SDK convergence. The LLM decides when to
 * hand off by calling a tool whose execution invokes another agent.
 *
 * Flow:
 *   1. User asks: "Research and write up X"
 *   2. ResearcherAgent's LLM calls `web_search` to gather info
 *   3. When it has enough material, the LLM calls
 *      `delegate_to_writer` with notes + brief
 *   4. The tool fetches the WriterAgent stub and calls runOnce
 *   5. Writer composes the polished response
 *   6. Researcher returns the writer's text as its final answer
 *
 * Why this pattern over a single bigger agent?
 *   - **Separation of concerns** — research strategy and prose
 *     composition are different skills. Different prompts, models,
 *     temperatures.
 *   - **Cost** — research can run on a flagship model with grounding
 *     tools; writing on a cheaper model. Each agent picks its own.
 *   - **Reuse** — multiple specialist agents can all hand off to the
 *     same Writer.
 *   - **Tracing** — each agent's tool calls and token usage are
 *     attributed separately in the SDK's observability events.
 *
 * Partition: `${userId}:${slug}` — same convention as AssistantAgent.
 * Each research topic can have its own researcher instance (so the
 * conversation history is scoped to that topic).
 */
import { z } from 'zod'
import { Send } from 'lucide-react'
import { getAgentByName } from 'agents'
import { AutonomousAgent, type AutonomousAgentEnv, type AutonomousAgentState } from '@/server/lib/agents/autonomous-agent'
import type { ToolDefinition } from '@/shared/agent'
import type { WriterAgent } from './writer-agent'

interface Env extends AutonomousAgentEnv {
  WriterAgent: DurableObjectNamespace<WriterAgent>
}

const RESEARCHER_PERSONA = `You are a research assistant. Your job:

1. Use \`web_search\` to gather concrete facts on the user's topic. Run multiple searches with different angles when one query isn't enough.
2. When you have enough material to answer well, call \`delegate_to_writer\` with:
   - \`notes\`: the relevant facts you gathered (URLs + 1-line summaries)
   - \`brief\`: what the user actually asked for, in your words

The writer composes the final response. After you call delegate_to_writer, return the writer's response verbatim — don't restate or summarise it.

If the topic is too narrow / personal / opinion-based for web search, skip search and call delegate_to_writer with a brief explaining what's needed.`

export class ResearcherAgent extends AutonomousAgent<Env, AutonomousAgentState> {
  static override readonly className = 'ResearcherAgent'
  static readonly metadata = {
    displayName: 'Researcher',
    description:
      'Searches the web, gathers information on a topic, then hands off a brief to the Writer. Use for: market research, competitor scans, "what\'s happening with X" digests.',
    userPurpose: 'Use to gather context on a topic — searches the web and saves sources to memory before handing off to a writer.',
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
    return [
      ...searchDefinitions,
      this.delegateToWriterTool(),
    ] as ToolDefinition<unknown, unknown>[]
  }

  /**
   * The handoff tool. Inline to this agent so the partition logic
   * (which Writer instance to invoke) is explicit. Forks adapting
   * to a different topology (multiple writers, routed by topic)
   * customise here.
   *
   * Defined as a method (not a const) so `this` is bound for the
   * stub lookup — agents-SDK methods need `this.env.WriterAgent`,
   * `this.state.userId` to resolve the right instance.
   */
  private delegateToWriterTool(): ToolDefinition<
    { notes: string; brief: string; model?: string },
    { ok: true; text: string; writerModel: string } | { ok: false; error: string }
  > {
    const userId = this.state.userId ?? ''
    const env = this.env
    return {
      name: 'delegate_to_writer',
      description:
        'Hand off research notes to the WriterAgent for polishing. Call this once you have enough material to answer the user. The writer returns clean prose; relay it back to the user verbatim.',
      inputSchema: z.object({
        notes: z.string().min(10).max(20_000).describe('Research notes — facts, URLs, 1-line summaries.'),
        brief: z.string().min(5).max(2000).describe('What the user actually asked for, in your words.'),
        model: z.string().optional().describe('Override the writer model (default: Haiku). Use sparingly.'),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          text: z.string(),
          writerModel: z.string(),
        }),
        z.object({ ok: z.literal(false), error: z.string() }),
      ]),
      execute: async ({ notes, brief, model }) => {
        if (!userId) {
          return { ok: false as const, error: 'ResearcherAgent has no owner — call setOwner first.' }
        }
        try {
          const writer = await getAgentByName(env.WriterAgent, `${userId}:writer`)
          await writer.setOwner(userId, 'writer')
          const input = `Brief: ${brief}\n\n## Research notes\n\n${notes}`
          const result = await writer.runOnce({
            input,
            ...(model && { model }),
          })
          return {
            ok: true as const,
            text: result.text,
            writerModel: model ?? 'anthropic/claude-haiku-4.5',
          }
        } catch (err) {
          return {
            ok: false as const,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
      render: { icon: Send, displayName: 'Delegate to Writer' },
    }
  }
}
