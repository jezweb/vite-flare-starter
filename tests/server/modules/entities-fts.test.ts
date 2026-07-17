/**
 * Entities FTS index — all-fields extraction (#62(5)).
 *
 * Applies the 20260717034646 migration SQL against the real engine and
 * pins the behaviour the wiki fork depends on: every top-level text
 * value in `fields` is searchable (not just $.body), non-text values
 * stay out of the index, and the update trigger re-indexes.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import { searchFTS } from '@/server/lib/search'

async function applyMigrationLike() {
  // Minimal entities table (the real one has more columns; the FTS
  // triggers only touch rowid/title/fields).
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS entities (
       id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
       title TEXT, fields TEXT, updated_at INTEGER
     )`
  ).run()
  const statements = [
    `DROP TRIGGER IF EXISTS "entities_fts_ai"`,
    `DROP TRIGGER IF EXISTS "entities_fts_au"`,
    `DROP TRIGGER IF EXISTS "entities_fts_ad"`,
    `DROP TABLE IF EXISTS "entities_fts"`,
    `CREATE VIRTUAL TABLE "entities_fts" USING fts5(title, body)`,
    `CREATE TRIGGER "entities_fts_ai" AFTER INSERT ON "entities" BEGIN
       INSERT INTO "entities_fts"(rowid, title, body) VALUES (
         NEW.rowid, COALESCE(NEW.title, ''),
         COALESCE((SELECT group_concat(value, ' ') FROM json_each(NEW.fields) WHERE type = 'text'), '')
       );
     END`,
    `CREATE TRIGGER "entities_fts_au" AFTER UPDATE ON "entities" BEGIN
       DELETE FROM "entities_fts" WHERE rowid = OLD.rowid;
       INSERT INTO "entities_fts"(rowid, title, body) VALUES (
         NEW.rowid, COALESCE(NEW.title, ''),
         COALESCE((SELECT group_concat(value, ' ') FROM json_each(NEW.fields) WHERE type = 'text'), '')
       );
     END`,
    `CREATE TRIGGER "entities_fts_ad" AFTER DELETE ON "entities" BEGIN
       DELETE FROM "entities_fts" WHERE rowid = OLD.rowid;
     END`,
  ]
  for (const s of statements) await env.DB.prepare(s).run()
}

const insert = (id: string, userId: string, title: string, fields: Record<string, unknown>) =>
  env.DB.prepare(
    `INSERT INTO entities (id, user_id, type, title, fields, updated_at) VALUES (?, ?, 'note', ?, ?, 1)`
  )
    .bind(id, userId, title, JSON.stringify(fields))
    .run()

const search = (query: string, opts?: { where?: string; whereParams?: unknown[] }) =>
  searchFTS<{ id: string; title: string }>(env.DB, {
    ftsTable: 'entities_fts',
    sourceTable: 'entities',
    query,
    select: '"entities".id, "entities".title',
    ...opts,
  })

describe('entities FTS — all top-level text fields indexed', () => {
  beforeAll(async () => {
    await applyMigrationLike()
    await env.DB.prepare('DELETE FROM entities').run()
    await insert('e1', 'u1', 'Alpha note', { body: 'kangaroo habitats' })
    await insert('e2', 'u1', 'Beta page', { content: 'wombat burrow engineering' })
    await insert('e3', 'u2', 'Gamma record', {
      description: 'echidna spines',
      priority: 5,
      nested: { hidden: 'platypus' },
    })
  })

  it('matches text under $.body (original behaviour preserved)', async () => {
    const { results } = await search('kangaroo')
    expect(results.map((r) => r.id)).toEqual(['e1'])
  })

  it('matches text under arbitrary keys ($.content, $.description)', async () => {
    expect((await search('wombat')).results.map((r) => r.id)).toEqual(['e2'])
    expect((await search('echidna')).results.map((r) => r.id)).toEqual(['e3'])
  })

  it('does NOT index nested-object values or numbers', async () => {
    expect((await search('platypus')).results).toEqual([])
  })

  it('update trigger re-indexes changed fields', async () => {
    await env.DB.prepare(`UPDATE entities SET fields = ? WHERE id = 'e2'`)
      .bind(JSON.stringify({ content: 'quokka island survey' }))
      .run()
    expect((await search('wombat')).results).toEqual([])
    expect((await search('quokka')).results.map((r) => r.id)).toEqual(['e2'])
  })

  it('per-user where clause scopes results (tenancy per-user mode shape)', async () => {
    const { results } = await search('echidna', {
      where: '"entities".user_id = ?',
      whereParams: ['u1'],
    })
    expect(results).toEqual([]) // e3 belongs to u2
  })

  it('delete trigger removes rows from the index', async () => {
    await env.DB.prepare(`DELETE FROM entities WHERE id = 'e1'`).run()
    expect((await search('kangaroo')).results).toEqual([])
  })
})
