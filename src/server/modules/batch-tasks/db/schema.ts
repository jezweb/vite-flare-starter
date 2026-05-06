/**
 * Batch tasks — durable fan-out jobs for "do this for each of N items".
 *
 * A `batch_jobs` row owns the high-level job (instruction, status, totals)
 * and is fanned out into many `batch_items` rows, one per input. The
 * Cloudflare Workflow defined in `../workflows/process-batch.ts` reads
 * batch_items, runs the per-item AI call inside a `step.do()`, writes the
 * result back to the row, and updates the parent counts.
 *
 * Item results are written straight to the row (not returned through the
 * step) because step.do() output is capped at 1MB.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const batchJobs = sqliteTable(
  'batch_jobs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** The chat conversation that kicked off the job (nullable: tool can be called from elsewhere). */
    conversationId: text('conversation_id'),
    /** What to do for every item. Plain English; injected into per-item prompt. */
    instruction: text('instruction').notNull(),
    /** Loose categorisation for filtering; the agent picks one of these. */
    taskKind: text('task_kind').notNull(), // 'extract' | 'transform' | 'classify' | 'summarise' | 'free'
    /** Model id used for every item (e.g. 'anthropic/claude-sonnet-4.6'). */
    model: text('model').notNull(),
    /** queued | running | completed | failed | cancelled */
    status: text('status').notNull().default('queued'),
    totalItems: integer('total_items').notNull(),
    completedItems: integer('completed_items').notNull().default(0),
    failedItems: integer('failed_items').notNull().default(0),
    /** Cloudflare Workflow instance id. Unset until the Workflow is created. */
    workflowId: text('workflow_id'),
    /** Aggregate output written when the Workflow finishes (JSON). */
    resultSummary: text('result_summary'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('batch_jobs_user_idx').on(t.userId, t.status, t.createdAt)],
)

export const batchItems = sqliteTable(
  'batch_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    jobId: text('job_id')
      .notNull()
      .references(() => batchJobs.id, { onDelete: 'cascade' }),
    /** What kind of input this is — drives how the worker fetches its content. */
    refKind: text('ref_kind').notNull(), // 'r2_file' | 'url' | 'text'
    /** The reference value: R2 key, URL, or inline text. */
    refValue: text('ref_value').notNull(),
    /** Friendly label for the items table in the UI. */
    label: text('label'),
    /** pending | running | completed | failed */
    status: text('status').notNull().default('pending'),
    /** AI output (JSON if structured, plain text otherwise). */
    result: text('result'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (t) => [index('batch_items_job_idx').on(t.jobId, t.status)],
)

export type BatchJob = typeof batchJobs.$inferSelect
export type NewBatchJob = typeof batchJobs.$inferInsert
export type BatchItem = typeof batchItems.$inferSelect
export type NewBatchItem = typeof batchItems.$inferInsert
