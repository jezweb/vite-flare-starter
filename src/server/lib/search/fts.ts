/**
 * Full-Text Search (FTS5) Utilities for D1
 *
 * D1 supports SQLite FTS5 — this module provides helpers for creating
 * virtual tables, keeping them in sync, and querying with BM25 ranking.
 *
 * Pattern: create an FTS index for any table, add sync triggers, then
 * call search() to get ranked results.
 *
 * @example
 * // In a migration (raw SQL):
 * await createFTSIndex(db, {
 *   table: 'conversations',
 *   columns: ['title'],
 *   ftsTable: 'conversations_fts',
 * })
 *
 * // Search:
 * const results = await searchFTS(db, {
 *   ftsTable: 'conversations_fts',
 *   sourceTable: 'conversations',
 *   query: 'meeting notes',
 *   limit: 20,
 * })
 */

/**
 * Create an FTS5 virtual table + sync triggers.
 *
 * Call this once (idempotent — uses IF NOT EXISTS). Typically in a migration
 * or a one-time setup endpoint.
 */
export async function createFTSIndex(
  db: D1Database,
  opts: {
    /** Source table name. */
    table: string
    /** Columns to index (must exist on the source table). */
    columns: string[]
    /** FTS virtual table name (default: `${table}_fts`). */
    ftsTable?: string
    /** Row ID column in the source table (default: 'rowid'). */
    rowId?: string
  }
): Promise<void> {
  const fts = opts.ftsTable ?? `${opts.table}_fts`
  const cols = opts.columns
  const rowId = opts.rowId ?? 'rowid'
  const colList = cols.join(', ')

  const statements = [
    // Create the FTS5 virtual table. content= links it to the source table
    // so we don't duplicate storage — FTS only stores the index.
    `CREATE VIRTUAL TABLE IF NOT EXISTS "${fts}" USING fts5(${colList}, content="${opts.table}", content_rowid="${rowId}")`,

    // INSERT trigger — index new rows
    `CREATE TRIGGER IF NOT EXISTS "${fts}_ai" AFTER INSERT ON "${opts.table}" BEGIN
      INSERT INTO "${fts}"(rowid, ${colList}) VALUES (NEW.${rowId}, ${cols.map((c) => `NEW.${c}`).join(', ')});
    END`,

    // DELETE trigger — remove from index
    `CREATE TRIGGER IF NOT EXISTS "${fts}_ad" AFTER DELETE ON "${opts.table}" BEGIN
      INSERT INTO "${fts}"("${fts}", rowid, ${colList}) VALUES ('delete', OLD.${rowId}, ${cols.map((c) => `OLD.${c}`).join(', ')});
    END`,

    // UPDATE trigger — re-index changed rows
    `CREATE TRIGGER IF NOT EXISTS "${fts}_au" AFTER UPDATE ON "${opts.table}" BEGIN
      INSERT INTO "${fts}"("${fts}", rowid, ${colList}) VALUES ('delete', OLD.${rowId}, ${cols.map((c) => `OLD.${c}`).join(', ')});
      INSERT INTO "${fts}"(rowid, ${colList}) VALUES (NEW.${rowId}, ${cols.map((c) => `NEW.${c}`).join(', ')});
    END`,
  ]

  await db.batch(statements.map((s) => db.prepare(s)))
}

/**
 * Search an FTS5 index with BM25 ranking.
 *
 * Returns matching row IDs with their rank score, joined to the source
 * table so you get full rows back.
 */
export async function searchFTS<T = Record<string, unknown>>(
  db: D1Database,
  opts: {
    /** FTS virtual table name. */
    ftsTable: string
    /** Source table to join against. */
    sourceTable: string
    /** Search query (supports FTS5 syntax: AND, OR, NOT, "phrases", prefix*). */
    query: string
    /** Maximum results (default: 20). */
    limit?: number
    /** Additional WHERE clause on the source table (e.g. 'user_id = ?'). */
    where?: string
    /** Bind params for the additional WHERE clause. */
    whereParams?: unknown[]
    /** Columns to select from the source table (default: '*'). */
    select?: string
  }
): Promise<{ results: T[]; query: string }> {
  const limit = opts.limit ?? 20
  const select = opts.select ?? `"${opts.sourceTable}".*`
  const extraWhere = opts.where ? ` AND ${opts.where}` : ''

  // FTS5 query with BM25 ranking, joined to source table
  const sql = `
    SELECT ${select}, rank
    FROM "${opts.ftsTable}"
    JOIN "${opts.sourceTable}" ON "${opts.sourceTable}".rowid = "${opts.ftsTable}".rowid
    WHERE "${opts.ftsTable}" MATCH ?${extraWhere}
    ORDER BY rank
    LIMIT ?
  `

  const params = [opts.query, ...(opts.whereParams ?? []), limit]
  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<T & { rank: number }>()

  return { results: results ?? [], query: opts.query }
}

/**
 * Rebuild an FTS index from scratch. Use after bulk imports or if the
 * index gets out of sync.
 */
export async function rebuildFTSIndex(db: D1Database, ftsTable: string): Promise<void> {
  await db.prepare(`INSERT INTO "${ftsTable}"("${ftsTable}") VALUES ('rebuild')`).run()
}
