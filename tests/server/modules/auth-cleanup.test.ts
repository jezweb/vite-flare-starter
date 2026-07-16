/**
 * Auth cleanup — mixed-timestamp normalisation (#95, low).
 *
 * Live data holds session.expiresAt in MIXED formats (better-auth on
 * Workers writes ISO strings in some paths, numeric epochs in others).
 * SQLite type ordering puts every INTEGER below every TEXT, so the old
 * `lt(expiresAt, isoNow)` compare matched EVERY numeric row — the
 * cleanup cron would delete live sessions stored as epochs. These tests
 * pin the normalised behaviour: only genuinely-expired rows go, in all
 * three storage formats (ISO text, epoch seconds, epoch millis).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import {
  cleanupExpiredAuthRows,
  cleanupExpiredSessionsRaw,
  purgeStaleSessions,
} from '@/server/modules/auth/cleanup'

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const stmt = env.DB.prepare(sql)
  await (params.length > 0 ? stmt.bind(...params).run() : stmt.run())
}

async function remainingSessionIds(): Promise<string[]> {
  const rows = await env.DB.prepare('SELECT id FROM session ORDER BY id').all()
  return rows.results.map((r) => r['id'] as string)
}

beforeEach(async () => {
  // Only the columns the cleanup queries touch. No STRICT mode — the
  // whole point is that one column holds mixed TEXT and INTEGER values.
  await runSql(`CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY, expiresAt TEXT, createdAt TEXT
  )`)
  await runSql(`CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY, expiresAt TEXT
  )`)
  await runSql('DELETE FROM session')
  await runSql('DELETE FROM verification')

  const nowSec = Math.floor(Date.now() / 1000)
  const pastIso = new Date((nowSec - 3600) * 1000).toISOString()
  const futureIso = new Date((nowSec + 3600) * 1000).toISOString()
  const freshCreated = futureIso // createdAt irrelevant to expiry sweep

  // Six rows: {ISO, epoch-seconds, epoch-millis} × {expired, live}.
  await runSql(
    `INSERT INTO session (id, expiresAt, createdAt) VALUES
     ('iso-expired', ?, ?), ('iso-live', ?, ?),
     ('sec-expired', ${nowSec - 3600}, ?), ('sec-live', ${nowSec + 3600}, ?),
     ('ms-expired', ${(nowSec - 3600) * 1000}, ?), ('ms-live', ${(nowSec + 3600) * 1000}, ?)`,
    [pastIso, freshCreated, futureIso, freshCreated, freshCreated, freshCreated, freshCreated, freshCreated]
  )
})

describe('cleanupExpiredAuthRows — mixed expiresAt formats', () => {
  it('deletes expired rows and keeps live rows in every format', async () => {
    const result = await cleanupExpiredAuthRows(env.DB)
    expect(result.sessionsDeleted).toBe(3)
    expect(await remainingSessionIds()).toEqual(['iso-live', 'ms-live', 'sec-live'])
  })

  it('sweeps expired verification tokens too', async () => {
    const past = new Date(Date.now() - 3600_000).toISOString()
    const future = new Date(Date.now() + 3600_000).toISOString()
    await runSql(`INSERT INTO verification (id, expiresAt) VALUES ('v-old', ?), ('v-new', ?)`, [
      past,
      future,
    ])
    const result = await cleanupExpiredAuthRows(env.DB)
    expect(result.verificationsDeleted).toBe(1)
  })
})

describe('cleanupExpiredSessionsRaw — same normalisation, raw SQL path', () => {
  it('matches the Drizzle variant', async () => {
    const deleted = await cleanupExpiredSessionsRaw(env.DB)
    expect(deleted).toBe(3)
    expect(await remainingSessionIds()).toEqual(['iso-live', 'ms-live', 'sec-live'])
  })
})

describe('purgeStaleSessions — createdAt normalisation', () => {
  it('does NOT purge numeric-createdAt sessions younger than the cutoff', async () => {
    const nowSec = Math.floor(Date.now() / 1000)
    await runSql('DELETE FROM session')
    // Numeric epoch createdAt, 1 day old — the old lt() compare would
    // have deleted this (INTEGER < TEXT is always true in SQLite).
    await runSql(
      `INSERT INTO session (id, expiresAt, createdAt) VALUES ('young-numeric', ?, ${nowSec - 86400})`,
      [new Date(Date.now() + 3600_000).toISOString()]
    )
    expect(await purgeStaleSessions(env.DB, 30)).toBe(0)
    expect(await remainingSessionIds()).toEqual(['young-numeric'])
  })

  it('purges sessions older than the cutoff regardless of format', async () => {
    const nowSec = Math.floor(Date.now() / 1000)
    await runSql('DELETE FROM session')
    await runSql(
      `INSERT INTO session (id, expiresAt, createdAt) VALUES
       ('old-numeric', 'x', ${nowSec - 40 * 86400}),
       ('old-iso', 'x', ?)`,
      [new Date(Date.now() - 40 * 86400_000).toISOString()]
    )
    expect(await purgeStaleSessions(env.DB, 30)).toBe(2)
  })
})
