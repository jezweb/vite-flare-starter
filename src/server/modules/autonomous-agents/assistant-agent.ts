/**
 * AssistantAgent — worked example of AutonomousAgent
 *
 * A per-user persistent assistant. Each `${userId}:${name}` partition
 * is one DO instance with its own persona, memory blocks, and
 * conversation history. The user can:
 *
 *   - Set persona ("You are my morning-briefing helper for...")
 *   - Stash facts in named blocks ("preferences", "current-projects")
 *   - Chat with the agent — history persists across sessions
 *   - Schedule the agent to fire on its own (daily digest, weekly
 *     check-in, etc) via `scheduleSelfRun`
 *
 * What it demonstrates:
 *   - Subclassing AutonomousAgent with custom toolset
 *   - Reusing the existing chat tool catalog (no parallel tool defs)
 *   - User-scoped tools (Gmail, Calendar) just work because state.userId
 *     flows through to the AgentContext
 *
 * What forks build on top:
 *   - Replace `getToolDefinitions()` with a subset matching the
 *     agent's purpose (a research assistant doesn't need Gmail send)
 *   - Override `buildExtraInstructions()` to inject current date,
 *     unread email count, today's calendar — anything dynamic the
 *     agent should always know
 *   - Wire Cloudflare's AgentMemory service for vector recall over
 *     long conversation history (replaces the sliding window)
 */
import { AutonomousAgent, type AutonomousAgentEnv, type AutonomousAgentState } from '@/server/lib/agents/autonomous-agent'
import type { ToolDefinition } from '@/shared/agent'

interface Env extends AutonomousAgentEnv {
  // Agents inheriting AutonomousAgentEnv get all the AI provider keys
  // from the parent shape — no need to redeclare unless you need
  // additional bindings (R2 buckets, KV, etc).
}

export class AssistantAgent extends AutonomousAgent<Env, AutonomousAgentState> {
  static override readonly className = 'AssistantAgent'

  /**
   * Tool catalog for this agent. Pulled from the chat module's
   * existing definitions so we don't duplicate code or drift.
   *
   * Curated subset — NOT every chat tool. A persistent assistant
   * should err on the side of fewer, higher-signal tools so the
   * model picks reliably. Add more in your fork as use cases prove
   * out the value.
   */
  protected override async getToolDefinitions(): Promise<ToolDefinition<unknown, unknown>[]> {
    // Lazy import — keeps the cold-start cost off this file's import
    // graph. Only paid when an agent actually runs.
    const { coreDefinitions } = await import('@/server/modules/chat/tools/core')
    const { todoDefinitions } = await import('@/server/modules/chat/tools/todo')
    const { memoryDefinitions } = await import('@/server/modules/chat/tools/memory')
    const { searchDefinitions } = await import('@/server/modules/chat/tools/search')
    return [
      ...coreDefinitions,
      ...memoryDefinitions,
      ...todoDefinitions,
      ...searchDefinitions,
    ] as ToolDefinition<unknown, unknown>[]
  }

  /**
   * Inject current date so the model knows when "today" is — a
   * common gap when scheduled fires happen without a fresh user
   * message that would naturally include time context.
   */
  protected override async buildExtraInstructions(): Promise<string | null> {
    const now = new Date()
    const formatted = new Intl.DateTimeFormat('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Australia/Sydney',
      timeZoneName: 'short',
    }).format(now)
    return `Current date/time: ${formatted}`
  }
}
