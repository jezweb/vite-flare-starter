/**
 * Messages — cross-cutting routes for individual messages.
 *
 * Mounted at /api/messages. Routes work on any message in any space
 * the requesting user is a member of:
 *   POST   /:id/reactions   add or remove an emoji reaction
 *   POST   /:id/thread      reply in the message's thread
 *   DELETE /:id             author-only delete
 *
 * Membership is checked via the parent conversation's
 * `conversation_members` row — same gate as the spaces routes.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, like, sql } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import {
  conversationMembers,
  conversationMessages,
  threadSubscriptions,
} from '@/server/modules/conversations/db/schema'
import type { SpaceAgent } from './space-agent'
import { shapeMessage } from './storage'
import { parseMentions } from './mention-parser'
import { dispatchMentions } from './dispatch'

interface MessagesEnv {
  DB: D1Database
  SpaceAgent: DurableObjectNamespace<SpaceAgent>
  // biome-ignore lint/suspicious/noExplicitAny: cross-DO env shape
  AssistantAgent?: DurableObjectNamespace<any>
  // biome-ignore lint/suspicious/noExplicitAny: cross-DO env shape
  ResearcherAgent?: DurableObjectNamespace<any>
  // biome-ignore lint/suspicious/noExplicitAny: cross-DO env shape
  WriterAgent?: DurableObjectNamespace<any>
}

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const ReactionSchema = z.object({
  emoji: z.string().min(1).max(16),
  action: z.enum(['add', 'remove']),
})
app.post('/:id/reactions', zValidator('json', ReactionSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { emoji, action } = c.req.valid('json')
  const d = drizzle(c.env.DB)
  const [row] = await d
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.id, id))
    .limit(1)
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (!(await isMemberOf(c.env.DB, row.conversationId, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  let reactions: Record<string, string[]> = {}
  if (row.reactions) {
    try {
      const parsed = typeof row.reactions === 'string' ? JSON.parse(row.reactions) : row.reactions
      if (parsed && typeof parsed === 'object') reactions = parsed as Record<string, string[]>
    } catch {
      reactions = {}
    }
  }
  const actorKey = `user:${userId}`
  const list = reactions[emoji] ?? []
  if (action === 'add' && !list.includes(actorKey)) list.push(actorKey)
  if (action === 'remove') {
    const idx = list.indexOf(actorKey)
    if (idx >= 0) list.splice(idx, 1)
  }
  if (list.length > 0) reactions[emoji] = list
  else delete reactions[emoji]
  await d
    .update(conversationMessages)
    .set({ reactions: JSON.stringify(reactions) })
    .where(eq(conversationMessages.id, id))
  // Broadcast the updated row so all connected clients pick up the
  // reaction change.
  const env = c.env as unknown as MessagesEnv
  if (env.SpaceAgent) {
    const stub = env.SpaceAgent.get(env.SpaceAgent.idFromName(row.conversationId)) as unknown as {
      broadcastNewMessage: (mid: string) => Promise<void>
    }
    try {
      await stub.broadcastNewMessage(id)
    } catch {
      /* best-effort */
    }
  }
  return c.json({ ok: true, reactions })
})

