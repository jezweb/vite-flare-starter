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
import { lt, sql } from 'drizzle-orm'
import type { D1Database } from '@cloudflare/workers-types'
import { session, verification } from './db/schema'

export interface CleanupResult {
  sessionsDeleted: number
  verificationsDeleted: number
}

export async function cleanupExpiredAuthRows(d1: D1Database): Promise<CleanupResult> {
  const db = drizzle(d1)
  const now = new Date()

  // Sessions whose expiresAt has passed are dead weight.
  const sessionsResult = await db
    .delete(session)
    .where(lt(session.expiresAt, now))
    .returning({ id: session.id })

  // Verification tokens (password resets, email verifications, magic links)
  // have short TTLs — purge anything older than the expiry window.
  let verificationsDeleted = 0
  try {
    const verificationsResult = await db
      .delete(verification)
      .where(lt(verification.expiresAt, now))
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
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000)
  const result = await db
    .delete(session)
    .where(lt(session.createdAt, cutoff))
    .returning({ id: session.id })
  return result.length
}

// Raw-SQL variant for cases where Drizzle isn't handy.
export async function cleanupExpiredSessionsRaw(d1: D1Database): Promise<number> {
  const result = await d1
    .prepare(`DELETE FROM session WHERE datetime(expiresAt) < datetime('now')`)
    .run()
  return result.meta.changes ?? 0
}

// Keep sql import "used" for type inference consumers — noop.
void sql
