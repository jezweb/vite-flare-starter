/**
 * MirrorSyncWorkflow — cron → durable Workflow → D1 (issue #90).
 *
 * The reference pattern for mirroring an external reference dataset into
 * D1 and keeping it current. Why a Workflow instead of a bare cron
 * handler: a full mirror can exceed a single invocation's subrequest
 * budget, and each `step.do` gets its own retry envelope — one flaky
 * batch retries alone instead of aborting the whole run.
 *
 * Shape:
 *   step "list source"   — one fetch of the full current dataset
 *   step "sync batch N"  — upsert a chunk; per-item try/catch so one bad
 *                          record can't poison its batch
 *   step "prune stale"   — optional: delete rows the source no longer has
 *
 * Kick it three ways: the cron guard in index.ts (when MIRROR_CRON=true
 * and data is stale), POST /api/mirror/refresh (admin, manual), or
 * `env.MIRROR_WORKFLOW.create()` from your own code.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import type { D1Database } from '@cloudflare/workers-types'
import { listSourceRecords, type SourceRecord } from './source'

interface MirrorWorkflowEnv {
  DB: D1Database
}

export interface MirrorWorkflowParams {
  /** Delete rows absent from this sync (source is authoritative). */
  prune?: boolean
}

/** Batch size per step — each step is one D1 batch() round-trip. */
const CHUNK_SIZE = 50

export class MirrorSyncWorkflow extends WorkflowEntrypoint<MirrorWorkflowEnv, MirrorWorkflowParams> {
  override async run(event: WorkflowEvent<MirrorWorkflowParams>, step: WorkflowStep) {
    // step.do output must be Serializable (and is capped at 1MB) — carry
    // the payload as a JSON string across the step boundary. A dataset
    // too large for the cap should write to D1 inside the list step
    // instead (see process-batch.ts for that variant).
    const records = (await step.do(
      'list source records',
      { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' } },
      async () => {
        const list = await listSourceRecords()
        return list.map((r) => ({
          externalId: r.externalId,
          name: r.name,
          payload: JSON.stringify(r.payload),
        }))
      }
    )) as { externalId: string; name: string; payload: string }[]

    const syncedAt = Math.floor(event.timestamp.getTime() / 1000)
    let synced = 0
    let failed = 0

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records
        .slice(i, i + CHUNK_SIZE)
        .map((r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }))
      const result = (await step.do(
        `sync batch ${Math.floor(i / CHUNK_SIZE) + 1}`,
        { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' } },
        async () => syncChunk(this.env.DB, chunk, syncedAt)
      )) as { synced: number; failed: number }
      synced += result.synced
      failed += result.failed
    }

    let pruned = 0
    if (event.payload.prune) {
      pruned = await step.do('prune stale records', async () =>
        deleteStaleRecords(this.env.DB, syncedAt)
      )
    }

    return { total: records.length, synced, failed, pruned, syncedAt }
  }
}

/**
 * Upsert a chunk. Per-item try/catch: one malformed record logs and
 * skips instead of failing the batch (a step retry can't fix bad data).
 */
export async function syncChunk(
  db: D1Database,
  chunk: SourceRecord[],
  syncedAt: number
): Promise<{ synced: number; failed: number }> {
  let synced = 0
  let failed = 0
  const stmt = db.prepare(
    `INSERT INTO mirror_records (external_id, name, payload, synced_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(external_id) DO UPDATE SET
       name = excluded.name,
       payload = excluded.payload,
       synced_at = excluded.synced_at`
  )
  const bound = []
  for (const record of chunk) {
    try {
      bound.push(stmt.bind(record.externalId, record.name, JSON.stringify(record.payload), syncedAt))
    } catch (err) {
      failed++
      console.error(
        JSON.stringify({
          event: 'mirror_record_bind_failed',
          externalId: record.externalId,
          error: err instanceof Error ? err.message : String(err),
        })
      )
    }
  }
  if (bound.length > 0) {
    // db.batch is atomic per D1; if the whole batch throws, the step's
    // retry envelope handles it (transient D1 errors ARE retryable).
    await db.batch(bound)
    synced = bound.length
  }
  return { synced, failed }
}

/** Rows not touched by this sync = gone from the source. */
export async function deleteStaleRecords(db: D1Database, syncedAt: number): Promise<number> {
  const result = await db
    .prepare('DELETE FROM mirror_records WHERE synced_at < ?')
    .bind(syncedAt)
    .run()
  return result.meta.changes ?? 0
}

/** Freshness summary for the admin endpoint + cron staleness guard. */
export async function mirrorFreshness(
  db: D1Database
): Promise<{ count: number; lastSyncedAt: number | null }> {
  const row = await db
    .prepare('SELECT COUNT(*) as count, MAX(synced_at) as last FROM mirror_records')
    .first<{ count: number; last: number | null }>()
  return { count: row?.count ?? 0, lastSyncedAt: row?.last ?? null }
}
