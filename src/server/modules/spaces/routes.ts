/**
 * Spaces REST API
 *
 * One file. CRUD for spaces, members, messages, presence, search.
 * Auth: every route requires session (no API token scopes for Phase 1).
 *
 * Wiring:
 *   GET    /api/spaces                              list user's spaces
 *   POST   /api/spaces                              create
 *   GET    /api/spaces/:id                          detail (members, recent msgs)
 *   PATCH  /api/spaces/:id                          update name/settings (owner)
 *   DELETE /api/spaces/:id                          delete (owner)
 *   GET    /api/spaces/:id/presence                 current online userIds
 *   GET    /api/spaces/:id/messages                 paginated messages
 *   POST   /api/spaces/:id/messages                 send (parses @, dispatches)
 *   GET    /api/spaces/:id/messages/search          FTS5 within space
 *   PATCH  /api/spaces/:id/read                     mark as read
 *   GET    /api/spaces/:id/members                  list
 *   POST   /api/spaces/:id/members                  invite (user or agent)
 *   PATCH  /api/spaces/:id/members/:memberId        update role / replyMode / notification
 *   DELETE /api/spaces/:id/members/:memberId        remove or self-leave
 *   PATCH  /api/spaces/:id/membership               update self (pin / mute / read)
 *   POST   /api/messages/:id/reactions              add/remove reaction
 *   POST   /api/messages/:id/thread                 reply in thread
 *   DELETE /api/messages/:id                        author-only delete
 *   GET    /api/spaces/:id/agents                   list available agents (Phase 1: globals)
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, inArray, like, sql } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import {
  conversations,
  conversationMembers,
  conversationMessages,
} from '@/server/modules/conversations/db/schema'
import { user } from '@/server/modules/auth/db/schema'
import { listSpacesForUser, listMembers, listMessages, shapeMessage } from './storage'
import { parseMentions } from './mention-parser'
import { dispatchMentions } from './dispatch'
import type { SpaceAgent } from './space-agent'

interface SpacesEnv {
  DB: D1Database
  SpaceAgent: DurableObjectNamespace<SpaceAgent>
  // AutonomousAgent classes the dispatcher routes to:
  // biome-ignore lint/suspicious/noExplicitAny: cross-DO env shape
  AssistantAgent?: DurableObjectNamespace<any>
  // biome-ignore lint/suspicious/noExplicitAny: cross-DO env shape
  ResearcherAgent?: DurableObjectNamespace<any>
  // biome-ignore lint/suspicious/noExplicitAny: cross-DO env shape
  WriterAgent?: DurableObjectNamespace<any>
}

/**
 * Allowlist of agent classes the spaces routes will accept on
 * invite. Refusing other classes (e.g. 'SpaceAgent', 'ReminderAgent')
 * keeps the dispatcher honest and surfaces typos before they
 * become "agent member exists but never replies" mysteries.
 */
const ALLOWED_AGENT_CLASSES = new Set([
  'AssistantAgent',
  'ResearcherAgent',
  'WriterAgent',
  'AdminAgent',
])

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

// ─── Spaces CRUD ─────────────────────────────────────────────────

app.get('/', async (c) => {
  const userId = c.get('userId')
  const spaces = await listSpacesForUser(c.env.DB, userId)
  return c.json({ spaces })
})

const CreateSpaceSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  spaceMode: z.enum(['open', 'invite', 'org']).optional().default('invite'),
  defaultReplyMode: z.enum(['always', 'mention', 'proactive', 'ambient', 'off']).optional().default('mention'),
  /** Initial member invites — userIds. Creator always becomes owner. */
  inviteUserIds: z.array(z.string()).max(50).optional(),
  /** Initial agent invites — list of { agentClass, agentName, replyMode? }. */
  agents: z
    .array(
      z.object({
        agentClass: z.string().min(1).max(60),
        agentName: z.string().min(1).max(32),
        replyMode: z.enum(['always', 'mention', 'proactive', 'ambient', 'off']).optional(),
      }),
    )
    .max(20)
    .optional(),
})

