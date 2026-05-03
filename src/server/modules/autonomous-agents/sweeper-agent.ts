/**
 * SweeperAgent — cron-driven entity processing worked example
 *
 * Scheduled autonomous agent that periodically scans an entity type
 * for stale items + uses its LLM to propose followup actions, queued
 * for user approval.
 *
 * Demonstrates the pattern: scheduleEvery + entity queries + per-item
 * LLM reasoning + approval queue. Foundation for "every hour, find
 * stale tickets and propose followups", "daily — find deals not
 * touched in 14d and draft outreach", "weekly — surface contacts
 * we should reconnect with."
 *
 * Configuration via state (set once via configure()):
 *   - entityType: which `entities.type` to scan
 *   - staleAfterDays: how old (vs updatedAt) before an item is "stale"
 *   - maxPerSweep: cap to prevent runaway cost on first wake
 *   - intervalSeconds: how often to sweep (default 3600 = hourly)
 *   - actionDescription: human-language instruction the LLM uses to
 *     decide what action to queue ("draft a polite email asking for
 *     an update", "create a task to chase this internally", etc)
 *
 * Lifecycle:
 *   1. POST /api/scheduled-agents/sweepers/:slug { entityType, ... }
 *      → configures + starts (or restarts) the sweep
 *   2. Every intervalSeconds, doSweep() fires:
 *      - Query entities matching type + age
 *      - For each, runOnce with the entity context + actionDescription
 *      - LLM reads entity, decides whether to act, queues approval
 *   3. User reviews queued approvals via /dashboard/approvals
 *   4. POST /:slug/stop cancels the recurring schedule
 *
 * Why an AutonomousAgent (vs a plain ScheduledTaskAgent):
 *   - Per-item LLM reasoning ("is this ticket actually stale or just
 *     waiting on the customer?") needs the agent's tool catalog +
 *     persona + decision loop
 *   - Memory blocks store user preferences ("never followup on
 *     tickets tagged 'wontfix'")
 *   - Approval queue gives the user a review surface for every
 *     proposed action
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, eq, inArray, lte } from 'drizzle-orm'
import { AutonomousAgent, type AutonomousAgentEnv, type AutonomousAgentState } from '@/server/lib/agents/autonomous-agent'
import { entities } from '@/server/modules/entities/db/schema'
import type { ToolDefinition } from '@/shared/agent'

interface Env extends AutonomousAgentEnv {}

/** Sweep config — extends the base state shape. */
export interface SweeperState extends AutonomousAgentState {
  sweep: {
    entityType: string
    staleAfterDays: number
    maxPerSweep: number
    intervalSeconds: number
    actionDescription: string
    /** Optional status filter — only sweep entities in these statuses.
     *  Empty array = any status. */
    statusFilter: string[]
  }
  /** Last completed sweep — for the status endpoint. */
  lastSweep: {
    at: number
    processed: number
    queued: number
  } | null
}

const SWEEPER_PERSONA = `You triage stale entities and propose followup actions for human review.

For each entity you receive:
1. Read the entity's fields, status, and age.
2. Decide whether ANY action is warranted. Many stale entities are stale for good reasons (wontfix, waiting on third party, intentionally on hold).
3. If action is warranted, use \`request_email_approval\` (or another approval-queue tool) to queue a draft. NEVER act directly — every action must go through human approval.
4. If no action makes sense, return a single sentence saying so. Don't queue an approval just to seem productive.

Be conservative. The user reviews everything you queue, and a noisy sweeper teaches them to ignore the queue.`

export class SweeperAgent extends AutonomousAgent<Env, SweeperState> {
  static override readonly className = 'SweeperAgent'
  static readonly metadata = {
    displayName: 'Sweeper',
    description:
      'Periodically scans entities (tickets, leads, etc.) for stale items and proposes followup actions. Use for: stuck-ticket sweeps, lead-followup queues, anything "remind me to act on stale X".',
    userPurpose: 'Use to scan a list of items (tickets, leads, projects) on a schedule and surface anything stuck or overdue.',
    category: 'sweeper' as const,
  }

