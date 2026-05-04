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
import { resolveModel, resolveModelForUser } from '@/server/lib/ai/providers'
import { collectAvailableTools } from '@/server/lib/ai/tool-adapter'
import { costFor } from '@/server/lib/ai/cost'
import { generateWebhookSecret } from './webhook-verify'
import { pendingApprovals } from '@/server/modules/approvals/db/schema'
import { agentRuns, type AgentRunTrigger } from '@/server/modules/agent-observability/db/schema'
import { nullTelemetry } from '@/shared/agent'
import type { ToolDefinition, AgentContext as CanonicalAgentContext, AgentUser } from '@/shared/agent'
import type { AgentMetadata } from '@/shared/agent/metadata'

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
  /** Optional R2 bucket for R2-sourced skills. */
  SKILLS?: R2Bucket
}

/**
 * Lifecycle events at which skills can be hooked. Slice 4 ships
 * SessionEnd as the only fired event; the rest are reserved so subclass
 * configs don't need to change when they land.
 */
export type HookEvent = 'SessionStart' | 'SessionEnd' | 'PreToolUse' | 'PostToolUse'

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
  /** Optional allow-list of tool names this agent may call. When non-null
   *  and non-empty, `buildToolset` filters BOTH local ToolDefinitions and
   *  per-user MCP tools down to entries whose name appears in the list.
   *  Null / undefined / empty array = no filtering (all available tools
   *  exposed). Set per-routine in slice 3+; for now sub-classes can opt
   *  in directly via `setToolsAllowed`. */
  toolsAllowed?: string[] | null
  /** Optional list of skill names the agent loads on each fire. When set,
   *  `buildExtraInstructions` fetches each skill's body via the central
   *  `loadSkill` registry and injects them as `## Skills` blocks into the
   *  system prompt. Skills are markdown procedures the agent reads and
   *  follows — see issue #50 + ~/.claude/rules/trust-skills-not-elaborate-code.md
   *  for the rationale. */
  skillsLoaded?: string[] | null
  /** Optional hook map: { SessionStart: skillName, SessionEnd: skillName,
   *  PreToolUse: skillName, PostToolUse: skillName }. Hooks run skills at
   *  lifecycle events. Slice 4 fires SessionEnd only (to produce a clean
   *  summary for routine_runs.outputSummary); other events deferred to
   *  slice 6+ when the per-step loop callback exists. */
  hooks?: Partial<Record<HookEvent, string>> | null
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
  /**
   * Pre-resolved model instance to skip the per-run resolveModelForUser
   * call. Useful for batch loops (e.g. SweeperAgent.doSweep) that fire
   * runOnce N times for the same owner — the model doesn't change
   * mid-sweep, so resolving once + passing it through saves N D1
   * round-trips for BYOK key lookup. Type is the AI SDK's LanguageModel
   * shape; cast through unknown so we don't pull the SDK type into the
   * public interface.
   */
  prebuiltModel?: unknown
  /**
   * Spaces (Phase 1): the user who triggered this run on behalf of
   * the agent's owner. In a Space, an agent is owned by the space
   * creator but acts on behalf of whoever @-mentioned it. This id is
   * surfaced on `agent_runs.user_id` so audits attribute correctly,
   * and on any approvals queued during the run as
   * `requestedByUserId`. Defaults to `state.userId` (legacy 1:1
   * behaviour — agent acts for its own owner).
   */
  actingUserId?: string
  /**
   * Spaces (Phase 1): explicit message context for this run. When
   * provided, the agent uses these messages instead of
   * `state.recentMessages` AND does NOT append the new turn to its
   * own state — the canonical history lives in the space's
   * `conversation_messages` table. Use for cross-conversation
   * dispatch so the agent doesn't accumulate stale duplicate
   * history.
   */
  contextMessages?: UIMessage[]
  /**
   * Spaces (Phase 1): when the @-mention happened inside a thread,
   * this is the thread parent message id. The agent's reply will be
   * persisted with `parentMessageId = parentMessageId` so it lands
   * in the same thread.
   */
  parentMessageId?: string
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
  /**
   * Optional output of the SessionEnd hook (when configured via
   * `setHooks({ SessionEnd: '<skillName>' })`). Routines surface this
   * as `routine_runs.outputSummary` so the next-fire run-tail context
   * gets a clean 1-paragraph "what happened" rather than the
   * mechanically-truncated last-280-chars fallback.
   */
  hookSummary?: string | null
}

