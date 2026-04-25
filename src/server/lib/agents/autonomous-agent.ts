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
import { drizzle } from 'drizzle-orm/d1'
import { and, eq, gte, sql } from 'drizzle-orm'
import { resolveModel } from '@/server/lib/ai/providers'
import { collectAvailableTools } from '@/server/lib/ai/tool-adapter'
import { costFor } from '@/server/lib/ai/cost'
import { generateWebhookSecret } from './webhook-verify'
import { pendingApprovals } from '@/server/modules/approvals/db/schema'
import { agentRuns, type AgentRunTrigger } from '@/server/modules/agent-observability/db/schema'
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
  /** Per-agent webhook secret. Lazy-initialised on first request via
   *  `getWebhookSecret()`. Empty string until then so the JSON shape
   *  stays stable. Rotate via `regenerateWebhookSecret()`. */
  webhookSecret: string
  /** Daily USD spending cap (queried from agent_runs.cost_usd). Null
   *  = no cap. When set, runOnce throws BudgetExceededError and the
   *  audit row is recorded with outcome='budget_exceeded'. Soft-warn
   *  log fires at 80% of cap. Set via `setDailyBudget(usd | null)`. */
  dailyBudgetUsd: number | null
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
  /** What triggered this run — surfaced in agent_runs.trigger for
   *  observability. Defaults to 'rest'. Set 'schedule' from
   *  runScheduled, 'webhook' from handleWebhook, 'inter_agent' when
   *  another agent's stub invokes us. */
  trigger?: AgentRunTrigger
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

/** Distinct error type for budget-cap rejections. Routes catch this
 *  to return a 429 (or whatever status code your API uses for "limit
 *  exceeded") instead of treating it as a generic failure. */
