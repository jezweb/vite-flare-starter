import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

/**
 * User Metadata — per-user key-value store
 *
 * Stores arbitrary JSON data per key per user. Useful for:
 * - AI conversation context / memory
 * - User preferences beyond the base settings
 * - Feature-specific state (onboarding progress, saved filters, etc.)
 * - Cached data per user (API responses, computed values)
 */
export const userMeta = sqliteTable('user_meta', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(), // JSON string
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('user_meta_user_key_idx').on(table.userId, table.key),
  index('user_meta_user_id_idx').on(table.userId),
])
