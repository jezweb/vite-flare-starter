/**
 * Routines schema — declarative recurring agent workflows.
 *
 * A Routine is a saved configuration that says: "every N seconds, fire
 * agent <agentClass:agentName> with this input, with these tools allowed,
 * loading these skills, with hooks wired to these other skill ids." It
 * sits ABOVE the lower-level scheduled-agents primitive — that primitive
 * stays as the SDK-level escape hatch; Routines is the user-facing
 * pattern (per issue #50 decision C).
 *
 * Three tables:
 *
 *   routines              — the configuration row (one per saved routine)
 *   routine_runs          — one row per fire; references agent_runs for
 *                           the raw audit but adds a 1-paragraph
 *                           "what happened" summary the next fire reads
 *                           as context (the run-summary tail)
 *   routine_cadence_changes
 *                         — audit log of self-adjusted intervals (when
 *                           the agent decides "I should run sooner /
 *                           later"). Bounded by minInterval / maxInterval
 *                           on the routine row.
 *
 * Inbox items (`inbox_items`) live in their own schema (slice 5) — this
 * file deliberately doesn't reference them.
 */
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

// ─── Trigger kinds ──────────────────────────────────────────────────

export type RoutineTriggerKind =
  | 'schedule' // cron-style or fixed interval
  | 'webhook' // external HTTP fires it
  | 'event' // internal event filter (slice 6+)
  | 'manual' // user-triggered only

export type RoutineOutcome =
  | 'started'
  | 'ok'
  | 'error'
  | 'budget_exceeded'

/** How the routine reacts when the agent suggests a different interval. */
export type CadenceAdjustMode =
  | 'direct' // agent's suggestion applied immediately
  | 'suggested' // agent's suggestion logged but interval unchanged
  | 'fixed' // agent cannot adjust the interval (full lockdown)

// ─── routines ───────────────────────────────────────────────────────

export const routines = sqliteTable(
  'routines',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Optional organisation scoping. NULL = personal routine (default —
     *  preserves visibility for routines created before multi-tenant
     *  isolation shipped). When set, the routine belongs to an org and
     *  list/get queries also accept the org context.
     *  See entities schema docstring — same pattern. */
    organizationId: text('organization_id'),

    /** Friendly identifier shown in UI. e.g. "Stuck-tickets sweeper". */
    name: text('name').notNull(),
    /** Long-form description for the routine detail page. */
    description: text('description'),

    // The agent this routine fires.
    agentClass: text('agent_class').notNull(),
    agentName: text('agent_name').notNull(),

    // How it fires.
    triggerKind: text('trigger_kind')
      .$type<RoutineTriggerKind>()
      .notNull()
      .default('schedule'),
    /** JSON config specific to triggerKind:
     *  - schedule: { interval: number (seconds) }
     *  - webhook: { secret: string }
     *  - event: { ... } (slice 6+)
     *  - manual: {} */
    triggerConfigJson: text('trigger_config_json'),

    /** What gets passed to the agent each fire. JSON template — the
     *  scheduler interpolates {{lastRunSummary}}, {{now}}, etc. when
     *  setting up the agent's input for the next fire. */
    inputTemplateJson: text('input_template_json'),

    /** Optional allow-list of tool names. Filters BOTH local + MCP tools
     *  via AutonomousAgent.toolsAllowed. Empty / null = no restriction. */
    toolsAllowedJson: text('tools_allowed_json'),

    /** Skill ids loaded on each fire (resolved against /api/skills). */
    skillsLoadedJson: text('skills_loaded_json'),

    /** Hook map: { PreToolUse: skillId, PostToolUse: skillId,
     *              SessionStart: skillId, SessionEnd: skillId }. */
    hooksJson: text('hooks_json'),

    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

    // Cadence + self-adjust bounds (all in seconds).
    baseInterval: integer('base_interval'),
    minInterval: integer('min_interval'),
    maxInterval: integer('max_interval'),
    /** Currently active interval. May differ from baseInterval after the
     *  agent has self-adjusted (within bounds). */
    effectiveInterval: integer('effective_interval'),
    adjustMode: text('adjust_mode')
      .$type<CadenceAdjustMode>()
      .notNull()
      .default('suggested'),

    /** Optional gate: if set (0-23), the routine only fires when the
     *  user's local hour (resolved via user.preferences.timezone) matches
     *  this value. Pairs with the cron sweeper — a routine can be "due"
     *  every tick but only fire once per day at the configured hour. Null
     *  = no gate (existing behaviour). Goanna slice 6. */
    localFireHour: integer('local_fire_hour'),

    /** Per-routine USD cap. Aggregated from agent_runs.cost_usd over the
     *  rolling 24h window. Null = no cap (falls back to AutonomousAgent's
     *  dailyBudgetUsd if set). */
    dailyBudgetUsd: real('daily_budget_usd'),

    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
    updatedAt: integer('updated_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),

    lastRunAt: integer('last_run_at'),
    lastOutcome: text('last_outcome').$type<RoutineOutcome>(),
  },
  (table) => [
    index('routines_user_id_idx').on(table.userId),
    index('routines_enabled_idx').on(table.enabled),
    index('routines_trigger_kind_idx').on(table.triggerKind),
    index('routines_org_idx').on(table.organizationId),
  ],
)

// ─── routine_runs ───────────────────────────────────────────────────

export const routineRuns = sqliteTable(
  'routine_runs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    routineId: text('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),

    /** FK into the existing agent_runs audit table — that table holds
     *  the raw cost / token / step / tools-called metadata. We don't
     *  duplicate; we point. */
    agentRunId: text('agent_run_id'),

    runNumber: integer('run_number').notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),

    /** Plain-text snapshot of what was injected into the agent's
     *  input on this fire. Helps debug "why did the agent decide…" */
    inputContextSummary: text('input_context_summary'),
    /** Plain-text 1-paragraph summary of what happened. Generated by the
     *  agent on its way out (or by a follow-up summariser if the run
     *  errored before reaching the summary step). The next K runs read
     *  the most recent K of these as the run-summary tail. */
    outputSummary: text('output_summary'),

    outcome: text('outcome')
      .$type<RoutineOutcome>()
      .notNull()
      .default('started'),
    costUsd: real('cost_usd'),
  },
  (table) => [
    index('routine_runs_routine_id_idx').on(table.routineId),
    index('routine_runs_started_at_idx').on(table.startedAt),
    index('routine_runs_routine_run_idx').on(table.routineId, table.runNumber),
  ],
)

// ─── routine_cadence_changes ────────────────────────────────────────

export const routineCadenceChanges = sqliteTable(
  'routine_cadence_changes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    routineId: text('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    fromInterval: integer('from_interval').notNull(),
    toInterval: integer('to_interval').notNull(),
    /** Free-text explanation from the agent (e.g. "no findings 3 fires
     *  in a row, slowing down"). */
    reason: text('reason'),
    /** Whether the change was applied (direct mode) or only logged
     *  (suggested mode). */
    applied: integer('applied', { mode: 'boolean' }).notNull().default(false),
    changedAt: integer('changed_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index('routine_cadence_changes_routine_id_idx').on(table.routineId),
  ],
)