export class BudgetExceededError extends Error {
  constructor(
    public readonly spentUsd: number,
    public readonly capUsd: number,
  ) {
    super(`Daily budget cap exceeded: $${spentUsd.toFixed(4)} of $${capUsd.toFixed(2)}`)
    this.name = 'BudgetExceededError'
  }
}

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
      webhookSecret: '',
      dailyBudgetUsd: null,
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

  /**
   * Semantic recall hook — return relevant long-term memory snippets
   * for the given input. Default returns `[]`.
   *
   * Wiring options for subclasses:
   *
   *   - **Cloudflare AgentMemory** (private beta as of April 2026):
   *     `await this.env.MEMORY.recall({ ... })` once you have the
   *     binding. The SDK-blessed long-term path.
   *   - **Vectorize directly**: query a Vectorize index keyed by
   *     `${this.state.userId}:${this.state.name}` to scope per-agent.
   *     Use Workers AI embeddings (`@cf/baai/bge-base-en-v1.5`) to
   *     vectorise both stored memories and the current input.
   *   - **D1 FTS5**: cheaper for keyword recall. Already used by the
   *     conversations module for chat search.
   *
   * Returned snippets are joined and injected as a "## Relevant memory"
   * block into the system prompt for this turn only — they don't
   * become part of the persistent state.blocks.
   */
  protected async recallSemantic(_input: string): Promise<string[]> {
    return []
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
    const trigger: AgentRunTrigger = input?.trigger ?? 'rest'

    // Audit row id + start time captured BEFORE any work so we can
    // always finalise it (success OR failure path).
    const runId = crypto.randomUUID()
    const startedAtMs = Date.now()
    const startedAtSec = Math.floor(startedAtMs / 1000)
    const inputSummary = userMessage ? userMessage.slice(0, 500) : null

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

    // Insert the audit row up-front in 'ok' shape; we'll update on
    // finish (or override outcome on error). Best-effort — a write
    // failure here doesn't break the run.
    const auditEnv = this.env as { DB: D1Database }
    const insertAudit = async () => {
      try {
        await drizzle(auditEnv.DB).insert(agentRuns).values({
          id: runId,
          agentClass: (this.constructor as typeof AutonomousAgent).className,
          agentName: this.state.name,
          userId: this.state.userId ?? '',
          trigger,
          inputSummary,
          startedAt: startedAtSec,
          outcome: 'ok',
        })
      } catch (err) {
        console.error(JSON.stringify({ event: 'agent_run_audit_insert_failed', runId, error: String(err) }))
      }
    }
    await insertAudit()

    // Budget gate. Only enforced when state.dailyBudgetUsd is set;
    // null = no cap. Soft-warn at 80% via structured log; hard-stop
    // at 100% with BudgetExceededError. Caller (route) catches and
    // returns 429.
    if (this.state.dailyBudgetUsd !== null) {
      const spent = await this.todaysSpendUsd()
      const cap = this.state.dailyBudgetUsd
      if (spent >= cap) {
        try {
          await drizzle(auditEnv.DB)
            .update(agentRuns)
            .set({
              finishedAt: Math.floor(Date.now() / 1000),
              durationMs: Date.now() - startedAtMs,
              outcome: 'budget_exceeded',
              errorMessage: `Daily cap $${cap.toFixed(2)} reached (spent $${spent.toFixed(4)})`,
            })
            .where(eq(agentRuns.id, runId))
        } catch {
          /* best-effort */
        }
        throw new BudgetExceededError(spent, cap)
      }
      if (spent >= cap * 0.8) {
        console.warn(
          JSON.stringify({
            event: 'agent_budget_warning',
            agentClass: (this.constructor as typeof AutonomousAgent).className,
            agentName: this.state.name,
            userId: this.state.userId,
            spentUsd: spent,
            capUsd: cap,
            pct: Math.round((spent / cap) * 100),
          }),
        )
      }
    }

    try {
      // Build the system prompt. Persona first, then blocks (one
      // labelled section each), then any subclass extras, then
      // semantic recall snippets for this turn (if recallSemantic is
      // wired).
      const recall = userMessage ? await this.recallSemantic(userMessage) : []
      const systemPrompt = await this.buildSystemPrompt(input?.systemPromptOverride, recall)

      // Resolve tools. Each tool sees an AgentContext with the
      // agent's owner (state.userId) so user-scoped tools work.
      const tools = await this.buildToolset()

      // Resolve the model. resolveModel handles routing (Workers AI,
      // OpenRouter, direct providers).
      const model = resolveModel(this.env, modelId)

      const result = streamText({
        model,
        system: systemPrompt,
        messages: await convertToModelMessages(messages),
        tools,
        stopWhen: ({ steps }) => steps.length >= maxSteps,
      })

      // Drain the stream. We don't expose streaming in this base —
      // for streaming UI, extend AIChatAgent. Accumulate the final
      // text here.
      let text = ''
      for await (const chunk of result.textStream) {
        text += chunk
      }
      const finalResult = await result
      const usage = await finalResult.usage
      const allSteps = await finalResult.steps
      const steps = allSteps.length

      // Collect tool names from each step's toolCalls. Bounded to
      // avoid pathological "agent calls 100 tools" rows.
      const toolNames = new Set<string>()
      for (const step of allSteps) {
        for (const tc of step.toolCalls ?? []) {
          if (typeof (tc as { toolName?: unknown }).toolName === 'string') {
            toolNames.add((tc as { toolName: string }).toolName)
          }
        }
      }
      const toolsCalled = Array.from(toolNames).join(',').slice(0, 500)

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

      // Finalise the audit row with usage + cost + steps + tools.
      const finishedAtMs = Date.now()
      const inputTokens = usage.inputTokens ?? 0
      const outputTokens = usage.outputTokens ?? 0
      try {
        await drizzle(auditEnv.DB)
          .update(agentRuns)
          .set({
            finishedAt: Math.floor(finishedAtMs / 1000),
            durationMs: finishedAtMs - startedAtMs,
            outcome: 'ok',
            inputTokens,
            outputTokens,
            costUsd: costFor(modelId, inputTokens, outputTokens),
            steps,
            ...(toolsCalled && { toolsCalled }),
          })
          .where(eq(agentRuns.id, runId))
      } catch (err) {
        console.error(JSON.stringify({ event: 'agent_run_audit_finalise_failed', runId, error: String(err) }))
      }

      return {
        text,
        usage: { inputTokens, outputTokens },
        steps,
      }
    } catch (err) {
      // Failure path — update the audit row with the error before
      // re-throwing. The agent loop can surface a meaningful error
      // to the caller without losing the audit trail.
      const finishedAtMs = Date.now()
      try {
        await drizzle(auditEnv.DB)
          .update(agentRuns)
          .set({
            finishedAt: Math.floor(finishedAtMs / 1000),
            durationMs: finishedAtMs - startedAtMs,
            outcome: 'error',
            errorMessage: err instanceof Error ? err.message : String(err),
          })
          .where(eq(agentRuns.id, runId))
      } catch {
        /* swallow audit write failure */
      }
      throw err
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

  // ─── Approval queue ───────────────────────────────────────────

  /**
   * Queue a destructive action for human approval. Use from inside
   * tools (or directly from `run`) when the agent wants to take an
   * action that should NOT execute autonomously — sending email,
   * posting messages, transferring funds, deleting things.
   *
   * Returns immediately with the approval id — does NOT block waiting
   * for review. The agent's run completes, the LLM relays the queued
   * status back to the user, the user reviews via /approvals, and on
   * approve the system calls back to `executeApproved(action, payload)`
   * to perform the action.
   *
   * Subclasses must implement `executeApproved` to handle their own
   * action types — the base throws to prevent silent no-ops.
   *
   * @param action  Subclass-defined action identifier (e.g. 'send_email')
   * @param payload Action-specific data (must be JSON-serialisable)
   * @param summary One-line human-readable summary for the queue UI
   */
  async requestApproval<T = unknown>(
    action: string,
    payload: T,
    summary?: string,
  ): Promise<{ approvalId: string; status: 'pending' }> {
    if (!this.state.userId) {
      throw new Error('AutonomousAgent.requestApproval requires an owner — call setOwner first.')
    }
    const id = crypto.randomUUID()
    const db = drizzle(this.env.DB)
    await db.insert(pendingApprovals).values({
      id,
      userId: this.state.userId,
      agentClass: (this.constructor as typeof AutonomousAgent).className,
      agentName: this.state.name,
      action,
      payloadJson: JSON.stringify(payload),
      ...(summary !== undefined && { summary }),
      status: 'pending',
    })
    return { approvalId: id, status: 'pending' }
  }

  // ─── Budget gate ──────────────────────────────────────────────

  /**
   * Set the agent's daily USD spending cap. Pass `null` to remove
   * the cap (no limit). Cost is computed from agent_runs.cost_usd
   * over the rolling 24-hour window — UTC midnight isn't great for
   * agents serving multiple timezones, so we use rolling 24h instead.
   */
  async setDailyBudget(usd: number | null): Promise<void> {
    if (usd !== null && (!Number.isFinite(usd) || usd <= 0)) {
      throw new Error('Daily budget must be a positive number or null')
    }
    this.setState({ ...this.state, dailyBudgetUsd: usd })
  }

  /**
   * Sum cost_usd from agent_runs for THIS agent instance over the
   * rolling 24-hour window. Returns 0 if no priced runs (Workers AI
   * runs have null cost which SUM ignores).
   */
  async todaysSpendUsd(): Promise<number> {
    const env = this.env as { DB: D1Database }
    const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60
    const result = await drizzle(env.DB)
      .select({
        total: sql<number | null>`SUM(${agentRuns.costUsd})`,
      })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.agentClass, (this.constructor as typeof AutonomousAgent).className),
          eq(agentRuns.agentName, this.state.name),
          gte(agentRuns.startedAt, oneDayAgo),
        ),
      )
    return result[0]?.total ?? 0
  }

  // ─── Webhooks ─────────────────────────────────────────────────

  /**
   * Get this agent's webhook secret (used to verify incoming webhook
   * signatures). Lazy-initialised — first call mints a new secret;
   * subsequent calls return the same one until rotated.
   *
   * The secret is stored in agent state, so it survives DO eviction
   * + persists across the agent's lifetime. Treat it like a password —
   * never log it; only return to the agent's owner.
   */
  async getWebhookSecret(): Promise<string> {
    if (this.state.webhookSecret) return this.state.webhookSecret
    const secret = generateWebhookSecret()
    this.setState({ ...this.state, webhookSecret: secret })
    return secret
  }

  /**
   * Rotate the webhook secret. After rotation, any senders using the
   * old secret will fail signature verification — coordinate the
   * rotation with the sender.
   */
  async regenerateWebhookSecret(): Promise<{ secret: string }> {
    const secret = generateWebhookSecret()
    this.setState({ ...this.state, webhookSecret: secret })
    return { secret }
  }

  /**
   * Webhook handler — called by the webhook receiver route after the
   * sender's signature has been verified. Default behaviour: invoke
   * the agent's decision loop with the payload as input.
   *
   * Subclasses override to do something more specific:
   *   - Parse the payload structure (Slack event, GitHub PR webhook)
   *   - Extract just the relevant field as the LLM input
   *   - Skip the LLM entirely for routine events (heartbeats, acks)
   *   - Queue an approval rather than running directly
   *
   * The default's `runOnce({ input: JSON.stringify(payload) })` works
   * for ad-hoc structured payloads but isn't great for verbose
   * webhook envelopes (Slack, GitHub) that wrap a small interesting
   * field in a lot of metadata.
   */
  async handleWebhook(
    payload: unknown,
    _headers: Record<string, string>,
  ): Promise<RunOnceResult | { skipped: true; reason: string }> {
    return this.runOnce({ input: JSON.stringify(payload) })
  }

  /**
   * Subclass override: execute an approved action with the agent's
   * full env access. Called by the approvals route handler when a
   * user approves a queued request. The (possibly user-edited)
   * payload is passed in.
   *
   * Default throws — subclasses MUST implement to handle their own
   * action types. Failure to implement an action just means that
   * action will never successfully execute (the row stays in 'failed'
   * status with a clear error).
   *
   * Return value (any JSON-serialisable shape) is persisted as
   * `result_json` for diagnostics + UI display.
   */
  async executeApproved(action: string, _payload: unknown): Promise<unknown> {
    throw new Error(
      `${(this.constructor as typeof AutonomousAgent).className} does not implement executeApproved for action "${action}". Override executeApproved() in the subclass.`,
    )
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
   * under their label; subclass extras appended; semantic recall
   * snippets last so they're closest to the conversation context.
   */
  protected async buildSystemPrompt(override?: string, recall: string[] = []): Promise<string> {
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
    if (recall.length > 0) {
      parts.push('## Relevant memory')
      parts.push(recall.map((s, i) => `${i + 1}. ${s}`).join('\n'))
    }
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
