/**
 * D1BackupWorkflow — daily D1 export → R2, beyond Time Travel's window.
 *
 * D1's built-in Time Travel gives 30 days (paid) / 7 days (free) of
 * point-in-time restore with zero setup — this workflow is for KEEPING
 * backups past that window (compliance, long-term retention, restore
 * into a different database). Follows Cloudflare's official pattern:
 * https://developers.cloudflare.com/workflows/examples/backup-d1/
 *
 *   step "list tables"   — real tables only (D1 export HARD-FAILS on FTS5
 *                          virtual tables, so we allowlist around them)
 *   step "start export"  — POST /d1/database/{id}/export (polling mode)
 *   step "poll export"   — re-poll with the bookmark until signed_url
 *   step "save to R2"    — stream the SQL dump into FILES under _backups/
 *   step "prune"         — delete backups older than BACKUP_RETENTION_DAYS
 *
 * Storage: the FILES bucket under the `_backups/` prefix — outside the
 * `users/<id>/` space `isOwnedR2Key` guards, readable only via the
 * admin backup routes. Production forks with compliance needs should
 * move to a dedicated bucket (one binding swap). Restore runbook:
 * docs/BACKUPS.md.
 *
 * Needs (see docs/BACKUPS.md for setup):
 *   CLOUDFLARE_ACCOUNT_ID  — var
 *   D1_DATABASE_ID         — var (wrangler.jsonc d1_databases[0].database_id)
 *   D1_REST_API_TOKEN      — secret with D1 read permission
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import type {
  D1Database,
  R2Bucket,
  ReadableStream as WorkersReadableStream,
} from '@cloudflare/workers-types'

export interface BackupWorkflowEnv {
  DB: D1Database
  FILES: R2Bucket
  CLOUDFLARE_ACCOUNT_ID?: string
  D1_DATABASE_ID?: string
  D1_REST_API_TOKEN?: string
  BACKUP_RETENTION_DAYS?: string
}

export const BACKUP_PREFIX = '_backups/'
const MAX_POLLS = 30

interface ExportResponse {
  success: boolean
  errors?: { message: string }[]
  result?: {
    at_bookmark?: string
    status?: string
    /** Export-level failure (e.g. FTS5 virtual tables) — nested, NOT in top-level errors[]. */
    error?: string
    /** On the completing poll the payload nests AGAIN: result.result.signed_url. */
    result?: { filename?: string; signed_url?: string }
  }
}

/**
 * Tables the export can include. The D1 export API HARD-FAILS on any
 * database containing FTS5 virtual tables ("cannot export databases
 * with Virtual Tables") — and this starter has several. The fix is an
 * explicit allowlist: every real table EXCEPT virtual tables and their
 * FTS5 shadow tables (<vt>_data/_idx/_content/_docsize/_config), which
 * are meaningless to restore without their parent. FTS indexes rebuild
 * from migrations + sync triggers after a restore (docs/BACKUPS.md).
 */
export async function listExportableTables(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%'`
    )
    .all<{ name: string; sql: string | null }>()
  const virtual = new Set(
    rows.results
      .filter((r) => (r.sql ?? '').toUpperCase().startsWith('CREATE VIRTUAL TABLE'))
      .map((r) => r.name)
  )
  const isShadow = (name: string) =>
    [...virtual].some((vt) => /^(data|idx|content|docsize|config)$/.test(name.slice(vt.length + 1)) && name.startsWith(`${vt}_`))
  return rows.results
    .map((r) => r.name)
    .filter((name) => !virtual.has(name) && !isShadow(name))
}

