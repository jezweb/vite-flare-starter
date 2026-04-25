import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const aiUsageLogs = sqliteTable('ai_usage_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  finishReason: text('finish_reason'),
  durationMs: integer('duration_ms'),
  /** Estimated USD cost of this turn — input_tokens × inputPrice/M
   *  + output_tokens × outputPrice/M. Pulled from the bundled model
   *  catalogue. Null when the model isn't priced (Workers AI, unknown
   *  ids). Costs reflect catalogue list prices; OpenRouter adds a
   *  small markup over direct provider rates which we don't model here. */
  costUsd: real('cost_usd'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('ai_usage_logs_user_id_idx').on(table.userId),
  index('ai_usage_logs_created_at_idx').on(table.createdAt),
])

/**
 * Per-step telemetry for agent tool calls. One row per tool invocation.
 * `aiUsageLogs` stays aggregate-per-request; this is the step-level detail
 * for observability (latency distribution, failure patterns, tool mix).
 *
 * Written from `onStepFinish` in `buildChatAgent`. Read by the admin panel's
 * "Recent tool errors" strip (`tool_error IS NOT NULL`).
 */
export const aiToolCalls = sqliteTable('ai_tool_calls', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  model: text('model').notNull(),
  stepIndex: integer('step_index').notNull(),
  toolName: text('tool_name').notNull(),
  toolDurationMs: integer('tool_duration_ms'),
  toolError: text('tool_error'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  /** Estimated USD cost of this step. Per-step costs sum to roughly
   *  the parent aiUsageLogs row's costUsd — minor drift is expected
   *  because total-usage tokens are reported separately from step
   *  usage by the AI SDK. */
  costUsd: real('cost_usd'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('ai_tool_calls_user_id_idx').on(table.userId),
  index('ai_tool_calls_created_at_idx').on(table.createdAt),
  index('ai_tool_calls_tool_name_idx').on(table.toolName),
])
