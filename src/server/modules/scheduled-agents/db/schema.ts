/**
 * scheduled_runs — telemetry for every ScheduledAgent alarm fire.
 *
 * One row per fire (success OR failure). Used by:
 *   - Retry policy: count prior attempts for the same (className, name, scheduled_at)
 *   - Admin / observability: query the most recent N runs of an agent
 *   - Dead-letter analysis: outcome='final_error' rows surface as work
 *     that needs human attention
 *
 * Free-form `resultJson` lets subclasses record whatever they care
 * about (item counts, summaries, downstream IDs) without per-agent
 * schema changes.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export type ScheduledRunOutcome = 'ok' | 'error' | 'final_error'

export const scheduledRuns = sqliteTable(
  'scheduled_runs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    /** DO class (e.g. 'ReminderAgent'). */
    className: text('class_name').notNull(),
    /** The string passed to `idFromName()` — usually `${userId}:${kind}`
     *  or a UUID. Caller-defined; keeps storage agnostic of partition style. */
    name: text('name').notNull(),
    /** Optional user scope. Null for system-wide agents. */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    /** When this fire was originally scheduled (ms). */
    scheduledAt: integer('scheduled_at').notNull(),
    /** When the alarm actually fired (ms) — DO alarms are best-effort,
     *  may run a few seconds late on cold-start. */
    firedAt: integer('fired_at').notNull(),
    durationMs: integer('duration_ms'),
    outcome: text('outcome').$type<ScheduledRunOutcome>().notNull(),
    /** 1 for first try, increments per retry up to maxAttempts. */
    attempt: integer('attempt').notNull().default(1),
    errorMessage: text('error_message'),
    /** Free-form JSON the subclass writes via `recordResult()`. */
    resultJson: text('result_json'),
    createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index('scheduled_runs_class_name_idx').on(table.className),
    index('scheduled_runs_name_idx').on(table.name),
    index('scheduled_runs_user_id_idx').on(table.userId),
    index('scheduled_runs_fired_at_idx').on(table.firedAt),
  ],
)