  override initialState: SweeperState = {
    ...AutonomousAgent.defaultInitialState(),
    persona: SWEEPER_PERSONA,
    modelId: 'anthropic/claude-haiku-4.5',
    sweep: {
      entityType: '',
      staleAfterDays: 7,
      maxPerSweep: 3,
      intervalSeconds: 3600,
      actionDescription: '',
      statusFilter: [],
    },
    lastSweep: null,
  }

  /** Reuse AssistantAgent's tool catalog so the LLM can read entities,
   *  search the web, queue approvals, etc. Forks adjust based on the
   *  sweep's purpose (e.g. drop search if pure data triage). */
  protected override async getToolDefinitions(): Promise<ToolDefinition<unknown, unknown>[]> {
    const { coreDefinitions } = await import('@/server/modules/chat/tools/core')
    const { entityDefinitions } = await import('@/server/modules/chat/tools/entities')
    const { memoryDefinitions } = await import('@/server/modules/chat/tools/memory')
    return [
      ...coreDefinitions,
      ...memoryDefinitions,
      ...entityDefinitions,
    ] as ToolDefinition<unknown, unknown>[]
  }

  /**
   * Configure + start the sweep. Idempotent — calling again with new
   * config replaces the schedule (cancels old, schedules new).
   */
  async configureAndStart(config: {
    entityType: string
    staleAfterDays?: number
    maxPerSweep?: number
    intervalSeconds?: number
    actionDescription: string
    statusFilter?: string[]
  }): Promise<{ scheduleId: string; nextRunAt: number }> {
    if (!config.entityType) throw new Error('entityType is required')
    if (!config.actionDescription) throw new Error('actionDescription is required')

    // Replace state.sweep with the new config (preserves all other fields).
    this.setState({
      ...this.state,
      sweep: {
        entityType: config.entityType,
        staleAfterDays: config.staleAfterDays ?? 7,
        maxPerSweep: config.maxPerSweep ?? 3,
        intervalSeconds: config.intervalSeconds ?? 3600,
        actionDescription: config.actionDescription,
        statusFilter: config.statusFilter ?? [],
      },
    })

    // Cancel any existing sweep schedule before scheduling a new one.
    await this.stop()

    // SDK's scheduleEvery is idempotent on (callback, intervalSeconds,
    // payload) — same call twice returns the same schedule. We pass an
    // empty payload so the dedup key is deterministic.
    const schedule = await this.scheduleEvery<Record<string, never>>(
      config.intervalSeconds ?? 3600,
      'doSweep',
      {},
    )
    return { scheduleId: schedule.id, nextRunAt: schedule.time }
  }

  /** Cancel the recurring sweep. Leaves config in state so a future
   *  start() picks up the same shape. */
  async stop(): Promise<{ cancelled: number }> {
    const schedules = this.getSchedules({ type: 'interval' })
    let cancelled = 0
    for (const s of schedules) {
      const ok = await this.cancelSchedule(s.id)
      if (ok) cancelled++
    }
    return { cancelled }
  }

  /** Quick status for the dashboard / route handler. */
  async sweepStatus(): Promise<{
    config: SweeperState['sweep']
    lastSweep: SweeperState['lastSweep']
    nextRunAt: number | null
  }> {
    const schedules = this.getSchedules({ type: 'interval' })
    const next = schedules.length > 0 ? schedules[0]!.time : null
    return {
      config: this.state.sweep,
      lastSweep: this.state.lastSweep,
      nextRunAt: next,
    }
  }

