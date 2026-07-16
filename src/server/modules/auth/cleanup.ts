/**
 * Session cleanup — delete expired better-auth sessions and expired
 * verification tokens. Called from the cron scheduled() handler.
 *
 * Why: a session row is only soft-deleted on sign-out. Dead tokens and
 * revoked sessions accumulate. Without cleanup the "Active Sessions"
 * admin stat drifts far past the real number of logged-in users (saw
 * 8 sessions for 4 users in the morning audit).
 */
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
import type { D1Database } from '@cloudflare/workers-types'
import { session, verification } from './db/schema'

export interface CleanupResult {
  sessionsDeleted: number
  verificationsDeleted: number
}

/**
 * Timestamp column normalised to Unix epoch SECONDS, whatever format the
 * row was written in. Live data has MIXED formats: better-auth on Workers
 * writes ISO strings in some paths and numeric epochs in others.
 *
 * Why not `lt(col, new Date())`: that serialises the bound value to an
 * ISO string, and SQLite's type ordering puts every INTEGER below every
 * TEXT — so numeric-stored rows compare "less than" ANY ISO string and a
 * naive expiry sweep deletes live sessions.
 *
 * Handles: numeric epoch seconds, numeric epoch millis (magnitude split
 * at 1e11, same rule as isoTimestamp.fromDriver), and ISO-8601 text.
 * Note the column has TEXT affinity, so "numeric" rows are usually
 * numeric STRINGS — the CAST branch catches millis-as-string (which
 * unixepoch's 'auto' would misread as epoch seconds); an ISO string
 * CASTs to a small year-number and falls through to unixepoch.
 */
const asEpochSeconds = (col: unknown) => sql<number>`(CASE
  WHEN typeof(${col}) IN ('integer', 'real') THEN
    CASE WHEN ${col} > 100000000000 THEN ${col} / 1000.0 ELSE ${col} END
  WHEN CAST(${col} AS INTEGER) > 100000000000 THEN CAST(${col} AS INTEGER) / 1000.0
  ELSE unixepoch(${col}, 'auto')
END)`

export async function cleanupExpiredAuthRows(d1: D1Database): Promise<CleanupResult> {
  const db = drizzle(d1)
  const nowSec = Math.floor(Date.now() / 1000)

  // Sessions whose expiresAt has passed are dead weight.
  const sessionsResult = await db
    .delete(session)
    .where(sql`${asEpochSeconds(session.expiresAt)} < ${nowSec}`)
    .returning({ id: session.id })

  // Verification tokens (password resets, email verifications, magic links)
  // have short TTLs — purge anything older than the expiry window.
  let verificationsDeleted = 0
  try {
    const verificationsResult = await db
      .delete(verification)
      .where(sql`${asEpochSeconds(verification.expiresAt)} < ${nowSec}`)
      .returning({ id: verification.id })
    verificationsDeleted = verificationsResult.length
  } catch {
    // Table may not exist in older forks. Ignore and move on — the
    // session cleanup above is the critical path.
  }

  return {
    sessionsDeleted: sessionsResult.length,
    verificationsDeleted,
  }
}

/**
 * Very old revoked/orphan sessions that somehow still hang around. D1 has
 * no automatic TTL; this backstop deletes anything older than 30 days no
 * matter its expiresAt (which could be future-dated if a rotation bug
 * extends sessions incorrectly).
 */
export async function purgeStaleSessions(d1: D1Database, maxAgeDays = 30): Promise<number> {
  const db = drizzle(d1)
  const cutoffSec = Math.floor((Date.now() - maxAgeDays * 24 * 60 * 60 * 1000) / 1000)
  const result = await db
    .delete(session)
    .where(sql`${asEpochSeconds(session.createdAt)} < ${cutoffSec}`)
    .returning({ id: session.id })
  return result.length
}

// Raw-SQL variant for cases where Drizzle isn't handy. Same mixed-format
// normalisation as asEpochSeconds — `datetime(expiresAt)` alone would
// misread numeric epochs as Julian day numbers.
export async function cleanupExpiredSessionsRaw(d1: D1Database): Promise<number> {
  const result = await d1
    .prepare(
      `DELETE FROM session WHERE (CASE
         WHEN typeof(expiresAt) IN ('integer', 'real') THEN
           CASE WHEN expiresAt > 100000000000 THEN expiresAt / 1000.0 ELSE expiresAt END
         WHEN CAST(expiresAt AS INTEGER) > 100000000000 THEN CAST(expiresAt AS INTEGER) / 1000.0
         ELSE unixepoch(expiresAt, 'auto')
       END) < unixepoch('now')`
    )
    .run()
  return result.meta.changes ?? 0
}
