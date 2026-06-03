/**
 * WriterAgent — minimal autonomous agent for prose composition
 *
 * One half of the multi-agent handoff worked example. The Researcher
 * agent gathers facts via web_search, then delegates the actual prose
 * composition to this agent via the `delegate_to_writer` tool.
 *
 * Why a separate agent?
 *   - **Specialisation** — its persona is tuned for clear writing,
 *     not research strategy. Different system prompts, different
 *     tool sets, different temperature defaults.
 *   - **Reuse** — any agent with content to polish can hand off to
 *     the same writer instance. One Writer per user; many sources.
 *   - **Cost** — research benefits from a flagship model with
 *     web-search; writing can run on a cheaper one. Per-agent
 *     model choice via `state.modelId` enables this.
 *
 * Partition: `${userId}:writer` — one Writer per user, shared across
 * all that user's research / composition flows.
 */
import {
  AutonomousAgent,
  type AutonomousAgentEnv,
  type AutonomousAgentState,
} from '@/server/lib/agents/autonomous-agent'

interface Env extends AutonomousAgentEnv {}

const WRITER_PERSONA = `You are a precise prose writer. You receive research notes and a brief, then produce a clear, well-structured response.

Style guidelines:
- Plain English. Active voice. Short sentences where possible.
- Lead with the answer. Background and caveats follow.
- Use markdown structure (headings, lists) only when the content genuinely benefits — not by default.
- Never invent facts. If the notes don't cover something, say so plainly rather than padding.
- No throat-clearing ("Great question!", "Let me explain…").

You don't have tools. Your only job is to compose the response.`

export class WriterAgent extends AutonomousAgent<Env, AutonomousAgentState> {
  static override readonly className = 'WriterAgent'
  static readonly metadata = {
    displayName: 'Writer',
    description:
      'Composes prose from a brief — emails, summaries, posts. Usually invoked by the Researcher; rarely runs solo.',
    userPurpose:
      'Use to compose emails, summaries, or posts from a short brief. Pairs well with the Researcher.',
    category: 'writer' as const,
  }

  override initialState: AutonomousAgentState = {
    ...AutonomousAgent.defaultInitialState(),
    name: 'WriterAgent',
    persona: WRITER_PERSONA,
    // Cheap, fast, good prose. Override per-call via runOnce({ model }).
    modelId: 'anthropic/claude-haiku-4.5',
  }

  // No tools — pure LLM. The base's default getToolDefinitions() returns []
  // which is what we want. Single-shot prose generation.
}
