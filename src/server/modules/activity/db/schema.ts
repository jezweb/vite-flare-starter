/**
 * Activity Logs Schema
 *
 * Centralized audit trail for tracking all user actions across the application.
 * Records who did what, when, and what changed.
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { user } from '@/server/modules/auth/db/schema'

/**
 * Activity action types
 */
export const ACTIVITY_ACTIONS = [
  'create',
  'update',
  'delete',
  'archive',
  'restore',
  'import',
  'export',
  'assign',
  'unassign',
  'view',
  'convert',
] as const

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number]

/**
 * Activity Logs Table
 *
 * Stores audit trail for all user actions.
 */
export const activityLogs = sqliteTable(
  'activity_logs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Who performed the action
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // What action was performed
    action: text('action', { enum: ACTIVITY_ACTIONS }).notNull(),

    // What type of entity was affected
    entityType: text('entityType').notNull(), // 'contact', 'company', 'deal', etc.

    // Which specific entity (ID for linking)
    entityId: text('entityId').notNull(),

    // Human-readable name of the entity (for display without joins)
    entityName: text('entityName'),

    // What specifically changed (for updates)
    // Format: { fieldName: { old: value, new: value } }
    changes: text('changes', { mode: 'json' }).$type<Record<string, { old: unknown; new: unknown }>>(),

    // Additional context (e.g., import source, bulk operation ID)
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),

    // IP address for security auditing (optional)
    ipAddress: text('ipAddress'),

    // User agent for security auditing (optional)
    userAgent: text('userAgent'),

    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    // Indexes for common query patterns
    userIdIdx: index('activity_logs_user_idx').on(table.userId),
    entityTypeIdx: index('activity_logs_entity_type_idx').on(table.entityType),
    entityIdIdx: index('activity_logs_entity_id_idx').on(table.entityId),
    actionIdx: index('activity_logs_action_idx').on(table.action),
    createdAtIdx: index('activity_logs_created_at_idx').on(table.createdAt),
    // Composite index for entity lookups
    entityLookupIdx: index('activity_logs_entity_lookup_idx').on(table.entityType, table.entityId),
  })
)

// Relations
export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(user, {
    fields: [activityLogs.userId],
    references: [user.id],
  }),
}))

// Type exports
export type ActivityLog = typeof activityLogs.$inferSelect
export type NewActivityLog = typeof activityLogs.$inferInsert
