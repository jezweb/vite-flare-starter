import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const watchers = sqliteTable('watchers', {
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  primaryKey({ columns: [table.entityType, table.entityId, table.userId] }),
  index('watchers_entity_idx').on(table.entityType, table.entityId),
  index('watchers_user_id_idx').on(table.userId),
])