app.post('/', zValidator('json', CreateSpaceSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const id = crypto.randomUUID()
  const d = drizzle(c.env.DB)
  const now = Math.floor(Date.now() / 1000)
  await d.insert(conversations).values({
    id,
    userId,
    title: body.title,
    summary: body.description ?? null,
    kind: 'space',
    spaceMode: body.spaceMode,
    defaultReplyMode: body.defaultReplyMode,
    historyEnabled: 1,
  })
  // Creator owner-member.
  await d.insert(conversationMembers).values({
    conversationId: id,
    kind: 'user',
    userId,
    role: 'owner',
    joinedAt: now,
    notificationLevel: 'all',
    pinnedToSidebar: 0,
  })
  // Invitees as members.
  if (body.inviteUserIds && body.inviteUserIds.length > 0) {
    const rows = body.inviteUserIds
      .filter((uid) => uid !== userId)
      .map((uid) => ({
        conversationId: id,
        kind: 'user' as const,
        userId: uid,
        role: 'member' as const,
        joinedAt: now,
        notificationLevel: 'all' as const,
        pinnedToSidebar: 0,
        invitedByUserId: userId,
      }))
    if (rows.length > 0) {
      // Idempotent insert — unique index prevents duplicates.
      for (const row of rows) {
        await d.insert(conversationMembers).values(row).onConflictDoNothing()
      }
    }
  }
  // Agents — refuse unknown classes so a typo in the request payload
  // doesn't quietly create a member that the dispatcher can't route.
  const agents = body.agents ?? []
  for (const agent of agents) {
    if (!ALLOWED_AGENT_CLASSES.has(agent.agentClass)) continue
    await d
      .insert(conversationMembers)
      .values({
        conversationId: id,
        kind: 'agent',
        agentClass: agent.agentClass,
        agentName: agent.agentName,
        replyMode: agent.replyMode ?? body.defaultReplyMode,
        role: 'member',
        joinedAt: now,
        notificationLevel: 'all',
        pinnedToSidebar: 0,
        invitedByUserId: userId,
      })
      .onConflictDoNothing()
    // Pre-bind the agent's owner to the space creator so per-user
    // tools (BYOK keys, MCP scope) work from the first @-mention
    // onwards — instead of being captured by whoever happens to
    // mention them first. setOwner is idempotent for the same user.
    const envRec = c.env as unknown as Record<string, unknown>
    const nsRaw = envRec[agent.agentClass] as
      | { idFromName(name: string): unknown; get(id: unknown): unknown }
      | undefined
    if (nsRaw) {
      const stub = nsRaw.get(nsRaw.idFromName(`space:${id}:${agent.agentName}`)) as {
        setOwner: (userId: string) => Promise<void>
      }
      try {
        await stub.setOwner(userId)
      } catch {
        /* setOwner throws on reassign — fine */
      }
    }
  }
  return c.json({ id, title: body.title }, 201)
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)
  const [space] = await d.select().from(conversations).where(eq(conversations.id, id)).limit(1)
  if (!space || space.kind !== 'space') return c.json({ error: 'Not found' }, 404)
  if (!(await isSpaceMember(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)

  const members = await listMembers(c.env.DB, id)
  const messages = await listMessages(c.env.DB, id, { threadParentId: null, limit: 50 })

  // Resolve user member display info (name, email, image) so the client
  // doesn't need a follow-up call. Bounded by space membership size.
  const userIds = members.filter((m) => m.kind === 'user' && m.userId).map((m) => m.userId as string)
  const userRows = userIds.length
    ? await d
        .select({ id: user.id, name: user.name, email: user.email, image: user.image })
        .from(user)
        .where(inArray(user.id, userIds))
    : []

  return c.json({
    space: {
      id: space.id,
      title: space.title,
      summary: space.summary,
      spaceMode: space.spaceMode,
      defaultReplyMode: space.defaultReplyMode,
      historyEnabled: space.historyEnabled,
      starred: space.starred,
      createdAt: toIso(space.createdAt),
      updatedAt: toIso(space.updatedAt),
    },
    members,
    users: userRows,
    messages,
  })
})

const UpdateSpaceSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  summary: z.string().max(500).optional(),
  spaceMode: z.enum(['open', 'invite', 'org']).optional(),
  defaultReplyMode: z.enum(['always', 'mention', 'proactive', 'ambient', 'off']).optional(),
  historyEnabled: z.boolean().optional(),
})
app.patch('/:id', zValidator('json', UpdateSpaceSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceOwner(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body['title'] !== undefined) patch['title'] = body['title']
  if (body['summary'] !== undefined) patch['summary'] = body['summary']
  if (body['spaceMode'] !== undefined) patch['spaceMode'] = body['spaceMode']
  if (body['defaultReplyMode'] !== undefined) patch['defaultReplyMode'] = body['defaultReplyMode']
  if (body['historyEnabled'] !== undefined) patch['historyEnabled'] = body['historyEnabled'] ? 1 : 0
  if (Object.keys(patch).length > 1) {
    await drizzle(c.env.DB).update(conversations).set(patch).where(eq(conversations.id, id))
  }
  return c.json({ ok: true })
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceOwner(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  // Cascade deletes everything on conversation FKs (members, messages).
  await drizzle(c.env.DB).delete(conversations).where(eq(conversations.id, id))
  return c.json({ ok: true })
})

// ─── Presence ────────────────────────────────────────────────────

app.get('/:id/presence', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceMember(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const env = c.env as unknown as SpacesEnv
  if (!env.SpaceAgent) return c.json({ online: [] })
  const stub = env.SpaceAgent.get(env.SpaceAgent.idFromName(id)) as unknown as {
    getOnline: () => Promise<string[]>
  }
  try {
    const online = await stub.getOnline()
    return c.json({ online })
  } catch {
    return c.json({ online: [] })
  }
})

// ─── Messages ────────────────────────────────────────────────────

app.get('/:id/messages', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceMember(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const limit = Math.min(Number(c.req.query('limit') ?? '50') || 50, 200)
  const threadParentId = c.req.query('threadParentId') ?? null
  // Empty string from the client means "top-level" — match strict null.
  const messages = await listMessages(c.env.DB, id, {
    limit,
    threadParentId: threadParentId === null ? null : threadParentId,
  })
  return c.json({ messages })
})

const SendMessageSchema = z.object({
  parts: z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .max(20),
  metadata: z.record(z.string(), z.unknown()).optional(),
  parentMessageId: z.string().nullable().optional(),
  /** Phase 2: quoted source message — UI renders an inline quote chip. */
  quotedMessageId: z.string().nullable().optional(),
})

app.post('/:id/messages', zValidator('json', SendMessageSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceMember(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const env = c.env as unknown as SpacesEnv

  const messageId = crypto.randomUUID()
  const partsJson = JSON.stringify(body.parts)
  const metadataJson = body.metadata ? JSON.stringify({ ...body.metadata, senderKind: 'user', senderUserId: userId }) : JSON.stringify({ senderKind: 'user', senderUserId: userId })
  await drizzle(c.env.DB).insert(conversationMessages).values({
    id: messageId,
    conversationId: id,
    role: 'user',
    parts: partsJson,
    metadata: metadataJson,
    parentMessageId: body.parentMessageId ?? null,
    quotedMessageId: body.quotedMessageId ?? null,
  })
  // Bump conversation updated_at for sidebar ordering.
  await drizzle(c.env.DB).update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id))
  // If reply landed in a thread, bump the parent's threadCount +
  // lastThreadAt in a SINGLE UPDATE — concurrent replies don't race.
  if (body.parentMessageId) {
    const parentId = body.parentMessageId
    await drizzle(c.env.DB)
      .update(conversationMessages)
      .set({
        threadCount: sql`${conversationMessages.threadCount} + 1`,
        lastThreadAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(conversationMessages.id, parentId))
  }

  // Broadcast the canonical row to every connected client.
  const broadcastNewMessage = async (mid: string) => {
    if (!env.SpaceAgent) return
    const stub = env.SpaceAgent.get(env.SpaceAgent.idFromName(id)) as unknown as {
      broadcastNewMessage: (mid: string) => Promise<void>
    }
    try {
      await stub.broadcastNewMessage(mid)
    } catch (err) {
      console.error(JSON.stringify({ event: 'space_broadcast_failed', spaceId: id, mid, error: String(err) }))
    }
  }
  await broadcastNewMessage(messageId)

  // Parse @-mentions and dispatch to agents. Even when there are no
  // @-mentions, we still call into the dispatcher for top-level
  // messages — the dispatcher fans out to `always` / `proactive` /
  // `ambient` agent members. P2-002: without this call, spaces seeded
  // with always-mode agents (e.g. AdminAgent in /admin) appeared
  // silent because the route guarded on `mentions.length > 0`.
  const mentions = await parseMentions(c.env.DB, id, body.parts)
  const isTopLevel = !body.parentMessageId
  const inputText = body.parts
    .map((p) => (typeof (p as { text?: string }).text === 'string' ? (p as { text: string }).text : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
  let dispatchResult: { replyMessageIds: string[] } = { replyMessageIds: [] }
  // Dispatch when (a) there's at least one mention OR (b) it's a
  // top-level message in a space that may have always/proactive
  // agents. In-thread messages with no mentions skip dispatch — the
  // dispatcher's classifier path is top-level only.
  const shouldDispatch = (mentions.length > 0 || isTopLevel) && !!inputText
  console.log(
    JSON.stringify({
      event: 'space_message_dispatch_decision',
      spaceId: id,
      messageId,
      mentionCount: mentions.length,
      isTopLevel,
      hasInputText: !!inputText,
      shouldDispatch,
    }),
  )
  if (shouldDispatch) {
    try {
      dispatchResult = await dispatchMentions({
        env: env as unknown as Parameters<typeof dispatchMentions>[0]['env'],
        spaceId: id,
        senderUserId: userId,
        triggerMessageId: messageId,
        parentMessageId: body.parentMessageId ?? null,
        mentions,
        inputText,
        broadcastNewMessage,
      })
    } catch (err) {
      // Don't fail the user's message on dispatch error — they sent
      // it successfully; the agent just didn't reply. Surface for
      // dogfood via observability.
      console.error(JSON.stringify({ event: 'space_dispatch_error', spaceId: id, error: String(err) }))
    }
  }

  return c.json({ id: messageId, dispatched: dispatchResult.replyMessageIds.length }, 201)
})

app.get('/:id/messages/search', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceMember(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const q = (c.req.query('q') ?? '').trim()
  if (!q) return c.json({ results: [] })
  try {
    // FTS5 path — fast + BM25-ranked. Falls back to LIKE on errors
    // (covers the case where the FTS virtual table was dropped or a
    // query parsing issue with FTS5's MATCH syntax).
    const { searchFTS } = await import('@/server/lib/search')
    const { results } = await searchFTS<typeof conversationMessages.$inferSelect>(c.env.DB, {
      ftsTable: 'conversation_messages_fts',
      sourceTable: 'conversation_messages',
      query: q,
      limit: 20,
      where: '"conversation_messages".conversation_id = ?',
      whereParams: [id],
    })
    return c.json({ results: results.map(shapeMessage) })
  } catch {
    // Fallback — LIKE-scan with wildcard escape.
    const escaped = q.replace(/[\\_%]/g, (m) => `\\${m}`)
    const rows = await drizzle(c.env.DB)
      .select()
      .from(conversationMessages)
      .where(and(eq(conversationMessages.conversationId, id), like(conversationMessages.parts, `%${escaped}%`)))
      .orderBy(desc(conversationMessages.createdAt))
      .limit(20)
    return c.json({ results: rows.map(shapeMessage) })
  }
})

app.patch('/:id/read', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceMember(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  await drizzle(c.env.DB)
    .update(conversationMembers)
    .set({ lastReadAt: Math.floor(Date.now() / 1000) })
    .where(
      and(
        eq(conversationMembers.conversationId, id),
        eq(conversationMembers.kind, 'user'),
        eq(conversationMembers.userId, userId),
      ),
    )
  return c.json({ ok: true })
})

// ─── Members ─────────────────────────────────────────────────────

app.get('/:id/members', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceMember(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const members = await listMembers(c.env.DB, id)
  return c.json({ members })
})

const InviteSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user'),
    userId: z.string(),
    role: z.enum(['admin', 'member']).optional().default('member'),
  }),
  z.object({
    kind: z.literal('agent'),
    agentClass: z.string().min(1).max(60),
    agentName: z.string().min(1).max(32),
    replyMode: z.enum(['always', 'mention', 'proactive', 'ambient', 'off']).optional(),
  }),
])
app.post('/:id/members', zValidator('json', InviteSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceOwner(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const now = Math.floor(Date.now() / 1000)
  if (body.kind === 'user') {
    await drizzle(c.env.DB)
      .insert(conversationMembers)
      .values({
        conversationId: id,
        kind: 'user',
        userId: body.userId,
        role: body.role,
        joinedAt: now,
        notificationLevel: 'all',
        pinnedToSidebar: 0,
        invitedByUserId: userId,
      })
      .onConflictDoNothing()
  } else {
    if (!ALLOWED_AGENT_CLASSES.has(body.agentClass)) {
      return c.json({ error: `Unknown agent class: ${body.agentClass}` }, 400)
    }
    await drizzle(c.env.DB)
      .insert(conversationMembers)
      .values({
        conversationId: id,
        kind: 'agent',
        agentClass: body.agentClass,
        agentName: body.agentName,
        replyMode: body.replyMode ?? 'mention',
        role: 'member',
        joinedAt: now,
        notificationLevel: 'all',
        pinnedToSidebar: 0,
        invitedByUserId: userId,
      })
      .onConflictDoNothing()
  }
  return c.json({ ok: true }, 201)
})

const UpdateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']).optional(),
  replyMode: z.enum(['always', 'mention', 'proactive', 'ambient', 'off']).optional(),
  notificationLevel: z.enum(['all', 'mentions', 'muted']).optional(),
})
app.patch('/:id/members/:memberId', zValidator('json', UpdateMemberSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const memberId = c.req.param('memberId')
  if (!(await isSpaceOwner(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  if (Object.keys(body).length === 0) return c.json({ ok: true })
  await drizzle(c.env.DB)
    .update(conversationMembers)
    .set(body)
    .where(and(eq(conversationMembers.id, memberId), eq(conversationMembers.conversationId, id)))
  return c.json({ ok: true })
})

app.delete('/:id/members/:memberId', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const memberId = c.req.param('memberId')
  const d = drizzle(c.env.DB)
  // Either an owner removing someone, or self-leave.
  const [target] = await d
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.id, memberId), eq(conversationMembers.conversationId, id)))
    .limit(1)
  if (!target) return c.json({ error: 'Not found' }, 404)
  const isSelfLeave = target.kind === 'user' && target.userId === userId
  const isOwnerRemoval = await isSpaceOwner(c.env.DB, id, userId)
  if (!isSelfLeave && !isOwnerRemoval) return c.json({ error: 'Forbidden' }, 403)
  if (target.role === 'owner') {
    // H2 audit fix: atomic last-owner check via subquery in the DELETE.
    // We attempt a guarded delete; if zero rows changed we can
    // confidently return the "last owner" error without racing against
    // a concurrent leave.
    const result = await c.env.DB
      .prepare(
        `DELETE FROM conversation_members
         WHERE id = ?1
           AND (SELECT COUNT(*) FROM conversation_members
                WHERE conversation_id = ?2 AND role = 'owner') > 1`,
      )
      .bind(memberId, id)
      .run()
    const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0
    if (changes === 0) {
      return c.json({ error: 'Cannot leave as the last owner — transfer ownership or delete the space' }, 400)
    }
    return c.json({ ok: true })
  }
  await d.delete(conversationMembers).where(eq(conversationMembers.id, memberId))
  return c.json({ ok: true })
})

