/**
 * History sweep — Phase 3 turn-off-history.
 *
 * For every space with historyEnabled=0, delete messages older than 24h
 * after `historyDisabledAt`. Bounded so a single cron tick can't run
 * forever. Cascades safely via FK ON DELETE CASCADE for thread replies.
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, eq, lte, sql } from 'drizzle-orm'
import { conversationMessages, conversations } from '@/server/modules/conversations/db/schema'

const TTL_SECONDS = 24 * 60 * 60
const ROWS_PER_TICK = 50

export async function sweepHistoryDisabledSpaces(db: D1Database): Promise<number> {
  const d = drizzle(db)
  const now = Math.floor(Date.now() / 1000)
  const cutoff = now - TTL_SECONDS
  // Find spaces with history off whose disabledAt is older than the cutoff.
  const rows = await d
    .select({ id: conversations.id, disabledAt: conversations.historyDisabledAt })
    .from(conversations)
    .where(and(eq(conversations.kind, 'space'), eq(conversations.historyEnabled, 0)))
  let totalRemoved = 0
  for (const row of rows) {
    if (row.disabledAt == null) continue
    // Only delete messages older than the disabledAt + TTL — preserves
    // recent activity from the moment history was turned off.
    const oldEnoughBefore =
      (row.disabledAt as number) > cutoff ? (row.disabledAt as number) : cutoff
    // SQLite doesn't return affected-row count from drizzle directly;
    // we re-query the count beforehand. Bounded.
    const candidates = await d
      .select({ id: conversationMessages.id, createdAt: conversationMessages.createdAt })
      .from(conversationMessages)
      .where(
        and(
          eq(conversationMessages.conversationId, row.id),
          lte(conversationMessages.createdAt, new Date(oldEnoughBefore * 1000))
        )
      )
      .limit(ROWS_PER_TICK)
    if (candidates.length === 0) continue
    await d.delete(conversationMessages).where(
      sql`${conversationMessages.id} IN (${sql.join(
        candidates.map((c) => sql`${c.id}`),
        sql`,`
      )})`
    )
    totalRemoved += candidates.length
    if (totalRemoved >= ROWS_PER_TICK) break
  }
  return totalRemoved
}