  /**
   * The recurring sweep callback. Invoked by scheduleEvery — name is
   * the magic string passed above.
   *
   * Strategy: query for stale entities, then `runOnce` per entity
   * with the entity context as input. Each runOnce gets its own
   * agent_runs row — lets the dashboard show "9 sweeps last hour, 3
   * queued approvals."
   *
   * Caps are critical: a stale-entity sweep that runs unbounded on
   * 10,000 rows would exhaust budget instantly. The default
   * `maxPerSweep=3` is deliberately conservative: each runOnce can
   * take 5-30s (LLM + tools + audit), so 3 keeps us comfortably under
   * the DO alarm's 30s CPU budget. Forks with longer alarm budgets
   * (set via top-level `[limits].cpu_ms` in wrangler.jsonc) can raise
   * this; a bigger sweep amortises model resolution overhead.
   *
   * Model resolution is cached at the start of the sweep — see
   * `prebuiltModel` in RunOnceInput. Without that cache, every entity
   * triggers a fresh BYOK key lookup against D1.
   */
  async doSweep(): Promise<{ processed: number; queued: number; skipped: number }> {
    const cfg = this.state.sweep
    if (!cfg.entityType || !this.state.userId) {
      return { processed: 0, queued: 0, skipped: 0 }
    }
    const cutoff = Math.floor(Date.now() / 1000) - cfg.staleAfterDays * 24 * 60 * 60
    const conditions = [
      eq(entities.userId, this.state.userId),
      eq(entities.type, cfg.entityType),
      lte(entities.updatedAt, cutoff),
    ]
    // Push status filter into the SQL so maxPerSweep applies to MATCHING
    // rows, not pre-filtered ones. Earlier post-query filter could
    // silently under-process if the filter rejected most of the limit.
    if (cfg.statusFilter.length > 0) {
      conditions.push(inArray(entities.status, cfg.statusFilter))
    }
    const db = drizzle(this.env.DB)
    const candidates = await db
      .select()
      .from(entities)
      .where(and(...conditions))
      .limit(cfg.maxPerSweep)

    // Resolve the model ONCE for the whole sweep (Phase 3 v2 / issue #38).
    // Otherwise each runOnce hits D1 1-2 times for BYOK key lookup —
    // pure overhead since the model doesn't change mid-sweep. Best-effort:
    // if resolution fails (e.g. transient D1 hiccup), fall through and
    // let runOnce attempt fresh resolution per entity.
    let prebuiltModel: unknown = undefined
    try {
      const { resolveModel, resolveModelForUser } = await import('@/server/lib/ai/providers')
      prebuiltModel = this.state.userId
        ? await resolveModelForUser(
            this.env as Parameters<typeof resolveModelForUser>[0],
            { userId: this.state.userId },
            this.state.modelId,
          )
        : resolveModel(this.env, this.state.modelId)
    } catch (err) {
      console.warn(JSON.stringify({
        event: 'sweeper_prebuild_model_failed',
        error: err instanceof Error ? err.message : String(err),
      }))
    }

    let queued = 0
    let skipped = 0
    for (const entity of candidates) {
      const ageDays = Math.floor((Date.now() / 1000 - entity.updatedAt) / 86400)
      const input = [
        `Stale entity awaiting review:`,
        ``,
        `- id: ${entity.id}`,
        `- type: ${entity.type}`,
        `- title: ${entity.title}`,
        `- status: ${entity.status}`,
        `- age: ${ageDays} days since last update`,
        `- fields: ${entity.fields}`,
        ``,
        `Instruction: ${cfg.actionDescription}`,
        ``,
        `If you decide to queue an approval, do so now via the appropriate tool. If no action is warranted, return a single sentence explaining why.`,
      ].join('\n')
      const result = await this.runOnce({
        input,
        trigger: 'schedule',
        // Per-entity step cap — sweep should be cheap per-item.
        maxSteps: 4,
        prebuiltModel: prebuiltModel ?? undefined,
      })
      // Heuristic: if the response mentions "queued" or "approval" treat
      // as queued; otherwise skipped. This is approximate — for accurate
      // counts a fork could query pending_approvals filtered by createdAt.
      if (/queued|approval/i.test(result.text)) queued++
      else skipped++
    }

    this.setState({
      ...this.state,
      lastSweep: {
        at: Math.floor(Date.now() / 1000),
        processed: candidates.length,
        queued,
      },
    })

    return { processed: candidates.length, queued, skipped }
  }
}
