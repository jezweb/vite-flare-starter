/**
 * D1 mirror pattern (issue #90) — sync helpers.
 *
 * Covers the contracts the Workflow relies on:
 *   - syncChunk upserts (insert new, update existing) and stamps syncedAt
 *   - deleteStaleRecords removes only rows older than the current sync
 *   - mirrorFreshness reports count + MAX(synced_at)
 *
 * Migrations don't auto-apply in the vitest harness — table created in
 * beforeAll, mirroring tests/server/search/entities-fts.test.ts.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import {
  syncChunk,
  deleteStaleRecords,
  mirrorFreshness,
} from '@/server/modules/mirror/workflow'

beforeAll(async () => {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS mirror_records (
      external_id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      synced_at INTEGER NOT NULL
    )`
  ).run()
})

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM mirror_records').run()
})

const record = (id: string, name = `Name ${id}`) => ({
  externalId: id,
  name,
  payload: { tier: 'demo' },
})

describe('syncChunk', () => {
  it('inserts new records with the sync timestamp', async () => {
    const result = await syncChunk(env.DB, [record('AU'), record('NZ')], 1000)
    expect(result).toEqual({ synced: 2, failed: 0 })
    const { count, lastSyncedAt } = await mirrorFreshness(env.DB)
    expect(count).toBe(2)
    expect(lastSyncedAt).toBe(1000)
  })

  it('updates existing records in place (upsert, no duplicates)', async () => {
    await syncChunk(env.DB, [record('AU', 'Australia')], 1000)
    await syncChunk(env.DB, [record('AU', 'Australia (updated)')], 2000)
    const rows = await env.DB.prepare('SELECT * FROM mirror_records').all()
    expect(rows.results).toHaveLength(1)
    expect(rows.results[0]?.['name']).toBe('Australia (updated)')
    expect(rows.results[0]?.['synced_at']).toBe(2000)
  })
})

describe('deleteStaleRecords', () => {
  it('removes only rows the latest sync did not touch', async () => {
    await syncChunk(env.DB, [record('AU'), record('NZ'), record('FJ')], 1000)
    // Next sync: FJ gone from the source.
    await syncChunk(env.DB, [record('AU'), record('NZ')], 2000)
    const pruned = await deleteStaleRecords(env.DB, 2000)
    expect(pruned).toBe(1)
    const rows = await env.DB.prepare(
      'SELECT external_id FROM mirror_records ORDER BY external_id'
    ).all()
    expect(rows.results.map((r) => r['external_id'])).toEqual(['AU', 'NZ'])
  })
})

describe('mirrorFreshness', () => {
  it('reports empty state as count 0 / null timestamp', async () => {
    expect(await mirrorFreshness(env.DB)).toEqual({ count: 0, lastSyncedAt: null })
  })
})
