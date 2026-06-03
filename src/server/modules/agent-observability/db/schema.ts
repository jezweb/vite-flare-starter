/**
 * agent_runs — per-invocation telemetry for AutonomousAgent runs
 *
 * Written automatically by AutonomousAgent.runOnce on every
 * invocation (REST, schedule, webhook, inter-agent). One row per run.
 *
 * Different shape from `aiUsageLogs` (which is per-LLM-call):
 *   - aiUsageLogs: every model call gets a row, no agent context
 *   - agent_runs: every agent invocation gets a row, sums LLM cost
 *
 * Use agent_runs for "show me everything ResearcherAgent:cf-workers
 * did today" style queries; aiUsageLogs for raw usage by model.
 */
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

/**
 * Run outcome states.
 *
 *   - 'started'         — row inserted, run hasn't terminated yet. Any row
 *                         that's still in this state long after `startedAt`
 *                         is a stuck/incomplete run (process killed,
 *                         missed final update, OOM). Surface those in
 *                         observability as a real failure mode rather
 *                         than silently showing them as 'ok'.
 *   - 'ok'              — terminal: completed normally
 *   - 'error'           — terminal: threw or hit a tool failure
 *   - 'budget_exceeded' — terminal: stopped by daily-cap gate
 */
export type AgentRunOutcome = 'started' | 'ok' | 'error' | 'budget_exceeded'
export type AgentRunTrigger = 'rest' | 'schedule' | 'webhook' | 'inter_agent'

export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentClass: text('agent_class').notNull(),
    agentName: text('agent_name').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    trigger: text('trigger').$type<AgentRunTrigger>().notNull().default('rest'),
    /** Truncated input text (first ~500 chars). Helps debug why the
     *  agent decided to do what it did. */
    inputSummary: text('input_summary'),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    durationMs: integer('duration_ms'),
    outcome: text('outcome').$type<AgentRunOutcome>().notNull().default('started'),
    errorMessage: text('error_message'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    /** Estimated USD cost for this run (sum of per-LLM-call costs). */
    costUsd: real('cost_usd'),
    /** Number of LLM agent loop steps (tool calls included). */
    steps: integer('steps').notNull().default(0),
    /** Comma-separated tool names called this run (bounded, ~500 chars). */
    toolsCalled: text('tools_called'),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index('agent_runs_user_id_idx').on(table.userId),
    index('agent_runs_class_idx').on(table.agentClass),
    index('agent_runs_user_class_idx').on(table.userId, table.agentClass),
    index('agent_runs_started_at_idx').on(table.startedAt),
    index('agent_runs_outcome_idx').on(table.outcome),
  ]
)
