/**
 * User Notifications Schema
 *
 * In-app notifications for real-time user alerts.
 * Complements the email notification system with persistent in-app notifications.
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { user } from '@/server/modules/auth/db/schema'

/**
 * Notification types
 */
export const NOTIFICATION_TYPES = [
  'system', // General system notifications
  'mention', // When user is mentioned
  'assignment', // When something is assigned to user
  'info', // Informational notifications
  'success', // Success notifications
  'warning', // Warning notifications
  'error', // Error notifications
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/**
 * User Notifications Table
 *
 * Stores in-app notifications for users to view in the notification panel.
 */
export const userNotifications = sqliteTable(
  'user_notifications',
  {
    // ============ Primary Key ============
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // ============ User Reference ============
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // ============ Notification Content ============
    type: text('type', { enum: NOTIFICATION_TYPES }).notNull().default('system'),
    title: text('title').notNull(),
    message: text('message').notNull(),

    // ============ Optional Metadata ============
    // JSON object for additional data like entity IDs, links, etc.
    // e.g., { entityType: 'task', entityId: 'abc123', link: '/dashboard/tasks/abc123' }
    data: text('data'),

    // ============ State ============
    read: integer('read', { mode: 'boolean' }).notNull().default(false),

    // ============ Timestamps ============
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index('user_notifications_userId_idx').on(table.userId),
    userReadIdx: index('user_notifications_userId_read_idx').on(table.userId, table.read),
    createdAtIdx: index('user_notifications_createdAt_idx').on(table.createdAt),
  })
)

// ============ Relations ============

export const userNotificationsRelations = relations(userNotifications, ({ one }) => ({
  user: one(user, {
    fields: [userNotifications.userId],
    references: [user.id],
  }),
}))

// ============ Type Exports ============
export type UserNotification = typeof userNotifications.$inferSelect
export type NewUserNotification = typeof userNotifications.$inferInsert
