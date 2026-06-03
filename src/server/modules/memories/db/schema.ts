/**
 * Memories — multi-entry, three-scope persistent memory for the AI agent.
 *
 * Inspired by Claude Code's auto-memory system (~/.claude/projects/.../memory/),
 * adapted for a database-backed multi-tenant web app.
 *
 * Three scopes via the `scope` discriminator:
 *   - 'project' — visible to project members; injected when chats start in this project
 *   - 'user'    — private to the user; injected on any chat the user starts
 *   - 'org'     — visible to org members; injected for any chat in any org-shared resource
 *
 * Each entry has: name (slug), description (one-line index hook), type
 * (fact/preference/decision/context/reference), content (the body), and
 * optionally `is_private` (if 1 → never auto-injected; only via explicit
 * load_memory tool call by the agent).
 *
 * Privacy boundary: user memories NEVER inject into chats started by another
 * user, even on shared projects. Enforced by the injection helper.
 *
 * Provenance: `source_conversation_id` is set by the auto-job to the
 * conversation that produced this memory. NULL for manually-created entries
 * or template-seeded entries.
 *
 * Phase 3 ships this. The memories module CRUD + summarisation job + agent
 * tools (memory_search, memory_add, memory_update, memory_remove, load_memory)
 * are added in that phase.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { conversations } from '@/server/modules/conversations/db/schema'

export const MEMORY_SCOPES = ['project', 'user', 'org'] as const
export type MemoryScope = (typeof MEMORY_SCOPES)[number]

export const MEMORY_TYPES = ['fact', 'preference', 'decision', 'context', 'reference'] as const
export type MemoryType = (typeof MEMORY_TYPES)[number]

export const memories = sqliteTable(
  'memories',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Discriminator for who owns this memory and what chats it injects into. */
    scope: text('scope', { enum: MEMORY_SCOPES }).notNull(),
    /** Foreign-key-ish — projects.id, user.id, or organization.id depending on scope. */
    scopeId: text('scope_id').notNull(),
    /** Short slug ('jez-style', 'quoting-process'). Stable identifier for retrieval. */
    name: text('name').notNull(),
    /** One-liner shown in the memory index injected into the system prompt. */
    description: text('description').notNull(),
    /** Type discriminator for filtering/grouping. */
    type: text('type', { enum: MEMORY_TYPES }).notNull(),
    /** The actual memory body. Soft cap ~80 lines; agent prompted to split when bloated. */
    content: text('content').notNull(),
    /**
     * Privacy zone (Extension C). When 1, this memory is NEVER auto-injected
     * into the system prompt. Available only via explicit `load_memory(name)`
     * tool call by the agent. Use cases: account numbers, credentials hint,
     * sensitive client data.
     */
    isPrivate: integer('is_private').notNull().default(0),
    /**
     * Conversation that produced this memory (provenance). Null for manual
     * creates or template seeds. ON DELETE SET NULL — the memory survives
     * even if the source conversation is deleted.
     */
    sourceConversationId: text('source_conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('memories_scope_idx').on(table.scope, table.scopeId),
    index('memories_scope_type_idx').on(table.scope, table.scopeId, table.type),
    index('memories_scope_private_idx').on(table.scope, table.scopeId, table.isPrivate),
    index('memories_source_conversation_idx').on(table.sourceConversationId),
  ]
)

export type Memory = typeof memories.$inferSelect
export type NewMemory = typeof memories.$inferInsert