export class D1BackupWorkflow extends WorkflowEntrypoint<BackupWorkflowEnv, unknown> {
  override async run(event: WorkflowEvent<unknown>, step: WorkflowStep) {
    const accountId = this.env.CLOUDFLARE_ACCOUNT_ID
    const databaseId = this.env.D1_DATABASE_ID
    const token = this.env.D1_REST_API_TOKEN
    if (!accountId || !databaseId || !token) {
      throw new Error(
        'Backup not configured: CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID and D1_REST_API_TOKEN are required (docs/BACKUPS.md)'
      )
    }
    const exportUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/export`
    const headers = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    }

    // 1. Discover exportable tables (excludes FTS5 virtual tables +
    // shadows — the export API hard-fails on them otherwise).
    const tables = (await step.do('list exportable tables', async () =>
      listExportableTables(this.env.DB)
    )) as string[]
    if (tables.length === 0) throw new NonRetryableError('no exportable tables found')

    /** Nested export errors (result.error) are terminal — retrying can't fix FTS5/schema complaints. */
    const throwIfExportError = (data: ExportResponse) => {
      if (data.result?.error) {
        throw new NonRetryableError(`export failed: ${data.result.error}`)
      }
      if (data.errors?.length) {
        throw new Error(`export API error: ${data.errors[0]?.message}`)
      }
    }

    // 2. Kick the export and capture the bookmark that pins it.
    const bookmark = (await step.do(
      'start export',
      { retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' } },
      async () => {
        const res = await fetch(exportUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ output_format: 'polling', dump_options: { tables } }),
        })
        const data = (await res.json()) as ExportResponse
        throwIfExportError(data)
        if (!data.result?.at_bookmark) {
          throw new Error(`export start failed: HTTP ${res.status}`)
        }
        return data.result.at_bookmark
      }
    )) as string

    // 3. Poll (each poll its own step — cheap, durable, resumable).
    let signedUrl: string | null = null
    for (let i = 0; i < MAX_POLLS && !signedUrl; i++) {
      if (i > 0) await step.sleep(`wait ${i}`, '5 seconds')
      signedUrl = (await step.do(
        `poll export ${i + 1}`,
        { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' } },
        async () => {
          const res = await fetch(exportUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              output_format: 'polling',
              current_bookmark: bookmark,
              dump_options: { tables },
            }),
          })
          const data = (await res.json()) as ExportResponse
          throwIfExportError(data)
          // Verified live 2026-07-17: the URL arrives doubly nested on the
          // completing poll (result.result.signed_url) — reading one level
          // up polls forever, then dies on "Not currently exporting".
          return data.result?.result?.signed_url ?? null
        }
      )) as string | null
    }
    if (!signedUrl) throw new Error(`export did not finish after ${MAX_POLLS} polls`)

    // 4. Stream the dump into R2. Key embeds the timestamp for pruning.
    const key = (await step.do(
      'save to R2',
      { retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' } },
      async () => {
        const dump = await fetch(signedUrl as string)
        if (!dump.ok || !dump.body) throw new Error(`dump download failed: ${dump.status}`)
        // Seconds precision + a short suffix from the export bookmark (unique
        // per run) so two runs in the same minute can't overwrite each other's
        // object. Timestamp stays lexicographically sortable for pruning.
        const stamp = event.timestamp.toISOString().replace(/[:]/g, '-').slice(0, 19)
        const suffix = bookmark.slice(-8).replace(/[^\w]/g, '')
        const objectKey = `${BACKUP_PREFIX}${stamp}-${suffix}.sql`
        // lib.dom's ReadableStream vs workers-types' — same object at
        // runtime in workerd, but the ambient fetch types disagree.
        await this.env.FILES.put(objectKey, dump.body as unknown as WorkersReadableStream)
        return objectKey
      }
    )) as string

    // 5. Retention pruning — uses R2's own `uploaded` timestamps.
    const retentionDays = Number(this.env.BACKUP_RETENTION_DAYS) || 30
    const pruned = (await step.do('prune old backups', async () => {
      const cutoff = event.timestamp.getTime() - retentionDays * 86_400_000
      const listing = await this.env.FILES.list({ prefix: BACKUP_PREFIX })
      const stale = listing.objects.filter((o) => o.uploaded.getTime() < cutoff)
      for (const obj of stale) await this.env.FILES.delete(obj.key)
      return stale.length
    })) as number

    return { key, pruned, retentionDays }
  }
}
