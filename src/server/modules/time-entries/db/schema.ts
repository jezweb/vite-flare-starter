/**
 * time_entries — polymorphic time tracking (#62(3))
 *
 * Same attach-to-anything shape as comments: (entityType, entityId).
 * A row is one logged chunk of work — duration in minutes, an optional
 * note, the work date (not the logging timestamp), and a billable
 * flag. Timesheets, project costing, and Desk-style per-ticket time
 * all aggregate from here.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    durationMinutes: integer('duration_minutes').notNull(),
    description: text('description'),
    /** Work date (yyyy-mm-dd) — distinct from createdAt, which records when it was logged. */
    date: text('date').notNull(),
    billable: integer('billable', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index('time_entries_entity_idx').on(table.entityType, table.entityId),
    index('time_entries_user_idx').on(table.userId, table.date),
  ]
)

export type TimeEntry = typeof timeEntries.$inferSelect
