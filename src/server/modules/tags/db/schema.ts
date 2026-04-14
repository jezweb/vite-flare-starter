import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  colour: text('colour').notNull().default('#6b7280'),
  entityType: text('entity_type').notNull(), // scopes tags per domain
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('tags_entity_type_idx').on(table.entityType),
  index('tags_user_id_idx').on(table.userId),
])

export const entityTags = sqliteTable('entity_tags', {
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  primaryKey({ columns: [table.entityType, table.entityId, table.tagId] }),
  index('entity_tags_entity_idx').on(table.entityType, table.entityId),
  index('entity_tags_tag_id_idx').on(table.tagId),
])
