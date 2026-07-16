/**
 * Backup workflow — exportable-table discovery.
 *
 * The D1 export API hard-fails on databases containing FTS5 virtual
 * tables ("cannot export databases with Virtual Tables") — discovered
 * live 2026-07-17 against a scratch database. listExportableTables must
 * exclude virtual tables AND their shadow tables while keeping every
 * real table, including ones whose names merely *look* shadow-ish.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import { listExportableTables } from '@/server/modules/backups/workflow'

beforeAll(async () => {
  // A real table, an FTS5 virtual table over it (spawns _data/_idx/
  // _content/_docsize/_config shadows), and a decoy real table whose
  // name ends in _data but has no virtual parent.
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS bk_notes (id INTEGER PRIMARY KEY, body TEXT)'
  ).run()
  await env.DB.prepare(
    "CREATE VIRTUAL TABLE IF NOT EXISTS bk_notes_fts USING fts5(body, content='bk_notes', content_rowid='id')"
  ).run()
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS market_data (id INTEGER PRIMARY KEY, v TEXT)'
  ).run()
})

describe('listExportableTables', () => {
  it('keeps real tables, drops virtual tables and their shadows', async () => {
    const tables = await listExportableTables(env.DB)
    expect(tables).toContain('bk_notes')
    expect(tables).toContain('market_data') // _data suffix but no virtual parent
    expect(tables).not.toContain('bk_notes_fts')
    for (const shadow of ['data', 'idx', 'content', 'docsize', 'config']) {
      expect(tables).not.toContain(`bk_notes_fts_${shadow}`)
    }
  })

  it('never returns sqlite internals or _cf bookkeeping tables', async () => {
    const tables = await listExportableTables(env.DB)
    expect(tables.some((t) => t.startsWith('sqlite_') || t.startsWith('_cf'))).toBe(false)
  })
})
