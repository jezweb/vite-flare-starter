/**
 * AutonomousAgent — stateful AI agent base
 *
 * Pattern complement to:
 *   - `Agent` from agents SDK   — universal stateful DO base
 *   - `AIChatAgent` from agents — multi-session chat surface
 *   - `ReminderAgent` (worked)  — non-AI scheduled task
 *
 * AutonomousAgent fills the "stateful AI entity with persona + memory
 * + tools + autonomous triggers" slot. Each instance is a Durable Object
 * with its own identity, persona system prompt, conversation history,
 * tool catalog, and the ability to be invoked by:
 *
 *   - Direct request (route → stub.runOnce(input))
 *   - Schedule (this.schedule() → fires runScheduled callback)
 *   - Inter-agent message (sub-agent or stub from another agent)
 *   - Inbound email (if you wire SDK's _onEmail)
 *
 * Memory model:
 *   - **Persona** — system prompt, settable per agent instance
 *   - **Blocks** — Letta-style named context blocks (key/value),
 *     always rendered into the system prompt. Use for compact
 *     long-term context the model should always see (e.g. user
 *     profile, ongoing task state).
 *   - **Episodic** — recent conversation turns (sliding window) in
 *     UIMessage-compatible shape. Persisted in agent state, so the
 *     agent picks up where it left off on the next invocation.
 *   - **Semantic** — NOT in the base; wire Cloudflare's AgentMemory
 *     service in subclasses that need vector-recall over long-term
 *     conversation history.
 *
 * Tool registry:
 *   - Subclass overrides `getToolDefinitions()` returning ToolDefinition[]
 *     (same contract as the chat module).
 *   - Tools execute under an AgentContext with `userId` from state.
 *   - The base wires them through `collectAvailableTools` from the
 *     existing tool-adapter — same telemetry, same truncation gate.
 *
 * Decision loop:
 *   - `runOnce(input?)` is the public RPC entry point.
 *   - Builds: system prompt (persona + blocks) + history + new user
 *     message → `streamText` with the model from state.modelId.
 *   - Persists assistant response into history (sliding window, keeps
 *     last `maxRecentMessages`).
 *   - Returns the response text + token usage.
 *
 * Subclass contract (minimal):
 *
 *     export class MyAssistant extends AutonomousAgent<Env, MyState> {
 *       static readonly className = 'MyAssistant'
 *
 *       initialState = {
 *         ...AutonomousAgent.defaultInitialState(),
 *         persona: 'You are a helpful assistant for X.',
 *         modelId: '@cf/moonshotai/kimi-k2.6',
 *       }
 *
 *       async getToolDefinitions(): Promise<ToolDefinition<unknown, unknown>[]> {
 *         // Pull from existing tool catalog or define inline
 *         return [...]
 *       }
 *     }
 */
import { Agent } from 'agents'
import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { resolveModel } from '@/server/lib/ai/providers'
import { collectAvailableTools } from '@/server/lib/ai/tool-adapter'
import { nullTelemetry } from '@/shared/agent'
import type { ToolDefinition, AgentContext as CanonicalAgentContext, AgentUser } from '@/shared/agent'

export interface AutonomousAgentEnv {
  AI: Ai
  DB: D1Database
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  MISTRAL_API_KEY?: string
  XAI_API_KEY?: string
  OPENROUTER_API_KEY?: string
}

export interface AutonomousAgentState {
  /** Friendly identity. Set once via init(); the agent's DO id is the
   *  authoritative key, but `name` is what you put in UIs. */
  name: string
  /** System-prompt persona. Editable at runtime via `setPersona()`. */
  persona: string
  /** Owning user id. Used for tool-execute context (so user-scoped tools
   *  like Gmail / Calendar know whose token to use) and access checks. */
  userId: string | null
  /** Catalogue model id. Override per-agent; defaults to the project's
   *  DEFAULT_MODEL when omitted via `runOnce({ model })`. */
  modelId: string
  /** Letta-style named context blocks. Always rendered into the
   *  system prompt under their label. Use for long-term facts the
   *  model should always have in context (user profile, current
   *  goals, ongoing task notes). Keep small — every block costs
   *  input tokens on every turn. */
  blocks: Record<string, string>
  /** Recent conversation in UIMessage format. Sliding window of the
   *  most recent `maxRecentMessages` turns. Older turns drop off; if
   *  long-term recall matters, wire Vectorize via Cloudflare's
   *  AgentMemory service in your subclass. */
  recentMessages: UIMessage[]
  /** Operational counters. */
  meta: {
    invocations: number
    lastActiveAt: number | null
    createdAt: number
  }
}

export interface RunOnceInput {
  /** New user message. If omitted, the agent runs with whatever's
   *  already in `recentMessages` — useful for scheduled fires that
   *  resume a paused task. */
  input?: string
  /** Override the default model for this turn (e.g. escalate to a
   *  flagship for a complex task). Falls back to state.modelId. */
  model?: string
  /** Override the system prompt for this turn (one-shot, not stored). */
  systemPromptOverride?: string
  /** Cap on assistant turns within this run. Defaults to 5. */
  maxSteps?: number
}

