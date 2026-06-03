/**
 * Chat Storage — conversation persistence layer
 *
 * Stores UIMessages in D1 (conversations + conversation_messages tables).
 * Interface-based so it can be swapped to Durable Objects later.
 *
 * Messages are stored as JSON blobs matching the AI SDK UIMessage format.
 * This preserves tool parts, reasoning, metadata, and all rich content.
 */
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, and } from 'drizzle-orm'
import { conversations, conversationMessages, conversationMembers } from './db/schema'
import { projects } from '@/server/modules/projects/db/schema'
import type { UIMessage } from 'ai'

export interface ConversationSummary {
  id: string
  title: string | null
  /** One-line sidebar summary, generated after first assistant response. */
  summary: string | null
  /** 0 | 1. 1 means the user has pinned this conversation to the top of the sidebar. */
  starred: number
  /** Project grouping — null = ungrouped / personal. */
  projectId: string | null
  model: string | null
  createdAt: string
  updatedAt: string
}

export interface ChatStorage {
  createConversation(
    userId: string,
    opts?: { title?: string; model?: string; systemPrompt?: string; projectId?: string | null }
  ): Promise<string>
  /**
   * Insert a conversation with a caller-supplied id. Used when the id is
   * generated upfront (so the client can navigate to the permalink) but the
   * actual DB row is deferred until first successful message save.
   */
  createConversationWithId(
    id: string,
    userId: string,
    opts?: { title?: string; model?: string; systemPrompt?: string; projectId?: string | null }
  ): Promise<void>
  /**
   * True if this user is the owner (creator) of the conversation.
   *
   * Spaces Phase 1 dual-read: prefers `conversation_members` (role='owner')
   * so unified storage works for both legacy 1:1 chats (backfilled with
   * a single owner-user) and new spaces. Falls back to the legacy
   * `conversations.user_id` column if no member rows exist for the row
   * (defensive — handles the brief window between create and member
   * insert).
   */
  isOwner(conversationId: string, userId: string): Promise<boolean>
  /**
   * True if this user is a member of the conversation regardless of
   * role. Used by spaces routes where read access is broader than
   * owner-only. Phase 1 also returns true for legacy 1:1 chat owners
   * via the same member backfill.
   */
  isMember(conversationId: string, userId: string): Promise<boolean>
  /**
   * Fetch the projectId for a conversation (or null if ungrouped / missing).
   * Used by the chat route to layer project instructions into the system
   * prompt without trusting the client to pass it.
   */
  getProjectId(conversationId: string, userId: string): Promise<string | null>
  loadChat(conversationId: string): Promise<UIMessage[]>
  saveChat(params: { conversationId: string; messages: UIMessage[] }): Promise<void>
  listConversations(
    userId: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<ConversationSummary[]>
  deleteConversation(conversationId: string, userId: string): Promise<void>
  updateTitle(conversationId: string, userId: string, title: string): Promise<void>
  /** Write the auto-generated title + sidebar summary after the first assistant turn. */
  updateSummary(
    conversationId: string,
    userId: string,
    fields: { title?: string | null; summary?: string | null }
  ): Promise<void>
  /** Toggle the starred flag. No-op if the user doesn't own the conversation. */
  setStarred(conversationId: string, userId: string, starred: boolean): Promise<void>
  /**
   * Move the conversation into / out of a project. Pass null to clear
   * (return to the ungrouped flat list).
   */
  updateProject(conversationId: string, userId: string, projectId: string | null): Promise<void>
}

/**
 * D1-backed ChatStorage implementation.
 *
 * Messages are append-only — saveChat diffs existing messages
 * and only inserts new ones (identified by message ID).
 */
export function createD1ChatStorage(db: D1Database): ChatStorage {
  const d = drizzle(db)

  return {
    async createConversation(userId, opts) {
      const id = crypto.randomUUID()
      await d.insert(conversations).values({
        id,
        userId,
        title: opts?.title || null,
        model: opts?.model || null,
        systemPrompt: opts?.systemPrompt || null,
        projectId: opts?.projectId ?? null,
      })
      // Spaces Phase 1: insert membership rows for the legacy 1:1 chat
      // shape — the creating user as 'owner' and the default
      // AssistantAgent ('assistant', always-replying). This keeps the
      // dual-read isOwner / isMember checks working without any code
      // path having to look at the legacy conversations.user_id column.
      await seedDefaultChatMembers(d, id, userId)
      return id
    },

    async createConversationWithId(id, userId, opts) {
      // onConflictDoNothing lets this run idempotently for retried streams.
      await d
        .insert(conversations)
        .values({
          id,
          userId,
          title: opts?.title || null,
          model: opts?.model || null,
          systemPrompt: opts?.systemPrompt || null,
          projectId: opts?.projectId ?? null,
        })
        .onConflictDoNothing()
      await seedDefaultChatMembers(d, id, userId)
    },

    async getProjectId(conversationId, userId) {
      const [row] = await d
        .select({ projectId: conversations.projectId })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
        .limit(1)
      return row?.projectId ?? null
    },

    async isOwner(conversationId, userId) {
      // Prefer the unified members table — dual-read supports legacy
      // chats (backfilled with role='owner') and new spaces.
      const [memberRow] = await d
        .select({ id: conversationMembers.id })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, conversationId),
            eq(conversationMembers.kind, 'user'),
            eq(conversationMembers.userId, userId),
            eq(conversationMembers.role, 'owner')
          )
        )
        .limit(1)
      if (memberRow) return true
      // Defensive fallback for the brief window after create where the
      // member row insert might not have committed yet.
      const [row] = await d
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
        .limit(1)
      return !!row
    },

    async isMember(conversationId, userId) {
      const [row] = await d
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
      if (row) return true
      // Legacy fallback — same defensive path as isOwner.
      const [legacyRow] = await d
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
        .limit(1)
      return !!legacyRow
    },

    async loadChat(conversationId) {
      const rows = await d
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversationId))
        .orderBy(conversationMessages.createdAt)

      return rows.map((row) => {
        // Defensive parsing: parts might be a string (from D1 text column) or already parsed
        let parts: unknown[]
        try {
          parts = typeof row.parts === 'string' ? JSON.parse(row.parts) : row.parts
          if (!Array.isArray(parts)) parts = []
        } catch {
          parts = []
        }

        // Defensive parsing for metadata
        let metadata: Record<string, unknown> | undefined
        if (row.metadata) {
          try {
            metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
          } catch {
            metadata = undefined
          }
        }

        return {
          id: row.id,
          role: row.role as UIMessage['role'],
          parts,
          ...(metadata ? { metadata } : {}),
          createdAt: row.createdAt ? new Date(row.createdAt as unknown as number) : new Date(),
        }
      }) as UIMessage[]
    },

    async saveChat({ conversationId, messages }) {
      // Get existing message IDs to avoid duplicates
      const existing = await d
        .select({ id: conversationMessages.id })
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversationId))

      const existingIds = new Set(existing.map((r) => r.id))

      // Only insert new messages
      const newMessages = messages.filter((m) => !existingIds.has(m.id))

      if (newMessages.length === 0) return

      // Batch insert (D1 limit ~10 rows per insert)
      const BATCH_SIZE = 10
      for (let i = 0; i < newMessages.length; i += BATCH_SIZE) {
        const batch = newMessages.slice(i, i + BATCH_SIZE)
        await d.insert(conversationMessages).values(
          batch.map((m) => {
            // Defensive: ensure parts is serialised as a JSON string, never double-encoded
            const rawParts = m.parts ?? []
            const partsStr = typeof rawParts === 'string' ? rawParts : JSON.stringify(rawParts)
            const rawMeta = (m as unknown as Record<string, unknown>)['metadata']
            const metaStr = rawMeta
              ? typeof rawMeta === 'string'
                ? rawMeta
                : JSON.stringify(rawMeta)
              : null
            return {
              id: m.id,
              conversationId,
              role: m.role,
              parts: partsStr,
              metadata: metaStr,
            }
          })
        )
      }

      // Update conversation timestamp
      await d
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId))
    },

    async listConversations(userId, opts) {
      const limit = opts?.limit ?? 50
      const offset = opts?.offset ?? 0

      const rows = await d
        .select({
          id: conversations.id,
          title: conversations.title,
          summary: conversations.summary,
          starred: conversations.starred,
          projectId: conversations.projectId,
          model: conversations.model,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(eq(conversations.userId, userId))
        // Starred conversations first (1 > 0), then most-recently-updated
        // within each group.
        .orderBy(desc(conversations.starred), desc(conversations.updatedAt))
        .limit(limit)
        .offset(offset)

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary ?? null,
        starred: r.starred ?? 0,
        projectId: r.projectId ?? null,
        model: r.model,
        createdAt: r.createdAt
          ? new Date(r.createdAt as unknown as number).toISOString()
          : new Date().toISOString(),
        updatedAt: r.updatedAt
          ? new Date(r.updatedAt as unknown as number).toISOString()
          : new Date().toISOString(),
      }))
    },

    async deleteConversation(conversationId, userId) {
      await d
        .delete(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    },

    async updateTitle(conversationId, userId, title) {
      await d
        .update(conversations)
        .set({ title })
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    },

    async updateSummary(conversationId, userId, fields) {
      const patch: { title?: string | null; summary?: string | null } = {}
      if (fields.title !== undefined) patch.title = fields.title
      if (fields.summary !== undefined) patch.summary = fields.summary
      if (Object.keys(patch).length === 0) return
      await d
        .update(conversations)
        .set(patch)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    },

    async setStarred(conversationId, userId, starred) {
      await d
        .update(conversations)
        .set({ starred: starred ? 1 : 0 })
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    },

    async updateProject(conversationId, userId, projectId) {
      // Verify the target project belongs to this user before wiring the FK.
      // Without this check, a malicious client could PATCH a conversation
      // with another user's project UUID. The bad cross-user instructions
      // still wouldn't be loaded (agent.loadProject() scopes by userId), but
      // the conversation row would reference a project it can't display,
      // corrupting the sidebar grouping and the project page's conversation
      // count.
      if (projectId !== null) {
        const [owned] = await d
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
          .limit(1)
        if (!owned) {
          // Silently no-op on invalid project — mirrors the "not found" feel
          // of all other scoped endpoints without leaking whether the
          // project exists under a different user.
          return
        }
      }
      await d
        .update(conversations)
        .set({ projectId })
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    },
  }
}

/**
 * Seed the default 1:1 chat membership shape — one user-owner + one
 * always-replying AssistantAgent member. Idempotent via
 * onConflictDoNothing (the unique indexes on conversation_id+user_id
 * and conversation_id+agent_name guarantee uniqueness).
 *
 * Pulled out as a free function so spaces routes can also reuse the
 * member-insert pattern when creating a Space (with different role /
 * replyMode defaults).
 */
async function seedDefaultChatMembers(
  d: ReturnType<typeof drizzle>,
  conversationId: string,
  ownerUserId: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await d
    .insert(conversationMembers)
    .values({
      conversationId,
      kind: 'user',
      userId: ownerUserId,
      role: 'owner',
      replyMode: null,
      joinedAt: now,
      notificationLevel: 'all',
      pinnedToSidebar: 0,
    })
    .onConflictDoNothing()
  await d
    .insert(conversationMembers)
    .values({
      conversationId,
      kind: 'agent',
      agentClass: 'AssistantAgent',
      agentName: 'assistant',
      replyMode: 'always',
      role: 'member',
      joinedAt: now,
      notificationLevel: 'all',
      pinnedToSidebar: 0,
    })
    .onConflictDoNothing()
}
