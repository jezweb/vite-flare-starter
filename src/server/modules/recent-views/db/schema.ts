import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const recentViews = sqliteTable(
  'recent_views',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    viewedAt: integer('viewed_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.entityType, table.entityId] }),
    index('recent_views_user_id_idx').on(table.userId),
    index('recent_views_viewed_at_idx').on(table.viewedAt),
  ]
)