export interface RunOnceResult {
  /** Plain text of the final assistant response. */
  text: string
  /** Token usage from the AI SDK's totalUsage on finish. */
  usage: {
    inputTokens: number
    outputTokens: number
  }
  /** Number of tool/agent steps the loop took. */
  steps: number
}

const DEFAULT_MAX_RECENT_MESSAGES = 30
const DEFAULT_MAX_STEPS = 5

export abstract class AutonomousAgent<
  Env extends AutonomousAgentEnv = AutonomousAgentEnv,
  State extends AutonomousAgentState = AutonomousAgentState,
> extends Agent<Env, State> {
  /** Subclass identifier surfaced in observability events. Override.
   *  Defaults to constructor name; explicit override is recommended
   *  because minifiers mangle constructor names. */
  static readonly className: string = 'AutonomousAgent'

  /** Override to change the recent-messages window size. */
  protected readonly maxRecentMessages: number = DEFAULT_MAX_RECENT_MESSAGES

  /**
   * Default state factory. Subclasses spread this into their own
   * `initialState` and override the fields they care about (persona,
   * modelId, blocks). Always call this rather than constructing the
   * literal — keeps you forward-compatible with new state fields.
   */
  static defaultInitialState(): AutonomousAgentState {
    return {
      name: 'AutonomousAgent',
      persona: 'You are a helpful assistant.',
      userId: null,
      modelId: '@cf/moonshotai/kimi-k2.6',
      blocks: {},
      recentMessages: [],
      meta: {
        invocations: 0,
        lastActiveAt: null,
        createdAt: Date.now(),
      },
    }
  }

  override initialState: State = AutonomousAgent.defaultInitialState() as State

  // ─── Subclass extension points ─────────────────────────────────

  /**
   * Tools available to this agent. Default is `[]` — pure conversational
   * agent. Subclasses override to wire in tool definitions from the
   * existing chat tool catalog or define their own inline.
   *
   * The base validates each definition's `isAvailable` against the
   * canonical AgentContext before exposing to the model — same
   * filtering as the chat module, so OAuth-gated tools (Gmail etc)
   * are hidden when the user hasn't connected.
   */
  protected async getToolDefinitions(): Promise<ToolDefinition<unknown, unknown>[]> {
    return []
  }

  /**
   * Hook for additional system-prompt content beyond persona + blocks.
   * Useful for injecting current date, recent notifications, etc.
   * Returns a string to append to the system prompt, or null to skip.
   */
  protected async buildExtraInstructions(): Promise<string | null> {
    return null
  }

  // ─── State accessors ──────────────────────────────────────────

  /** Update or create a memory block. Empty value deletes the block. */
  async setBlock(name: string, value: string): Promise<void> {
    const blocks = { ...this.state.blocks }
    if (value === '') delete blocks[name]
    else blocks[name] = value
    this.setState({ ...this.state, blocks })
  }

  async getBlock(name: string): Promise<string | undefined> {
    return this.state.blocks[name]
  }

  /** Replace the persona system prompt. Persists in state. */
  async setPersona(persona: string): Promise<void> {
    this.setState({ ...this.state, persona })
  }

  /** Replace the default model for this agent. */
  async setModel(modelId: string): Promise<void> {
    this.setState({ ...this.state, modelId })
  }

  /** Bind the owning user. Tool-execute context uses this for
   *  user-scoped operations (Gmail, Calendar, etc). Settable once;
   *  subsequent calls with a different userId throw to prevent
   *  cross-user contamination. */
  async setOwner(userId: string, name?: string): Promise<void> {
    if (this.state.userId && this.state.userId !== userId) {
      throw new Error(
        `AutonomousAgent owner already set to ${this.state.userId}; refusing to reassign to ${userId}`,
      )
    }
    this.setState({
      ...this.state,
      userId,
      ...(name !== undefined && { name }),
    })
  }

  /** Wipe conversation history. Persona + blocks survive. */
  async clearHistory(): Promise<void> {
    this.setState({ ...this.state, recentMessages: [] })
  }

  /** Inspect current state. Public RPC for admin / dashboards. */
  async getStatus(): Promise<{
    name: string
    persona: string
    userId: string | null
    modelId: string
    blockCount: number
    blockNames: string[]
    historyCount: number
    invocations: number
    lastActiveAt: number | null
    createdAt: number
  }> {
    return {
      name: this.state.name,
      persona: this.state.persona,
      userId: this.state.userId,
      modelId: this.state.modelId,
      blockCount: Object.keys(this.state.blocks).length,
      blockNames: Object.keys(this.state.blocks),
      historyCount: this.state.recentMessages.length,
      invocations: this.state.meta.invocations,
      lastActiveAt: this.state.meta.lastActiveAt,
      createdAt: this.state.meta.createdAt,
    }
  }

  // ─── Decision loop ────────────────────────────────────────────

  /**
   * Public entry point. Adds the user input to history, runs one
   * pass of the model with available tools, persists the response,
   * returns the text + usage.
   *
   * Returns immediately on text-only models; on tool-capable models
   * the loop runs until the model stops calling tools or hits the
   * step cap (default 5).
   */
  async runOnce(input?: RunOnceInput): Promise<RunOnceResult> {
    const userMessage = input?.input
    const modelId = input?.model ?? this.state.modelId
    const maxSteps = input?.maxSteps ?? DEFAULT_MAX_STEPS

    // Build the message array. Append the new user turn (if any) to
    // the existing history before calling the model.
    const messages: UIMessage[] = [...this.state.recentMessages]
    if (userMessage) {
      messages.push({
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: userMessage }],
      } as unknown as UIMessage)
    }
    if (messages.length === 0) {
      throw new Error('AutonomousAgent.runOnce called with no input and empty history')
    }

    // Build the system prompt. Persona first, then blocks (one
    // labelled section each), then any subclass extras.
    const systemPrompt = await this.buildSystemPrompt(input?.systemPromptOverride)

    // Resolve tools. Each tool sees an AgentContext with the agent's
    // owner (state.userId) so user-scoped tools work correctly.
    const tools = await this.buildToolset()

    // Resolve the model. resolveModel handles all the routing
    // (Workers AI, OpenRouter, direct providers).
    const model = resolveModel(this.env, modelId)

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: ({ steps }) => steps.length >= maxSteps,
    })

    // Drain the stream. We don't expose streaming in this base — for
    // streaming UI, build a separate AIChatAgent-shaped subclass or
    // use the chat module. Here we accumulate the final text.
    let text = ''
    for await (const chunk of result.textStream) {
      text += chunk
    }
    const finalResult = await result
    const usage = await finalResult.usage
    const steps = (await finalResult.steps).length

    // Append assistant turn to history + persist.
    const assistantMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      parts: [{ type: 'text', text }],
    } as unknown as UIMessage
    const nextHistory = [...messages, assistantMsg].slice(-this.maxRecentMessages)

    this.setState({
      ...this.state,
      recentMessages: nextHistory,
      meta: {
        ...this.state.meta,
        invocations: this.state.meta.invocations + 1,
        lastActiveAt: Date.now(),
      },
    })

    return {
      text,
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      },
      steps,
    }
  }

  /**
   * Schedule a self-invocation. Convenience wrapper around the SDK's
   * `schedule()` so the subclass doesn't need to remember the callback
   * method name. The scheduled fire calls `runOnce({ input })` with
   * whatever was passed.
   */
  async scheduleSelfRun(when: Date | number, input?: RunOnceInput): Promise<{ scheduleId: string }> {
    const schedule = await this.schedule(when, 'runScheduled', input ?? {})
    return { scheduleId: schedule.id }
  }

  /**
   * Internal alarm callback. The SDK invokes this when a schedule
   * registered via `scheduleSelfRun` fires. NOT public RPC — exposed
   * because the SDK requires the callback name to be a method on the
   * class.
   */
  async runScheduled(input: RunOnceInput): Promise<RunOnceResult> {
    return this.runOnce(input)
  }

  // ─── Internals ────────────────────────────────────────────────

  /**
   * Compose the system prompt. Persona always first; blocks rendered
   * under their label; subclass extras appended last so they can
   * reference everything above.
   */
  protected async buildSystemPrompt(override?: string): Promise<string> {
    if (override) return override
    const parts: string[] = [this.state.persona]
    const blockNames = Object.keys(this.state.blocks).sort()
    if (blockNames.length > 0) {
      parts.push('## Context blocks')
      for (const name of blockNames) {
        parts.push(`### ${name}\n${this.state.blocks[name]}`)
      }
    }
    const extra = await this.buildExtraInstructions()
    if (extra) parts.push(extra)
    return parts.join('\n\n')
  }

  /**
   * Build the AI SDK tool record from the subclass's tool definitions,
   * filtered by isAvailable() and wired with the canonical AgentContext.
   */
  protected async buildToolset(): Promise<Awaited<ReturnType<typeof collectAvailableTools>>> {
    const defs = await this.getToolDefinitions()
    if (defs.length === 0) return {}
    const agentUser: AgentUser = {
      id: this.state.userId ?? '',
      email: '',
      name: this.state.name,
      role: 'user',
    }
    const ctx: CanonicalAgentContext = {
      env: this.env as unknown as Record<string, unknown>,
      userId: this.state.userId ?? '',
      user: agentUser,
      projectId: null,
      model: {
        id: this.state.modelId,
        provider: 'other',
        supportsVision: false,
        supportsTools: true,
      },
      telemetry: nullTelemetry,
    }
    return collectAvailableTools(defs, ctx)
  }
}