const ThreadReplySchema = z.object({
  parts: z.array(z.record(z.string(), z.unknown())).min(1).max(20),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
app.post('/:id/thread', zValidator('json', ThreadReplySchema), async (c) => {
  const userId = c.get('userId')
  const parentId = c.req.param('id')
  const body = c.req.valid('json')
  const d = drizzle(c.env.DB)
  const [parent] = await d
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.id, parentId))
    .limit(1)
  if (!parent) return c.json({ error: 'Not found' }, 404)
  const conversationId = parent.conversationId
  if (!(await isMemberOf(c.env.DB, conversationId, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const messageId = crypto.randomUUID()
  await d.insert(conversationMessages).values({
    id: messageId,
    conversationId,
    role: 'user',
    parts: JSON.stringify(body.parts),
    metadata: JSON.stringify({
      ...(body.metadata ?? {}),
      senderKind: 'user',
      senderUserId: userId,
    }),
    parentMessageId: parentId,
  })
  // Bump parent's threadCount + lastThreadAt atomically.
  await d
    .update(conversationMessages)
    .set({
      threadCount: sql`${conversationMessages.threadCount} + 1`,
      lastThreadAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(conversationMessages.id, parentId))

  const env = c.env as unknown as MessagesEnv
  const broadcastNewMessage = async (mid: string) => {
    if (!env.SpaceAgent) return
    const stub = env.SpaceAgent.get(env.SpaceAgent.idFromName(conversationId)) as unknown as {
      broadcastNewMessage: (mid: string) => Promise<void>
    }
    try {
      await stub.broadcastNewMessage(mid)
    } catch {
      /* best-effort */
    }
  }
  await broadcastNewMessage(messageId)

  // Dispatch in-thread mentions to agents.
  const mentions = await parseMentions(c.env.DB, conversationId, body.parts)
  if (mentions.length > 0) {
    const inputText = body.parts
      .map((p) =>
        typeof (p as { text?: string }).text === 'string' ? (p as { text: string }).text : ''
      )
      .filter(Boolean)
      .join('\n')
      .trim()
    if (inputText) {
      try {
        await dispatchMentions({
          env: env as unknown as Parameters<typeof dispatchMentions>[0]['env'],
          spaceId: conversationId,
          senderUserId: userId,
          triggerMessageId: messageId,
          parentMessageId: parentId,
          mentions,
          inputText,
          broadcastNewMessage,
        })
      } catch (err) {
        console.error(
          JSON.stringify({
            event: 'space_thread_dispatch_error',
            spaceId: conversationId,
            error: String(err),
          })
        )
      }
    }
  }

  // Return the canonical row.
  const [created] = await d
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.id, messageId))
    .limit(1)
  return c.json({ message: created ? shapeMessage(created) : null }, 201)
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)
  const [row] = await d
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.id, id))
    .limit(1)
  if (!row) return c.json({ error: 'Not found' }, 404)
  // Author-only delete. We use metadata.senderUserId since the row
  // doesn't have a sender column directly.
  let senderUserId: string | null = null
  if (row.metadata) {
    try {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      senderUserId = (meta?.senderUserId as string) ?? null
    } catch {
      /* swallow */
    }
  }
  if (senderUserId !== userId) return c.json({ error: 'Forbidden' }, 403)
  // Broadcast the tombstone BEFORE deleting so we can resolve the DO
  // by the message's conversationId without re-loading the deleted
  // row. The DO call doesn't depend on the row existing.
  const env = c.env as unknown as MessagesEnv
  if (env.SpaceAgent) {
    const stub = env.SpaceAgent.get(env.SpaceAgent.idFromName(row.conversationId)) as unknown as {
      broadcastDelete: (mid: string) => Promise<void>
    }
    try {
      await stub.broadcastDelete(id)
    } catch {
      /* best-effort */
    }
  }
  await d.delete(conversationMessages).where(eq(conversationMessages.id, id))
  return c.json({ ok: true })
})

