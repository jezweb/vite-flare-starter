/**
 * sql-guard — the defence-in-depth validator behind sql_query (#77).
 *
 * Remember the security model: the PRIMARY control is that the tool
 * only binds an isolated REFERENCE_DB. These tests pin the validator
 * layer — literal/comment stripping before keyword checks, single
 * SELECT statements only, DoS-construct rejection, and the in-SQL
 * LIMIT wrapper.
 */
import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { guardReadOnlySql, stripSqlLiterals } from '@/server/lib/sql-guard'

const ok = (sql: string, maxRows?: number) => {
  const r = guardReadOnlySql(sql, maxRows)
  expect(r.ok, r.reason).toBe(true)
  return r.wrapped!
}
const rejected = (sql: string) => {
  const r = guardReadOnlySql(sql)
  expect(r.ok).toBe(false)
  return r.reason!
}

describe('guardReadOnlySql — allows real read queries', () => {
  it('plain SELECT', () => {
    expect(ok('SELECT name, code FROM countries WHERE region = ?')).toContain('LIMIT')
  })

  it('aggregates + GROUP BY + ORDER BY lists (commas outside FROM)', () => {
    ok('SELECT region, count(*) AS n FROM countries GROUP BY region ORDER BY n DESC, region ASC')
  })

  it('CTEs (non-recursive) and explicit JOINs', () => {
    ok(
      `WITH big AS (SELECT * FROM countries WHERE population > 1000000)
       SELECT b.name, r.label FROM big b JOIN regions r ON r.id = b.region_id`
    )
  })

  it('write keywords inside string literals are fine', () => {
    ok(`SELECT * FROM notes WHERE body = 'DROP TABLE users; INSERT INTO x'`)
  })

  it('subquery with commas inside parens is not a comma-join', () => {
    ok('SELECT * FROM (SELECT name, code FROM countries) WHERE code > 10')
  })

  it('trailing semicolon tolerated', () => {
    ok('SELECT 1;')
  })
})

describe('guardReadOnlySql — rejects unsafe constructs', () => {
  it('writes and DDL', () => {
    expect(rejected('INSERT INTO t VALUES (1)')).toMatch(/Only SELECT/)
    expect(rejected('SELECT * FROM t; DROP TABLE t')).toMatch(/Multiple statements/)
    expect(rejected("SELECT * FROM t WHERE x = 1 UNION SELECT sql FROM y CREATE TABLE z")).toMatch(
      /CREATE/
    )
  })

  it('comment-splice cannot smuggle a keyword past the scanner', () => {
    // After stripping, "SEL ECT" is not SELECT — rejected up front, and
    // SQLite's own tokenizer would not glue it back together either.
    expect(guardReadOnlySql('SEL/**/ECT * FROM t').ok).toBe(false)
  })

  it('unterminated literal / comment', () => {
    expect(rejected("SELECT * FROM t WHERE a = 'oops")).toMatch(/Unterminated/)
    expect(rejected('SELECT * FROM t /* dangling')).toMatch(/Unterminated/)
  })

  it('WITH RECURSIVE', () => {
    expect(
      rejected('WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT * FROM c')
    ).toMatch(/RECURSIVE/)
  })

  it('schema probes and pragma functions', () => {
    expect(rejected('SELECT sql FROM sqlite_master')).toMatch(/sql_schema/)
    expect(rejected("SELECT * FROM pragma_table_info('user')")).toMatch(/introspection/)
    expect(rejected('SELECT * FROM t PRAGMA integrity_check')).toMatch(/PRAGMA/)
  })

  it('blob bombs', () => {
    expect(rejected('SELECT randomblob(100000000)')).toMatch(/randomblob/)
  })

  it('cartesian joins — CROSS JOIN, comma-join, join cap', () => {
    expect(rejected('SELECT * FROM a CROSS JOIN b')).toMatch(/CROSS JOIN/)
    expect(rejected('SELECT * FROM a, b')).toMatch(/Comma-style/)
    expect(
      rejected('SELECT * FROM a JOIN b ON 1 JOIN c ON 1 JOIN d ON 1 JOIN e ON 1')
    ).toMatch(/Too many JOINs/)
  })

  it('oversized input', () => {
    expect(rejected(`SELECT ${'1,'.repeat(5000)}1`)).toMatch(/too long/)
  })
})

describe('LIMIT wrapping — the cap lives in the engine', () => {
  it('wraps the query as a subselect with maxRows + 1', () => {
    expect(ok('SELECT * FROM t', 50)).toBe('SELECT * FROM (SELECT * FROM t) LIMIT 51')
  })

  it('an inner LIMIT larger than the cap cannot win', async () => {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sqlguard_t (n INTEGER)').run()
    await env.DB.prepare('DELETE FROM sqlguard_t').run()
    for (let i = 0; i < 10; i++) {
      await env.DB.prepare('INSERT INTO sqlguard_t (n) VALUES (?)').bind(i).run()
    }
    const wrapped = ok('SELECT * FROM sqlguard_t LIMIT 9999', 5)
    const res = await env.DB.prepare(wrapped).all()
    expect(res.results.length).toBe(6) // cap + 1 for truncation detection
  })

  it('WITH queries survive the subselect wrapper on a real engine', async () => {
    const wrapped = ok('WITH x AS (SELECT 1 AS a UNION ALL SELECT 2) SELECT * FROM x', 10)
    const res = await env.DB.prepare(wrapped).all()
    expect(res.results.length).toBe(2)
  })
})

describe('stripSqlLiterals', () => {
  it('removes strings and comments but keeps structure', () => {
    expect(stripSqlLiterals("SELECT 'a--b' FROM t -- tail\nWHERE x=1")).not.toContain('a--b')
    expect(stripSqlLiterals("SELECT '' FROM t")).toContain('FROM t')
  })

  it("handles '' escapes inside strings", () => {
    const out = stripSqlLiterals("SELECT * FROM t WHERE a = 'it''s DROP fine'")
    expect(out).not.toContain('DROP')
  })
})
