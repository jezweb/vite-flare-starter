/**
 * entities_fts — issue #62 item 5.
 *
 * Verifies the FTS5 index over the `entities` table stays in sync with
 * the source rows on INSERT/UPDATE/DELETE. Spotting bugs here is the
 * difference between "search returns this" and "search returns nothing
 * even though the row exists".
 *
 * Migrations don't auto-apply in this project's vitest harness, so the
 * test re-creates the entities table + FTS5 plumbing in `beforeAll` —
 * mirrors the pattern in tests/server/modules/routines.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { searchFTS } from '@/server/lib/search'

const USER_ID = 'test-user-entities-fts'

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const stmt = env.DB.prepare(sql)
  await (params.length > 0 ? stmt.bind(...params).run() : stmt.run())
}

async function ensureSchema(): Promise<void> {
  // Minimal entities table — just the columns the FTS triggers touch
  // (id, user_id, type, title, fields). Other columns from the real
  // schema (status, assignee_id, etc) are omitted because they're not
  // part of this contract.
  await runSql(`CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    fields TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`)

  await runSql(`CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(title, body)`)

  await runSql(`CREATE TRIGGER IF NOT EXISTS entities_fts_ai AFTER INSERT ON entities BEGIN
    INSERT INTO entities_fts(rowid, title, body) VALUES (
      NEW.rowid,
      COALESCE(NEW.title, ''),
      COALESCE(JSON_EXTRACT(NEW.fields, '$.body'), '')
    );
  END`)

  await runSql(`CREATE TRIGGER IF NOT EXISTS entities_fts_au AFTER UPDATE ON entities BEGIN
    DELETE FROM entities_fts WHERE rowid = OLD.rowid;
    INSERT INTO entities_fts(rowid, title, body) VALUES (
      NEW.rowid,
      COALESCE(NEW.title, ''),
      COALESCE(JSON_EXTRACT(NEW.fields, '$.body'), '')
    );
  END`)

  await runSql(`CREATE TRIGGER IF NOT EXISTS entities_fts_ad AFTER DELETE ON entities BEGIN
    DELETE FROM entities_fts WHERE rowid = OLD.rowid;
  END`)
}

async function clearTables(): Promise<void> {
  // FTS table goes first so the trigger doesn't trip on a missing
  // index entry.
  await runSql('DELETE FROM entities')
}

async function insertEntity(opts: {
  id: string
  type: string
  title: string
  body: string
}): Promise<void> {
  const fields = JSON.stringify({ body: opts.body })
  const now = Math.floor(Date.now() / 1000)
  await runSql(
    `INSERT INTO entities (id, user_id, type, title, fields, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [opts.id, USER_ID, opts.type, opts.title, fields, now, now]
  )
}

async function search(query: string) {
  return searchFTS<{ id: string; type: string; title: string; body: string | null }>(env.DB, {
    ftsTable: 'entities_fts',
    sourceTable: 'entities',
    query,
    limit: 20,
    select:
      '"entities".id, "entities".type, "entities".title, JSON_EXTRACT("entities".fields, \'$.body\') AS body',
    where: '"entities".user_id = ?',
    whereParams: [USER_ID],
  })
}

describe('entities_fts — full-text search over entities', () => {
  beforeAll(async () => {
    await ensureSchema()
  })

  beforeEach(async () => {
    await clearTables()
  })

  it('insert + search returns the matching entity by body content', async () => {
    await insertEntity({
      id: 'e1',
      type: 'finding',
      title: 'Norton Commando',
      body: '1968-1973 production run of the 750cc British twin.',
    })

    const { results } = await search('norton')
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe('e1')
    expect(results[0]!.title).toBe('Norton Commando')

    // Body-only term should also hit (proves JSON_EXTRACT path works).
    const byBody = await search('British')
    expect(byBody.results.map((r) => r.id)).toContain('e1')
  })

  it('update changes the indexed body — old text no longer matches, new text does', async () => {
    await insertEntity({
      id: 'e2',
      type: 'learning',
      title: 'Aussie native plants',
      body: 'Grevillea attracts honeyeaters in spring.',
    })

    // Confirm the original body is searchable.
    const before = await search('grevillea')
    expect(before.results.map((r) => r.id)).toContain('e2')

    // Replace the body with completely different content.
    const newFields = JSON.stringify({
      body: 'Banksia integrifolia tolerates coastal salt spray.',
    })
    await runSql(`UPDATE entities SET fields = ? WHERE id = ?`, [newFields, 'e2'])

    const oldTerm = await search('grevillea')
    expect(oldTerm.results.map((r) => r.id)).not.toContain('e2')

    const newTerm = await search('banksia')
    expect(newTerm.results.map((r) => r.id)).toContain('e2')
  })

  it('delete removes the row from search', async () => {
    await insertEntity({
      id: 'e3',
      type: 'note',
      title: 'Tasmanian tigers',
      body: 'Thylacines were declared extinct in 1936.',
    })

    // FTS5 default tokenizer is exact-token, no stemming. The body says
    // "Thylacines" (plural) so we search for the exact form, OR use
    // a prefix query (`thylacine*`) to match. Use the prefix form here
    // — that's what production search would do for partial typing.
    const before = await search('thylacine*')
    expect(before.results.map((r) => r.id)).toContain('e3')

    await runSql(`DELETE FROM entities WHERE id = ?`, ['e3'])

    const after = await search('thylacine*')
    expect(after.results.map((r) => r.id)).not.toContain('e3')
  })
})
