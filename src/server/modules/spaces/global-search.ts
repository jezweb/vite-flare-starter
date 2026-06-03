/**
 * Cross-space search — Phase 3.
 *
 * Mounted at /api/search/messages. Scans every conversation the
 * requesting user is a member of, returns up to 30 hits with snippet
 * + space name. Phase 1 in-space search uses LIKE; this one does too
 * for parity but adds an explicit space-name join so the result UI
 * can show "in #marketing-pod".
 *
 * Also hosts /api/search/entities — FTS5 search across the user's
 * entities (title + JSON_EXTRACT(fields, '$.body')). See migration
 * 20260504140000_entities_fts.sql for the trigger-driven sync.
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, inArray, like } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import {
  conversationMembers,
  conversationMessages,
  conversations,
} from '@/server/modules/conversations/db/schema'
import { shapeMessage } from './storage'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

app.get('/messages', async (c) => {
  const userId = c.get('userId')
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json({ results: [] })
  const d = drizzle(c.env.DB)
  // Step 1: collect every conversation the user is a member of.
  const memberships = await d
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.kind, 'user')))
  const conversationIds = memberships.map((m) => m.conversationId)
  if (conversationIds.length === 0) return c.json({ results: [] })

  // Step 2: search via FTS5 for fast BM25-ranked hits. Build the IN
  // clause as a quoted list so we can pass it as a where fragment.
  try {
    const { searchFTS } = await import('@/server/lib/search')
    // SQLite IN list: build a `?,?,?` placeholder string + bind values.
    const placeholders = conversationIds.map(() => '?').join(',')
    const { results } = await searchFTS<{
      id: string
      conversation_id: string
      role: string
      parts: string
      metadata: string | null
      parent_message_id: string | null
      thread_count: number
      last_thread_at: number | null
      reactions: string | null
      pinned_at: number | null
      pinned_by_user_id: string | null
      starred_by_user_ids: string | null
      quoted_message_id: string | null
      created_at: number | string | Date
    }>(c.env.DB, {
      ftsTable: 'conversation_messages_fts',
      sourceTable: 'conversation_messages',
      query: q,
      limit: 30,
      where: `"conversation_messages".conversation_id IN (${placeholders})`,
      whereParams: conversationIds,
    })
    // Hydrate conversation titles in one IN query for the matched ids.
    const matchedConvIds = Array.from(new Set(results.map((r) => r.conversation_id)))
    const titles = matchedConvIds.length
      ? await d
          .select({ id: conversations.id, title: conversations.title, kind: conversations.kind })
          .from(conversations)
          .where(inArray(conversations.id, matchedConvIds))
      : []
    const titleMap = new Map(titles.map((t) => [t.id, t]))
    const shaped = results.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role,
      parts: safeJson(r.parts),
      metadata: safeJson(r.metadata),
      parentMessageId: r.parent_message_id,
      threadCount: r.thread_count,
      lastThreadAt: r.last_thread_at,
      reactions: safeJson(r.reactions),
      pinnedAt: r.pinned_at,
      pinnedByUserId: r.pinned_by_user_id,
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : typeof r.created_at === 'number'
            ? new Date(r.created_at * 1000).toISOString()
            : String(r.created_at),
      conversationTitle: titleMap.get(r.conversation_id)?.title ?? null,
      conversationKind: titleMap.get(r.conversation_id)?.kind ?? null,
    }))
    return c.json({ results: shaped })
  } catch {
    // LIKE fallback — same shape as before so clients work either way.
    const escaped = q.replace(/[\\_%]/g, (m) => `\\${m}`)
    const rows = await d
      .select({
        message: conversationMessages,
        conversationTitle: conversations.title,
        conversationKind: conversations.kind,
      })
      .from(conversationMessages)
      .innerJoin(conversations, eq(conversationMessages.conversationId, conversations.id))
      .where(
        and(
          inArray(conversationMessages.conversationId, conversationIds),
          like(conversationMessages.parts, `%${escaped}%`)
        )
      )
      .orderBy(desc(conversationMessages.createdAt))
      .limit(30)
    const results = rows.map((r) => ({
      ...shapeMessage(r.message),
      conversationTitle: r.conversationTitle,
      conversationKind: r.conversationKind,
    }))
    return c.json({ results })
  }
})

function safeJson(v: unknown): unknown {
  if (v == null) return v
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

/**
 * GET /api/search/entities — FTS5 search across the user's entities.
 *
 * Indexes title + fields.body (extracted via JSON_EXTRACT in triggers).
 * Returns up to `limit` (default 20) hits scoped to the requesting
 * user's rows.
 *
 * Response shape: { results: [{ id, type, title, snippet, rank }] }.
 *   - snippet is the first ~160 chars of fields.body (may be empty
 *     for entities that don't carry a body).
 *   - rank is the BM25 score (lower = better).
 */
app.get('/entities', async (c) => {
  const userId = c.get('userId')
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json({ results: [] })
  const limitRaw = Number(c.req.query('limit') ?? '20')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 50) : 20

  try {
    const { searchFTS } = await import('@/server/lib/search')
    const { results } = await searchFTS<{
      id: string
      type: string
      title: string
      body: string | null
    }>(c.env.DB, {
      ftsTable: 'entities_fts',
      sourceTable: 'entities',
      query: q,
      limit,
      // Pull the body out of the JSON column at query time so we can
      // build a snippet without a separate round trip. Scope to the
      // requesting user's rows only.
      select:
        '"entities".id, "entities".type, "entities".title, JSON_EXTRACT("entities".fields, \'$.body\') AS body',
      where: '"entities".user_id = ?',
      whereParams: [userId],
    })

    const hits = results.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      snippet: typeof r.body === 'string' ? r.body.slice(0, 160) : '',
      rank: (r as unknown as { rank: number }).rank,
    }))
    return c.json({ results: hits })
  } catch (err) {
    // FTS table missing (fork hasn't applied the migration) — fall
    // back to LIKE on title so the surface still works rather than
    // returning a 500. Body match is sacrificed in this branch.
    console.warn(JSON.stringify({ event: 'entities_fts_fallback', error: String(err) }))
    const escaped = q.replace(/[\\_%]/g, (m) => `\\${m}`)
    const { results } = await c.env.DB.prepare(
      `SELECT id, type, title, JSON_EXTRACT(fields, '$.body') AS body
       FROM entities
       WHERE user_id = ? AND title LIKE ? ESCAPE '\\'
       ORDER BY updated_at DESC
       LIMIT ?`
    )
      .bind(userId, `%${escaped}%`, limit)
      .all<{ id: string; type: string; title: string; body: string | null }>()
    const hits = (results ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      snippet: typeof r.body === 'string' ? r.body.slice(0, 160) : '',
      rank: 0,
    }))
    return c.json({ results: hits })
  }
})

export default app
