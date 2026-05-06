/**
 * Batch tasks — D1 helpers.
 *
 * Thin wrappers around drizzle for the routes + workflow consumers.
 * All mutations bump `updated_at` on the parent job so the UI's
 * auto-refresh polls show progress moving.
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, sql } from 'drizzle-orm'
import {
  batchItems,
  batchJobs,
  type BatchItem,
  type BatchJob,
  type NewBatchItem,
} from './db/schema'

export type ItemRef = { ref_kind: 'r2_file' | 'url' | 'text'; ref_value: string; label?: string }

export type CreateJobArgs = {
  userId: string
  conversationId?: string | null
  instruction: string
  taskKind: 'extract' | 'transform' | 'classify' | 'summarise' | 'free'
  model: string
  items: ItemRef[]
}

export async function createJob(db: D1Database, args: CreateJobArgs): Promise<BatchJob> {
  const d = drizzle(db)
  const jobId = crypto.randomUUID()
  await d.insert(batchJobs).values({
    id: jobId,
    userId: args.userId,
    conversationId: args.conversationId ?? null,
    instruction: args.instruction,
    taskKind: args.taskKind,
    model: args.model,
    status: 'queued',
    totalItems: args.items.length,
    completedItems: 0,
    failedItems: 0,
  })

  if (args.items.length > 0) {
    const itemRows: NewBatchItem[] = args.items.map((it) => ({
      id: crypto.randomUUID(),
      jobId,
      refKind: it.ref_kind,
      refValue: it.ref_value,
      label: it.label ?? null,
      status: 'pending',
      attempts: 0,
    }))
    // D1 has a parameter cap — chunk inserts to ~25 rows so we stay
    // under the limit even at the wide column count.
    const BATCH = 25
    for (let i = 0; i < itemRows.length; i += BATCH) {
      await d.insert(batchItems).values(itemRows.slice(i, i + BATCH))
    }
  }

  const [created] = await d.select().from(batchJobs).where(eq(batchJobs.id, jobId)).limit(1)
  if (!created) throw new Error(`createJob: row missing post-insert (id=${jobId})`)
  return created
}

export async function getJob(db: D1Database, userId: string, jobId: string): Promise<BatchJob | null> {
  const d = drizzle(db)
  const [row] = await d
    .select()
    .from(batchJobs)
    .where(and(eq(batchJobs.id, jobId), eq(batchJobs.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function listJobs(db: D1Database, userId: string, limit = 50): Promise<BatchJob[]> {
  const d = drizzle(db)
  return d
    .select()
    .from(batchJobs)
    .where(eq(batchJobs.userId, userId))
    .orderBy(desc(batchJobs.createdAt))
    .limit(limit)
}

export async function listItems(db: D1Database, jobId: string): Promise<BatchItem[]> {
  const d = drizzle(db)
  return d.select().from(batchItems).where(eq(batchItems.jobId, jobId))
}

export async function setJobWorkflowId(db: D1Database, jobId: string, workflowId: string): Promise<void> {
  await drizzle(db)
    .update(batchJobs)
    .set({ workflowId, status: 'running', updatedAt: new Date() })
    .where(eq(batchJobs.id, jobId))
}

export async function setJobStatus(
  db: D1Database,
  jobId: string,
  status: BatchJob['status'],
  resultSummary?: string,
): Promise<void> {
  await drizzle(db)
    .update(batchJobs)
    .set({
      status,
      ...(resultSummary !== undefined && { resultSummary }),
      updatedAt: new Date(),
    })
    .where(eq(batchJobs.id, jobId))
}

export async function startItem(db: D1Database, itemId: string): Promise<void> {
  await drizzle(db)
    .update(batchItems)
    .set({ status: 'running', startedAt: new Date(), attempts: sql`${batchItems.attempts} + 1` })
    .where(eq(batchItems.id, itemId))
}

export async function completeItem(db: D1Database, itemId: string, result: string): Promise<void> {
  const d = drizzle(db)
  const [row] = await d.select().from(batchItems).where(eq(batchItems.id, itemId)).limit(1)
  if (!row) return
  await d
    .update(batchItems)
    .set({ status: 'completed', result, completedAt: new Date() })
    .where(eq(batchItems.id, itemId))
  // Bump parent counts atomically.
  await d
    .update(batchJobs)
    .set({
      completedItems: sql`${batchJobs.completedItems} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(batchJobs.id, row.jobId))
}

export async function failItem(db: D1Database, itemId: string, error: string): Promise<void> {
  const d = drizzle(db)
  const [row] = await d.select().from(batchItems).where(eq(batchItems.id, itemId)).limit(1)
  if (!row) return
  await d
    .update(batchItems)
    .set({ status: 'failed', error, completedAt: new Date() })
    .where(eq(batchItems.id, itemId))
  await d
    .update(batchJobs)
    .set({
      failedItems: sql`${batchJobs.failedItems} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(batchJobs.id, row.jobId))
}