const DEFAULT_MAX_RECENT_MESSAGES = 30
const DEFAULT_MAX_STEPS = 5

/**
 * Conventional persona block names — adopted from goanna's file family
 * (soul.md / identity.md / style.md / user.md / memory.md). When present
 * in `state.blocks`, these render in stable order with semantic headings
 * before any user-defined blocks. Non-conventional blocks render under
 * `## Context blocks` alphabetically (legacy behaviour preserved).
 *
 * Mental model:
 *   - `soul`     — personality, values, vibe (always-on, system-prompt warm)
 *   - `identity` — name, role, what-this-agent-is (brief, always-on)
 *   - `user`     — capped distillation of the steering human (5-10 lines)
 *   - `memory`   — warm cache of curated essentials (soft cap ~2KB)
 *   - `style`    — voice, tone, formatting preferences
 *
 * A fork-user with a goanna-shaped agent can `setBlock('soul', ...)` etc.
 * and get the right ordering automatically. Empty blocks are skipped.
 *
 * See `docs/AGENTS.md` § "Persona conventions" and goanna's SPEC.md for
 * the broader rationale.
 */
export const CONVENTIONAL_BLOCK_ORDER = [
  'soul',
  'identity',
  'user',
  'memory',
  'style',
] as const

export type ConventionalBlockName = (typeof CONVENTIONAL_BLOCK_ORDER)[number]

const CONVENTIONAL_BLOCK_HEADINGS: Record<ConventionalBlockName, string> = {
  soul: 'Soul',
  identity: 'Identity',
  user: 'User',
  memory: 'Memory',
  style: 'Style',
}

const CONVENTIONAL_BLOCK_SET = new Set<string>(CONVENTIONAL_BLOCK_ORDER)

/**
 * Render `state.blocks` into ordered system-prompt sections.
 *
 * - Conventional blocks render first as top-level `## <Heading>` sections
 *   in goanna-aligned order (soul → identity → user → memory → style).
 * - Any non-conventional block names render under `## Context blocks`
 *   alphabetically (legacy behaviour — preserves existing forks).
 * - Empty values are skipped silently.
 *
 * Pure function — exported separately so it can be unit-tested without
 * subclassing AutonomousAgent.
 */