const UpdateMembershipSchema = z.object({
  pinnedToSidebar: z.boolean().optional(),
  notificationLevel: z.enum(['all', 'mentions', 'muted']).optional(),
})
app.patch('/:id/membership', zValidator('json', UpdateMembershipSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceMember(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = {}
  if (body['pinnedToSidebar'] !== undefined) patch['pinnedToSidebar'] = body['pinnedToSidebar'] ? 1 : 0
  if (body['notificationLevel'] !== undefined) patch['notificationLevel'] = body['notificationLevel']
  if (Object.keys(patch).length === 0) return c.json({ ok: true })
  await drizzle(c.env.DB)
    .update(conversationMembers)
    .set(patch)
    .where(
      and(
        eq(conversationMembers.conversationId, id),
        eq(conversationMembers.kind, 'user'),
        eq(conversationMembers.userId, userId),
      ),
    )
  return c.json({ ok: true })
})

/** GET /:id/messages/pinned — list pinned messages (Phase 2 shelf). */
app.get('/:id/messages/pinned', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceMember(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const rows = await drizzle(c.env.DB)
    .select()
    .from(conversationMessages)
    .where(and(eq(conversationMessages.conversationId, id), sql`${conversationMessages.pinnedAt} IS NOT NULL`))
    .orderBy(desc(conversationMessages.pinnedAt))
    .limit(50)
  return c.json({ pinned: rows.map((r) => ({
    id: r.id,
    parts: safeParse(r.parts),
    metadata: safeParse(r.metadata),
    pinnedAt: r.pinnedAt,
    pinnedByUserId: r.pinnedByUserId,
    createdAt:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : new Date((r.createdAt as unknown as number) * 1000).toISOString(),
  })) })
})

/** PATCH /:id/members/:memberId/block — owner/admin blocks a member. */
const BlockSchema = z.object({ blocked: z.boolean() })
app.patch('/:id/members/:memberId/block', zValidator('json', BlockSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const memberId = c.req.param('memberId')
  if (!(await isSpaceOwner(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const { blocked } = c.req.valid('json')
  await drizzle(c.env.DB)
    .update(conversationMembers)
    .set({ blockedAt: blocked ? Math.floor(Date.now() / 1000) : null })
    .where(and(eq(conversationMembers.id, memberId), eq(conversationMembers.conversationId, id)))
  return c.json({ ok: true })
})

/** PATCH /:id/history — turn off history (Phase 3 — auto-delete sweep). */
const HistorySchema = z.object({ enabled: z.boolean() })
app.patch('/:id/history', zValidator('json', HistorySchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceOwner(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const { enabled } = c.req.valid('json')
  await drizzle(c.env.DB)
    .update(conversations)
    .set({
      historyEnabled: enabled ? 1 : 0,
      historyDisabledAt: enabled ? null : Math.floor(Date.now() / 1000),
    })
    .where(eq(conversations.id, id))
  return c.json({ ok: true })
})

app.get('/:id/agents', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isSpaceMember(c.env.DB, id, userId))) return c.json({ error: 'Forbidden' }, 403)
  // Phase 1: hardcode the globally available agents. Phase 2 reads
  // from `space_agent_installs`.
  return c.json({
    agents: [
      {
        agentClass: 'AssistantAgent',
        agentName: 'assistant',
        description: 'General-purpose assistant — answers questions, drafts text, runs tools.',
      },
      {
        agentClass: 'ResearcherAgent',
        agentName: 'research',
        description: 'Researches topics on the web and summarises findings.',
      },
      {
        agentClass: 'WriterAgent',
        agentName: 'writer',
        description: 'Drafts long-form prose / emails from research.',
      },
    ],
  })
})

// ─── Helpers ─────────────────────────────────────────────────────

async function isSpaceMember(db: D1Database, spaceId: string, userId: string): Promise<boolean> {
  const [row] = await drizzle(db)
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, spaceId),
        eq(conversationMembers.kind, 'user'),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1)
  return !!row
}

async function isSpaceOwner(db: D1Database, spaceId: string, userId: string): Promise<boolean> {
  const [row] = await drizzle(db)
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, spaceId),
        eq(conversationMembers.kind, 'user'),
        eq(conversationMembers.userId, userId),
        eq(conversationMembers.role, 'owner'),
      ),
    )
    .limit(1)
  return !!row
}

function safeParse(v: unknown): unknown {
  if (v == null) return v
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

function toIso(v: Date | number | string | null): string {
  if (!v) return new Date().toISOString()
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'number') return new Date(v * 1000).toISOString()
  return v
}

export default app
