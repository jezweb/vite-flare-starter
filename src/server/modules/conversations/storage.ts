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
import { conversations, conversationMessages } from './db/schema'
import type { UIMessage } from 'ai'

export interface ConversationSummary {
  id: string
  title: string | null
  model: string | null
  createdAt: string
  updatedAt: string
}

export interface ChatStorage {
  createConversation(userId: string, opts?: { title?: string; model?: string; systemPrompt?: string }): Promise<string>
  loadChat(conversationId: string): Promise<UIMessage[]>
  saveChat(params: { conversationId: string; messages: UIMessage[] }): Promise<void>
  listConversations(userId: string, opts?: { limit?: number; offset?: number }): Promise<ConversationSummary[]>
  deleteConversation(conversationId: string, userId: string): Promise<void>
  updateTitle(conversationId: string, title: string): Promise<void>
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
      })
      return id
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
              ? (typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta))
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
          model: conversations.model,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.updatedAt))
        .limit(limit)
        .offset(offset)

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        model: r.model,
        createdAt: r.createdAt ? new Date(r.createdAt as unknown as number).toISOString() : new Date().toISOString(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt as unknown as number).toISOString() : new Date().toISOString(),
      }))
    },

    async deleteConversation(conversationId, userId) {
      await d
        .delete(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    },

    async updateTitle(conversationId, title) {
      await d
        .update(conversations)
        .set({ title })
        .where(eq(conversations.id, conversationId))
    },
  }
}
