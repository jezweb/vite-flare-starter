import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'
import { projects } from '@/server/modules/projects/db/schema'

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  /**
   * Optional project grouping. Nullable — null means "ungrouped / personal".
   * ON DELETE SET NULL so removing a project returns conversations to the
   * flat list rather than deleting them.
   */
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  title: text('title'),
  /**
   * One-line sidebar summary (~120 chars). Generated after the first
   * assistant response by a cheap model (Kimi K2.5 via Workers AI) so the
   * conversation list shows "what this was about" instead of just a
   * truncated first message.
   */
  summary: text('summary'),
  /**
   * 1 when the user has starred this conversation. Starred conversations
   * render in a pinned section above the date-grouped list.
   */
  starred: integer('starred').notNull().default(0),
  model: text('model'),
  systemPrompt: text('system_prompt'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('conversations_user_id_idx').on(table.userId),
  index('conversations_updated_at_idx').on(table.updatedAt),
  // Starred rows first, then most-recent — matches the sidebar's sort order.
  index('conversations_user_starred_idx').on(table.userId, table.starred, table.updatedAt),
  // Fetch all conversations for a project (used by the project page).
  index('conversations_project_id_idx').on(table.projectId),
])

export const conversationMessages = sqliteTable('conversation_messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  parts: text('parts').notNull(), // JSON blob of UIMessage parts
  metadata: text('metadata'), // JSON blob of message metadata
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('conversation_messages_conversation_id_idx').on(table.conversationId),
  index('conversation_messages_created_at_idx').on(table.createdAt),
])
