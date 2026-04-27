/**
 * Spaces storage — member checks, message read/write, search.
 *
 * Built on the same `conversations`, `conversation_messages`, and
 * `conversation_members` tables shared with the chat module. The
 * spaces routes use these helpers so the SQL stays in one place.
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import {
  conversationMembers,
  conversationMessages,
  conversations,
} from '@/server/modules/conversations/db/schema'
import type { ReplyMode, MemberRole, NotificationLevel } from '@/server/modules/conversations/db/schema'

export interface SpaceSummary {
  id: string
  title: string | null
  spaceMode: string | null
  defaultReplyMode: string | null
  historyEnabled: number
  starred: number
  createdAt: string
  updatedAt: string
  /** Per-user fields surfaced from the requesting user's member row. */
  pinnedToSidebar: number
  notificationLevel: NotificationLevel
  lastReadAt: number | null
  /** Cached member counts. Computed at list time. */
  memberCount: number
  agentCount: number
}

export interface MemberRow {
  id: string
  kind: 'user' | 'agent'
  userId: string | null
  agentClass: string | null
  agentName: string | null
  replyMode: ReplyMode | null
  role: MemberRole
  notificationLevel: NotificationLevel
  pinnedToSidebar: number
  lastReadAt: number | null
  joinedAt: number
}

export interface MessageRow {
  id: string
  conversationId: string
  role: string
  parts: unknown
  metadata: unknown
  parentMessageId: string | null
  threadCount: number
  lastThreadAt: number | null
  reactions: unknown
  pinnedAt: number | null
  pinnedByUserId: string | null
  createdAt: string
}

/** List spaces the user is a member of, sorted pinned-first then most-recent. */
export async function listSpacesForUser(db: D1Database, userId: string): Promise<SpaceSummary[]> {
  const d = drizzle(db)
  // Single round-trip: members → conversations join, scoped to spaces.
  const rows = await d
    .select({
      id: conversations.id,
      title: conversations.title,
      spaceMode: conversations.spaceMode,
      defaultReplyMode: conversations.defaultReplyMode,
      historyEnabled: conversations.historyEnabled,
      starred: conversations.starred,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      pinnedToSidebar: conversationMembers.pinnedToSidebar,
      notificationLevel: conversationMembers.notificationLevel,
      lastReadAt: conversationMembers.lastReadAt,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
    .where(
      and(
        eq(conversationMembers.userId, userId),
        eq(conversationMembers.kind, 'user'),
        eq(conversations.kind, 'space'),
      ),
    )
    .orderBy(desc(conversationMembers.pinnedToSidebar), desc(conversations.updatedAt))

  if (rows.length === 0) return []

  // Bulk fetch member counts per space (one query, group by).
  const counts = await d
    .select({
      conversationId: conversationMembers.conversationId,
      kind: conversationMembers.kind,
      n: sql<number>`COUNT(*)`,
    })
    .from(conversationMembers)
    .where(eq(conversationMembers.kind, 'user'))
    .groupBy(conversationMembers.conversationId, conversationMembers.kind)

  const agentCounts = await d
    .select({
      conversationId: conversationMembers.conversationId,
      n: sql<number>`COUNT(*)`,
    })
    .from(conversationMembers)
    .where(eq(conversationMembers.kind, 'agent'))
    .groupBy(conversationMembers.conversationId)

  const userCountMap = new Map(counts.map((r) => [r.conversationId, r.n]))
  const agentCountMap = new Map(agentCounts.map((r) => [r.conversationId, r.n]))

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    spaceMode: r.spaceMode,
    defaultReplyMode: r.defaultReplyMode,
    historyEnabled: r.historyEnabled,
    starred: r.starred,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
    pinnedToSidebar: r.pinnedToSidebar,
    notificationLevel: r.notificationLevel,
    lastReadAt: r.lastReadAt,
    memberCount: userCountMap.get(r.id) ?? 0,
    agentCount: agentCountMap.get(r.id) ?? 0,
  }))
}

/** Full member list for a space, ordered owners → admins → members → agents. */
export async function listMembers(db: D1Database, conversationId: string): Promise<MemberRow[]> {
  const d = drizzle(db)
  const rows = await d
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))
    .orderBy(asc(conversationMembers.kind), asc(conversationMembers.role), asc(conversationMembers.joinedAt))
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as 'user' | 'agent',
    userId: r.userId,
    agentClass: r.agentClass,
    agentName: r.agentName,
    replyMode: r.replyMode,
    role: r.role,
    notificationLevel: r.notificationLevel,
    pinnedToSidebar: r.pinnedToSidebar,
    lastReadAt: r.lastReadAt,
    joinedAt: r.joinedAt,
  }))
}

/** Recent messages page (top-level + thread filter). */
export async function listMessages(
  db: D1Database,
  conversationId: string,
  opts: { limit?: number; before?: string; threadParentId?: string | null } = {},
): Promise<MessageRow[]> {
  const d = drizzle(db)
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const conditions = [eq(conversationMessages.conversationId, conversationId)]
  if (opts.threadParentId) {
    conditions.push(eq(conversationMessages.parentMessageId, opts.threadParentId))
  } else if (opts.threadParentId === null) {
    // Caller asked for top-level only.
    conditions.push(isNull(conversationMessages.parentMessageId))
  }
  const rows = await d
    .select()
    .from(conversationMessages)
    .where(and(...conditions))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(limit)
  return rows.reverse().map(shapeMessage)
}

export function shapeMessage(row: typeof conversationMessages.$inferSelect): MessageRow {
  let parts: unknown = []
  try {
    parts = typeof row.parts === 'string' ? JSON.parse(row.parts) : row.parts
  } catch {
    parts = []
  }
  let metadata: unknown
  if (row.metadata) {
    try {
      metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    } catch {
      metadata = undefined
    }
  }
  let reactions: unknown
  if (row.reactions) {
    try {
      reactions = typeof row.reactions === 'string' ? JSON.parse(row.reactions) : row.reactions
    } catch {
      reactions = undefined
    }
  }
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    parts,
    metadata,
    parentMessageId: row.parentMessageId ?? null,
    threadCount: row.threadCount,
    lastThreadAt: row.lastThreadAt ?? null,
    reactions,
    pinnedAt: row.pinnedAt ?? null,
    pinnedByUserId: row.pinnedByUserId ?? null,
    createdAt: toIso(row.createdAt),
  }
}

function toIso(v: Date | number | string | null): string {
  if (!v) return new Date().toISOString()
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'number') return new Date(v * 1000).toISOString()
  return v
}
