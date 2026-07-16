/**
 * sql-guard — validator for the agent-facing read-only SQL tool (#77).
 *
 * SECURITY MODEL — isolation over sandboxing: the primary control is
 * that `sql_query` only ever runs against the dedicated REFERENCE_DB
 * binding, which must hold non-sensitive data (never users, sessions,
 * tokens). This validator is defence-in-depth on top: even a bypass
 * lands in a database with nothing worth stealing. Do NOT point the
 * tool at the app database and rely on this file alone.
 *
 * What it enforces:
 *  - literals + comments stripped BEFORE keyword checks (so
 *    `WHERE note = 'DROP TABLE'` passes and comment-splice tricks like
 *    SEL + block-comment + ECT fail)
 *  - single statement, starting SELECT or WITH (never WITH RECURSIVE)
 *  - no write/DDL/transaction keywords, no ATTACH/PRAGMA
 *  - no sqlite_master / pragma_* functions (schema comes from the
 *    separate `sql_schema` tool, server-issued)
 *  - no randomblob/zeroblob (memory DoS)
 *  - no CROSS JOIN or comma-joins, JOIN count capped (cartesian DoS)
 *  - the row cap is pushed INTO the query (`SELECT * FROM (…) LIMIT n`)
 *    so the engine never materialises more than the cap — a JS
 *    `.slice()` after the fact wouldn't stop a blow-up or D1 billing
 */

export interface SqlGuardResult {
  ok: boolean
  /** The capped query to execute (present when ok). */
  wrapped?: string
  /** Human-readable rejection reason (present when !ok). */
  reason?: string
}

const WRITE_KEYWORDS =
  /\b(insert|update|delete|drop|alter|create|replace|attach|detach|vacuum|reindex|trigger|pragma|begin|commit|rollback|savepoint|transaction)\b/i

const SCHEMA_PROBES = /\b(sqlite_master|sqlite_temp_master|sqlite_schema|pragma_[a-z_]+)\b/i

const BLOB_BOMBS = /\b(randomblob|zeroblob)\b/i

const MAX_JOINS = 3

/**
 * Remove string literals and comments, preserving structure. Returns
 * null when a literal or block comment is unterminated (reject those —
 * a dangling quote can hide anything from a naive scanner).
 */
export function stripSqlLiterals(sql: string): string | null {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]!
    const next = sql[i + 1]
    if (ch === "'" || ch === '"' || ch === '`') {
      // String / quoted identifier — scan to the closing quote
      // ('' is an escaped quote inside '-strings).
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (ch === "'" && sql[j + 1] === "'") {
            j += 2
            continue
          }
          break
        }
        j++
      }
      if (j >= sql.length) return null // unterminated
      out += ch === '`' || ch === '"' ? ' id ' : " '' " // keep identifiers grammatical
      i = j + 1
    } else if (ch === '-' && next === '-') {
      const nl = sql.indexOf('\n', i)
      if (nl === -1) break
      i = nl
    } else if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2)
      if (end === -1) return null // unterminated
      out += ' '
      i = end + 2
    } else {
      out += ch
      i++
    }
  }
  return out
}

/** Comma at paren-depth 0 inside a FROM clause = implicit cartesian join. */
function hasCommaJoin(stripped: string): boolean {
  const lower = stripped.toLowerCase()
  const clauseEnd = /^(where|group|order|limit|having|window|union|intersect|except)\b/
  let idx = 0
  for (;;) {
    const from = lower.indexOf('from', idx)
    if (from === -1) return false
    // Word-boundary check for the match itself.
    const before = from === 0 ? ' ' : lower[from - 1]!
    const after = lower[from + 4] ?? ' '
    if (/\w/.test(before) || /\w/.test(after)) {
      idx = from + 4
      continue
    }
    let depth = 0
    for (let i = from + 4; i < lower.length; i++) {
      const c = lower[i]!
      if (c === '(') depth++
      else if (c === ')') {
        depth--
        if (depth < 0) break // left this subquery's scope
      } else if (depth === 0) {
        if (c === ',') return true
        if (/[a-z]/.test(c) && clauseEnd.test(lower.slice(i))) break
      }
    }
    idx = from + 4
  }
}

/**
 * Validate + cap a read-only query. `maxRows` is enforced in-SQL; the
 * caller should fetch `maxRows + 1` awareness from the wrapper's LIMIT
 * (it uses maxRows + 1 so truncation is detectable).
 */
export function guardReadOnlySql(sql: string, maxRows = 200): SqlGuardResult {
  const reject = (reason: string): SqlGuardResult => ({ ok: false, reason })

  if (typeof sql !== 'string' || !sql.trim()) return reject('Empty query')
  if (sql.length > 8000) return reject('Query too long (8000 char cap)')

  const stripped = stripSqlLiterals(sql)
  if (stripped === null) return reject('Unterminated string literal or comment')

  // Single statement only — allow trailing semicolon(s).
  const body = stripped.trim().replace(/;+\s*$/, '')
  if (body.includes(';')) return reject('Multiple statements are not allowed')

  if (!/^\s*(select|with)\b/i.test(body)) {
    return reject('Only SELECT (or WITH … SELECT) queries are allowed')
  }
  if (/\bwith\s+recursive\b/i.test(body)) {
    return reject('WITH RECURSIVE is not allowed (unbounded-work risk)')
  }
  const writeHit = body.match(WRITE_KEYWORDS)
  if (writeHit) return reject(`Disallowed keyword: ${writeHit[1]!.toUpperCase()}`)
  const probeHit = body.match(SCHEMA_PROBES)
  if (probeHit) return reject(`Schema introspection is not allowed (${probeHit[1]}) — use the sql_schema tool`)
  const blobHit = body.match(BLOB_BOMBS)
  if (blobHit) return reject(`Disallowed function: ${blobHit[1]}`)
  if (/\bcross\s+join\b/i.test(body)) return reject('CROSS JOIN is not allowed')
  if (hasCommaJoin(body)) return reject('Comma-style joins are not allowed — use explicit JOIN … ON')
  const joins = body.match(/\bjoin\b/gi)?.length ?? 0
  if (joins > MAX_JOINS) return reject(`Too many JOINs (${joins} > ${MAX_JOINS})`)

  // Push the cap into the engine. The original query (sans trailing
  // semicolon) becomes a subquery — SQLite accepts WITH inside a
  // subselect. +1 row so the caller can detect truncation.
  const cleanOriginal = sql.trim().replace(/;+\s*$/, '')
  return { ok: true, wrapped: `SELECT * FROM (${cleanOriginal}) LIMIT ${maxRows + 1}` }
}
