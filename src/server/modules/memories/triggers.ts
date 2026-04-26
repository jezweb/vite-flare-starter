/**
 * Memory extraction triggers — Phase 3 v2.
 *
 * Two background drivers, both ultimately calling extract-job.ts +
 * apply-updates.ts:
 *
 *   1. Reactive — when a new conversation is created in a scope, the
 *      previous conversation in that same scope is a memory candidate.
 *      Called from chat onFinish via ctx.waitUntil. Stays cheap by
 *      bailing early on every "not eligible" guard.
 *
 *   2. Cron sweep — every 15 min, find conversations with
 *      memory_processed_at IS NULL and last activity >30min ago, and
 *      message count >= 3. This catches users who close the tab
 *      without starting a new conversation.
 *
 * Manual trigger lives in routes.ts as POST /api/memories/regenerate
 * (synchronous so the UI can show the result immediately).
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, asc, desc, eq, isNull, lt, ne, sql } from 'drizzle-orm'
import { conversations } from '@/server/modules/conversations/db/schema'
import { extractMemoryFromConversation } from './extract-job'
import { applyExtractionResult } from './apply-updates'

interface ReactiveInput {
  env: { DB: D1Database; AI: Ai }
  userId: string
  /** The conversation that just received its first onFinish — DO NOT process this one. */
  currentConversationId: string
  /** Scope of the current conversation — null = personal flat list. */
  projectId: string | null
}

/**
 * Find the most recent prior conversation in the same scope as the
 * just-finished one, and trigger extraction on it if eligible.
 *
 * Eligibility:
 *   - memory_processed_at IS NULL
 *   - message count >= 3 (set in extract-job; no need to pre-check here)
 *   - belongs to the same scope (project or personal)
 */
export async function triggerPriorConversationMemoryExtraction(
  input: ReactiveInput,
): Promise<void> {
  const { env, userId, currentConversationId, projectId } = input
  const d = drizzle(env.DB)

  try {
    // Find prior unprocessed conversation in same scope
    const condition = and(
      eq(conversations.userId, userId),
      ne(conversations.id, currentConversationId),
      isNull(conversations.memoryProcessedAt),
      projectId
        ? eq(conversations.projectId, projectId)
        : isNull(conversations.projectId),
    )
    const [prior] = await d
      .select({ id: conversations.id })
      .from(conversations)
      .where(condition)
      .orderBy(desc(conversations.updatedAt))
      .limit(1)
    if (!prior) return
    await runExtraction(env, prior.id, userId)
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'memory_reactive_trigger_error',
      error: err instanceof Error ? err.message : String(err),
    }))
  }
}

/**
 * Cron sweep — find candidate conversations and process up to N of
 * them per tick. Caps work to keep within the cron's wall-clock
 * budget; the next tick picks up anything we missed.
 *
 * Eligibility:
 *   - memory_processed_at IS NULL
 *   - updated_at < (now - 30min)
 *   - has at least 3 messages (joined check via subquery for cheapness)
 */
export async function sweepIdleConversationsForMemory(
  env: { DB: D1Database; AI: Ai },
  opts?: { maxPerTick?: number },
): Promise<{ processed: number; errors: number }> {
  const max = opts?.maxPerTick ?? 5
  const d = drizzle(env.DB)
  const cutoff = new Date(Date.now() - 30 * 60 * 1000)

  // Use a raw subquery for the message-count gate to avoid n+1 lookups.
  const candidates = await d
    .select({
      id: conversations.id,
      userId: conversations.userId,
    })
    .from(conversations)
    .where(
      and(
        isNull(conversations.memoryProcessedAt),
        lt(conversations.updatedAt, cutoff),
        // Only process conversations with at least 3 messages
        sql`(SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = ${conversations.id}) >= 3`,
      ),
    )
    .orderBy(asc(conversations.updatedAt))
    .limit(max)

  let processed = 0
  let errors = 0
  for (const row of candidates) {
    try {
      await runExtraction(env, row.id, row.userId)
      processed += 1
    } catch (err) {
      errors += 1
      console.warn(JSON.stringify({
        event: 'memory_sweep_error',
        conversationId: row.id,
        error: err instanceof Error ? err.message : String(err),
      }))
    }
  }
  return { processed, errors }
}

// ─── Shared runner ────────────────────────────────────────────────────

async function runExtraction(
  env: { DB: D1Database; AI: Ai },
  conversationId: string,
  userId: string,
): Promise<void> {
  const d = drizzle(env.DB)

  const job = await extractMemoryFromConversation({
    db: env.DB,
    ai: env.AI,
    conversationId,
    userId,
  })

  if (!job.ok || !job.result) {
    // Log but don't mark processed — transient failures should retry on
    // next cron tick. Permanent failures (too_short) stamp processed.
    if (job.error === 'too_short') {
      await d
        .update(conversations)
        .set({ memoryProcessedAt: new Date() })
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    } else {
      console.log(JSON.stringify({
        event: 'memory_extraction_skipped',
        conversationId,
        reason: job.error,
      }))
    }
    return
  }

  const allowTitleReplace =
    !job.meta.currentTitle ||
    job.meta.currentTitle.trim().length === 0 ||
    job.meta.currentTitle === 'New conversation'

  const summary = await applyExtractionResult({
    db: env.DB,
    userId,
    conversationId,
    projectId: job.meta.projectId,
    result: job.result,
    allowTitleReplace,
  })

  console.log(JSON.stringify({
    event: 'memory_extraction_applied',
    conversationId,
    ...summary,
  }))
}