export function renderPersonaBlocks(blocks: Record<string, string>): string[] {
  const parts: string[] = []
  for (const name of CONVENTIONAL_BLOCK_ORDER) {
    const value = blocks[name]
    if (!value || value.trim() === '') continue
    parts.push(`## ${CONVENTIONAL_BLOCK_HEADINGS[name]}\n\n${value.trim()}`)
  }
  const customNames = Object.keys(blocks)
    .filter((n) => !CONVENTIONAL_BLOCK_SET.has(n))
    .filter((n) => {
      const v = blocks[n]
      return typeof v === 'string' && v.trim() !== ''
    })
    .sort()
  if (customNames.length > 0) {
    const sections = customNames.map((n) => `### ${n}\n${blocks[n]}`)
    parts.push(['## Context blocks', ...sections].join('\n\n'))
  }
  return parts
}

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
   * Pending MCP cleanup from the previous buildToolset call. The cleanup
   * function comes from getUserMcpTools and tears down the per-user MCP
   * client pool. We hold it on the instance so we can run it at the
   * START of the next buildToolset (synchronously) — guarantees at most
   * one outstanding cleanup per agent instance, regardless of whether
   * the previous waitUntil window completed.
   *
   * Issue #39 — without this, long agent runs could exit before the
   * waitUntil window expired, leaving orphaned MCP connections in the
   * SDK's pool. Now: any orphans get reaped on the next invocation.
   */
  private pendingMcpCleanup: (() => Promise<void>) | null = null

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
      toolsAllowed: null,
      skillsLoaded: null,
      hooks: null,
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
   *
   * The base implementation auto-injects loaded skill bodies (set via
   * `setSkillsLoaded`) so subclasses overriding this hook should call
   * `super.buildExtraInstructions()` and concatenate.
   */
  protected async buildExtraInstructions(): Promise<string | null> {
    return await this.loadConfiguredSkills()
  }

  /**
   * Fetch all skills configured via `setSkillsLoaded` and concatenate
   * their bodies as a single `## Skills` block. Returns null when no
   * skills are configured or every fetch fails.
   *
   * Resolution rules match the central `loadSkill` registry: user's
   * personal override wins, falls back to bundled. Disabled skills are
   * silently omitted (returning null from the registry).
   */
  protected async loadConfiguredSkills(): Promise<string | null> {
    const names = this.state.skillsLoaded
    if (!names || names.length === 0) return null
    if (!this.state.userId) return null
    const { loadSkill } = await import('@/server/lib/ai/skills/registry')
    const env = this.env as unknown as Parameters<typeof loadSkill>[0]
    const blocks: string[] = []
    for (const name of names) {
      try {
        const loaded = await loadSkill(env, name, this.state.userId)
        if (loaded?.body) {
          blocks.push(`### Skill: ${name}\n\n${loaded.body.trim()}`)
        }
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: 'autonomous_agent_skill_load_failed',
            agentName: this.state.name,
            skill: name,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }
    if (blocks.length === 0) return null
    return ['## Skills', '', ...blocks].join('\n\n')
  }

  /**
   * Run a hook skill at a lifecycle event. Slice 4 only fires
   * SessionEnd, called from `runOnce` after the main loop terminates.
   *
   * The hook skill body is loaded via the registry then prepended to a
   * sub-prompt that asks the same model to produce a brief output. The
   * caller decides what to do with the returned string (e.g. SessionEnd
   * stores it as routine_runs.outputSummary).
   *
   * Returns null when the hook isn't configured, the skill can't be
   * loaded, or the LLM call fails. Hooks are best-effort — never let a
   * hook failure break the main run.
   */
  protected async fireHook(
    event: HookEvent,
    context: { input: string; userId: string; modelId: string },
  ): Promise<string | null> {
    const skillName = this.state.hooks?.[event]
    if (!skillName) return null
    if (!this.state.userId) return null
    try {
      const { loadSkill } = await import('@/server/lib/ai/skills/registry')
      const env = this.env as unknown as Parameters<typeof loadSkill>[0]
      const loaded = await loadSkill(env, skillName, this.state.userId)
      if (!loaded?.body) return null

      // Run the hook as a one-shot generateText call against the same
      // model the main run uses. We don't expose tools to the hook —
      // hooks are about reasoning over an input, not taking actions.
      const model = await resolveModelForUser(
        env as Parameters<typeof resolveModelForUser>[0],
        { userId: context.userId },
        context.modelId,
      )
      const { generateText } = await import('ai')
      const result = await generateText({
        model: model as never,
        system: loaded.body,
        prompt: context.input,
      })
      return result.text?.trim() || null
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: 'autonomous_agent_hook_failed',
          agentName: this.state.name,
          hookEvent: event,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      return null
    }
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
   *  cross-user contamination.
   *
   *  Side effect: seeds the conventional `identity` block from the
   *  agent class's `static metadata` if the block is empty. The user
   *  can `setBlock('identity', ...)` afterwards to override. `soul` is
   *  NOT auto-seeded — voice + personality are user-owned. */
  async setOwner(userId: string, name?: string): Promise<void> {
    if (this.state.userId && this.state.userId !== userId) {
      throw new Error(
        `AutonomousAgent owner already set to ${this.state.userId}; refusing to reassign to ${userId}`,
      )
    }
    const blocks = { ...this.state.blocks }
    const metadata = (this.constructor as typeof AutonomousAgent & { metadata?: AgentMetadata }).metadata
    const existingIdentity = blocks['identity']
    if (metadata && (!existingIdentity || existingIdentity.trim() === '')) {
      const identityLines = [
        `Name: ${metadata.displayName}`,
        `Role: ${metadata.description}`,
      ]
      if (metadata.userPurpose) identityLines.push(`Purpose: ${metadata.userPurpose}`)
      blocks['identity'] = identityLines.join('\n')
    }
    this.setState({
      ...this.state,
      userId,
      blocks,
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
    dailyBudgetUsd: number | null
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
      dailyBudgetUsd: this.state.dailyBudgetUsd ?? null,
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

    // Build the message array. When the caller passes `contextMessages`
    // (Spaces dispatch), use those instead of the agent's own state — the
    // canonical history lives in the space's conversation_messages table
    // and we don't want to accumulate duplicates in this DO's recentMessages.
    const usingExternalContext = Array.isArray(input?.contextMessages)
    const messages: UIMessage[] = usingExternalContext
      ? [...(input!.contextMessages as UIMessage[])]
      : [...this.state.recentMessages]
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

    // Insert the audit row up-front in 'started' shape; success path
    // flips it to 'ok', error/budget paths flip to 'error'/'budget_exceeded'.
    // Any row left at 'started' is a stuck run (process killed, missed
    // final update) — surfaces as a real failure mode rather than
    // silently looking like a successful 'ok'. Best-effort write — a
    // failure here doesn't break the run.
    // Spaces: when a Space @-mention triggers this run, attribute the
    // audit row to the actual actor user (input.actingUserId), not the
    // agent's owner. Default to owner for legacy 1:1 invocations.
    const actingUserId = input?.actingUserId ?? this.state.userId ?? ''
    const auditEnv = this.env as { DB: D1Database }
    const insertAudit = async () => {
      try {
        await drizzle(auditEnv.DB).insert(agentRuns).values({
          id: runId,
          agentClass: (this.constructor as typeof AutonomousAgent).className,
          agentName: this.state.name,
          userId: actingUserId,
          trigger,
          inputSummary,
          startedAt: startedAtSec,
          outcome: 'started',
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

      // Resolve the model. BYOK-aware: user-supplied keys override
      // env defaults. Falls back to plain resolveModel when no owner.
      // Skip resolution entirely when the caller passed a prebuiltModel —
      // batch loops (SweeperAgent.doSweep) cache the resolved model
      // across N runOnce invocations to avoid N D1 round-trips for the
      // BYOK key lookup. Cast through unknown to keep the AI SDK's
      // LanguageModel type out of the public RunOnceInput shape.
      const model = input?.prebuiltModel
        ? (input.prebuiltModel as Parameters<typeof streamText>[0]['model'])
        : this.state.userId
        ? await resolveModelForUser(
            this.env as Parameters<typeof resolveModelForUser>[0],
            { userId: this.state.userId },
            modelId,
          )
        : resolveModel(this.env, modelId)

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

      // Append assistant turn to history + persist (skip when this run
      // used external context — the canonical history is the caller's,
      // not the agent's own state).
      if (!usingExternalContext) {
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
      } else {
        // Bump invocation count + lastActiveAt even when not persisting
        // history — the agent did do work, observability should show it.
        this.setState({
          ...this.state,
          meta: {
            ...this.state.meta,
            invocations: this.state.meta.invocations + 1,
            lastActiveAt: Date.now(),
          },
        })
      }

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

      // Slice 4: fire SessionEnd hook (if configured) — runs the configured
      // skill as a sub-prompt with the input + assistant text and stores
      // the result on the result so callers can use it (e.g. routine
      // scheduler stores it as `routine_runs.outputSummary`).
      let hookSummary: string | null = null
      if (this.state.hooks?.SessionEnd) {
        try {
          hookSummary = await this.fireHook('SessionEnd', {
            input: `User input: ${userMessage ?? '(none)'}\n\nAssistant output:\n${text}`,
            userId: this.state.userId ?? '',
            modelId,
          })
        } catch {
          // best-effort — never let a hook failure surface to the caller
        }
      }

      return {
        text,
        usage: { inputTokens, outputTokens },
        steps,
        ...(hookSummary !== null ? { hookSummary } : {}),
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
    // Notify the user — uses the existing in-app notifications system.
    // The bell badge picks this up automatically. Best-effort: a
    // notification write failure shouldn't break the approval.
    try {
      const { userNotifications } = await import(
        '@/server/modules/notifications/db/schema'
      )
      await db.insert(userNotifications).values({
        id: crypto.randomUUID(),
        userId: this.state.userId,
        type: 'info',
        title: 'Approval needed',
        message:
          summary ?? `${(this.constructor as typeof AutonomousAgent).className} needs approval to ${action}`,
        data: JSON.stringify({
          link: `/dashboard/approvals?focus=${id}`,
          approvalId: id,
          agentClass: (this.constructor as typeof AutonomousAgent).className,
          action,
        }),
      })
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'approval_notification_failed',
          approvalId: id,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
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
   * Restrict the agent to a specific allow-list of tool names. Pass
   * null (or call with no arg) to remove the restriction and expose all
   * available tools again.
   *
   * Tools are filtered by name on each `buildToolset` call. Names that
   * don't match any registered tool (local or MCP) are silently
   * ignored — the allow-list is a filter, not a contract that all
   * names exist.
   */
  async setToolsAllowed(names: string[] | null): Promise<void> {
    const next = names && names.length > 0 ? Array.from(new Set(names)) : null
    this.setState({ ...this.state, toolsAllowed: next })
  }

  /**
   * Configure which skills (markdown SKILL.md procedures) the agent
   * loads on each fire. The skills are fetched via the central
   * `loadSkill` registry the next time `buildExtraInstructions` runs
   * and injected as `## Skills` blocks into the system prompt.
   *
   * Pass null to remove the configuration and stop loading any skills.
   */
  async setSkillsLoaded(names: string[] | null): Promise<void> {
    const next = names && names.length > 0 ? Array.from(new Set(names)) : null
    this.setState({ ...this.state, skillsLoaded: next })
  }

  /**
   * Configure lifecycle hooks. The map values are skill names — when
   * an event fires (currently only SessionEnd), the corresponding skill
   * is loaded + run as a sub-prompt.
   *
   * Pass null or {} to clear all hooks.
   */
  async setHooks(hooks: Partial<Record<HookEvent, string>> | null): Promise<void> {
    const next = hooks && Object.keys(hooks).length > 0 ? hooks : null
    this.setState({ ...this.state, hooks: next })
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
   * Compose the system prompt. Order:
   *
   *   1. `state.persona` — the agent's main system prompt (always first)
   *   2. Conventional blocks — `soul`, `identity`, `user`, `memory`, `style`
   *      rendered as top-level `## <Heading>` sections in stable order
   *      (goanna-aligned; see `CONVENTIONAL_BLOCK_ORDER`)
   *   3. Custom blocks — any other `state.blocks` entries rendered under
   *      `## Context blocks` alphabetically (legacy shape preserved)
   *   4. Subclass extras (`buildExtraInstructions`) — skills, dynamic
   *      context like current date, etc.
   *   5. Semantic recall snippets — last so they're closest to the
   *      conversation context
   */
  protected async buildSystemPrompt(override?: string, recall: string[] = []): Promise<string> {
    if (override) return override
    const parts: string[] = [this.state.persona]
    parts.push(...renderPersonaBlocks(this.state.blocks))
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
   *
   * Also layers in the agent owner's MCP connections (from the
   * existing per-user mcp_connections table) so an agent inherits any
   * MCP server the user has connected via Connectors → Add MCP.
   *
   * Net effect: a fork pointing AssistantAgent at the user's
   * Jezweb google-chat MCP gets `chat_spaces` / `chat_messages` /
   * `chat_members` tools automatically — no native code needed. Same
   * pattern for any future MCP integration; we don't have to write
   * native tools for every service.
   *
   * MCP cleanup is fire-and-forget on the next tick — we don't have
   * a clean lifecycle hook tied to the agent run, but the SDK's
   * connection pool reuses idle connections so the cost is bounded.
   */
  protected async buildToolset(): Promise<Awaited<ReturnType<typeof collectAvailableTools>>> {
    const allowed = this.state.toolsAllowed
    const allowedSet = allowed && allowed.length > 0 ? new Set(allowed) : null
    const defs = (await this.getToolDefinitions()).filter(
      (d) => !allowedSet || allowedSet.has(d.name),
    )
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
    const localTools = defs.length === 0 ? {} : await collectAvailableTools(defs, ctx)

    // Per-user MCP — only when we know the owner. Best-effort: a
    // failing MCP load shouldn't break the agent run.
    let mcpTools: Record<string, unknown> = {}
    if (this.state.userId) {
      // Issue #39: drain any pending cleanup from the previous run BEFORE
      // opening fresh connections. Guarantees at most one outstanding
      // cleanup per agent instance even if a prior waitUntil never
      // completed (long runs that exited before the post-response window
      // closed). Catch + swallow — a stale cleanup failure shouldn't
      // block this turn.
      if (this.pendingMcpCleanup) {
        const prev = this.pendingMcpCleanup
        this.pendingMcpCleanup = null
        try {
          await prev()
        } catch (err) {
          console.warn(
            JSON.stringify({
              event: 'autonomous_agent_mcp_stale_cleanup_failed',
              agentName: this.state.name,
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        }
      }

      try {
        const { getUserMcpTools } = await import('@/server/lib/ai/user-mcp')
        const env = this.env as unknown as Parameters<typeof getUserMcpTools>[0]
        // Slice 9: pass agent name so per-agent Connection Profiles
        // can scope which connections this agent sees. Connections
        // without an allow-list are still visible to every agent.
        const result = await getUserMcpTools(env, this.state.userId, this.state.name)
        mcpTools = result.tools
        // Schedule cleanup off the hot path AND record it on the
        // instance so the NEXT buildToolset call drains it
        // synchronously if the waitUntil window didn't complete first.
        this.pendingMcpCleanup = result.cleanup
        this.ctx.waitUntil(
          result
            .cleanup()
            .then(() => {
              // Cleanup completed via waitUntil — clear the pending
              // reference so we don't double-run on the next turn.
              if (this.pendingMcpCleanup === result.cleanup) {
                this.pendingMcpCleanup = null
              }
            })
            .catch((err) => {
              console.warn(
                JSON.stringify({
                  event: 'autonomous_agent_mcp_cleanup_failed',
                  agentName: this.state.name,
                  error: err instanceof Error ? err.message : String(err),
                }),
              )
            }),
        )
      } catch (err) {
        console.error(
          JSON.stringify({
            event: 'autonomous_agent_mcp_load_failed',
            agentName: this.state.name,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }

    // Apply the same allow-list to MCP tools — names from the user's
    // connected MCP servers may not be known up front, but if a routine
    // declares e.g. ['gmail_search', 'inbox_add'] we only want those
    // exposed regardless of where they originate.
    const filteredMcp = allowedSet
      ? Object.fromEntries(
          Object.entries(mcpTools).filter(([name]) => allowedSet.has(name)),
        )
      : mcpTools

    return { ...localTools, ...filteredMcp } as Awaited<ReturnType<typeof collectAvailableTools>>
  }
}