/** PATCH /:id/pin — toggle pin-to-space (admin/owner only). */
const PinSchema = z.object({ pinned: z.boolean() })
app.patch('/:id/pin', zValidator('json', PinSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { pinned } = c.req.valid('json')
  const d = drizzle(c.env.DB)
  const [row] = await d
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.id, id))
    .limit(1)
  if (!row) return c.json({ error: 'Not found' }, 404)
  // Pin requires admin/owner role on the conversation.
  if (!(await isAdminOf(c.env.DB, row.conversationId, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await d
    .update(conversationMessages)
    .set({
      pinnedAt: pinned ? Math.floor(Date.now() / 1000) : null,
      pinnedByUserId: pinned ? userId : null,
    })
    .where(eq(conversationMessages.id, id))
  // Broadcast updated row.
  const env = c.env as unknown as MessagesEnv
  if (env.SpaceAgent) {
    const stub = env.SpaceAgent.get(env.SpaceAgent.idFromName(row.conversationId)) as unknown as {
      broadcastNewMessage: (mid: string) => Promise<void>
    }
    try {
      await stub.broadcastNewMessage(id)
    } catch {
      /* best-effort */
    }
  }
  return c.json({ ok: true })
})

/** PATCH /:id/star — toggle personal star (any member). */
const StarSchema = z.object({ starred: z.boolean() })
app.patch('/:id/star', zValidator('json', StarSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { starred } = c.req.valid('json')
  const d = drizzle(c.env.DB)
  const [row] = await d
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.id, id))
    .limit(1)
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (!(await isMemberOf(c.env.DB, row.conversationId, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  let stars: string[] = []
  if (row.starredByUserIds) {
    try {
      const parsed =
        typeof row.starredByUserIds === 'string'
          ? JSON.parse(row.starredByUserIds)
          : row.starredByUserIds
      if (Array.isArray(parsed)) stars = parsed.filter((x) => typeof x === 'string')
    } catch {
      stars = []
    }
  }
  if (starred && !stars.includes(userId)) stars.push(userId)
  if (!starred) stars = stars.filter((u) => u !== userId)
  await d
    .update(conversationMessages)
    .set({ starredByUserIds: stars.length ? JSON.stringify(stars) : null })
    .where(eq(conversationMessages.id, id))
  return c.json({ ok: true, starredByUserIds: stars })
})

/** GET /api/messages/starred — current user's starred messages. */
app.get('/starred/me', async (c) => {
  const userId = c.get('userId')
  // SQLite has no native JSON_CONTAINS — use LIKE on the JSON shape.
  // Stars JSON is `["userIdA","userIdB"]`; a contains check is a quoted
  // userId substring.
  const needle = `%"${userId}"%`
  const rows = await drizzle(c.env.DB)
    .select()
    .from(conversationMessages)
    .where(like(conversationMessages.starredByUserIds, needle))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(100)
  return c.json({ messages: rows.map(shapeMessage) })
})

/** POST /:id/forward — forward a message to another space. Phase 3. */
const ForwardSchema = z.object({
  targetSpaceId: z.string(),
  note: z.string().max(500).optional(),
})
app.post('/:id/forward', zValidator('json', ForwardSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { targetSpaceId, note } = c.req.valid('json')
  const d = drizzle(c.env.DB)
  const [src] = await d
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.id, id))
    .limit(1)
  if (!src) return c.json({ error: 'Not found' }, 404)
  // Sender must be a member of BOTH spaces.
  if (!(await isMemberOf(c.env.DB, src.conversationId, userId))) {
    return c.json({ error: 'Forbidden — not a member of source space' }, 403)
  }
  if (!(await isMemberOf(c.env.DB, targetSpaceId, userId))) {
    return c.json({ error: 'Forbidden — not a member of target space' }, 403)
  }
  // Build the forwarded message: the original parts + a forward header.
  const sourceParts = (() => {
    try {
      return typeof src.parts === 'string' ? JSON.parse(src.parts) : src.parts
    } catch {
      return [{ type: 'text', text: '' }]
    }
  })() as Array<Record<string, unknown>>
  const newId = crypto.randomUUID()
  const partsJson = JSON.stringify([
    ...(note ? [{ type: 'text', text: note }] : []),
    { type: 'text', text: '↳ Forwarded message:' },
    ...sourceParts,
  ])
  const metadataJson = JSON.stringify({
    senderKind: 'user',
    senderUserId: userId,
    forwardedFromMessageId: id,
    forwardedFromConversationId: src.conversationId,
  })
  await d.insert(conversationMessages).values({
    id: newId,
    conversationId: targetSpaceId,
    role: 'user',
    parts: partsJson,
    metadata: metadataJson,
  })
  // Broadcast to the target space's connected clients.
  const env = c.env as unknown as MessagesEnv
  if (env.SpaceAgent) {
    const stub = env.SpaceAgent.get(env.SpaceAgent.idFromName(targetSpaceId)) as unknown as {
      broadcastNewMessage: (mid: string) => Promise<void>
    }
    try {
      await stub.broadcastNewMessage(newId)
    } catch {
      /* best-effort */
    }
  }
  return c.json({ id: newId }, 201)
})

/** PATCH /:id/thread/subscription — set per-thread notification level. */
const ThreadSubSchema = z.object({ level: z.enum(['all', 'mute']) })
app.patch('/:id/thread/subscription', zValidator('json', ThreadSubSchema), async (c) => {
  const userId = c.get('userId')
  const threadId = c.req.param('id')
  const { level } = c.req.valid('json')
  const d = drizzle(c.env.DB)
  const [parent] = await d
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.id, threadId))
    .limit(1)
  if (!parent) return c.json({ error: 'Not found' }, 404)
  if (!(await isMemberOf(c.env.DB, parent.conversationId, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  // Upsert via DELETE + INSERT (SQLite ON CONFLICT works too, but the
  // unique index gives us idempotency for free).
  await d
    .delete(threadSubscriptions)
    .where(and(eq(threadSubscriptions.threadId, threadId), eq(threadSubscriptions.userId, userId)))
  await d.insert(threadSubscriptions).values({ threadId, userId, level })
  return c.json({ ok: true })
})

async function isMemberOf(
  db: D1Database,
  conversationId: string,
  userId: string
): Promise<boolean> {
  const [row] = await drizzle(db)
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.kind, 'user'),
        eq(conversationMembers.userId, userId)
      )
    )
    .limit(1)
  return !!row
}

async function isAdminOf(db: D1Database, conversationId: string, userId: string): Promise<boolean> {
  const rows = await drizzle(db)
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.kind, 'user'),
        eq(conversationMembers.userId, userId)
      )
    )
    .limit(1)
  const role = rows[0]?.role
  return role === 'owner' || role === 'admin'
}

export default app
