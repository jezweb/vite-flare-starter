/**
 * In-App Notification Service
 *
 * Creates persistent in-app notifications for users.
 * Used alongside email notifications for real-time in-app alerts.
 */

import { drizzle } from 'drizzle-orm/d1'
import type { D1Database } from '@cloudflare/workers-types'
import * as schema from '@/server/db/schema'
import type { NotificationType } from './db/schema'

export interface NotificationData {
  entityType?: string
  entityId?: string
  link?: string
  [key: string]: unknown
}

export interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  data?: NotificationData
}

/**
 * Create an in-app notification for a user
 *
 * Non-blocking - errors are caught and logged, not thrown.
 * This ensures notifications don't block the main application flow.
 */
export async function createInAppNotification(
  db: D1Database,
  params: CreateNotificationParams
): Promise<void> {
  const drizzleDb = drizzle(db, { schema })

  try {
    await drizzleDb.insert(schema.userNotifications).values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      data: params.data ? JSON.stringify(params.data) : null,
      read: false,
    })

    console.log(`[InAppNotification] Created ${params.type} notification for user ${params.userId}`)
  } catch (error) {
    console.error(`[InAppNotification] Failed to create notification:`, error)
    // Don't throw - in-app notifications should not block the main flow
  }
}

/**
 * Create multiple in-app notifications (for batch operations)
 *
 * Non-blocking - errors are caught and logged, not thrown.
 */
export async function createBulkNotifications(
  db: D1Database,
  notifications: CreateNotificationParams[]
): Promise<void> {
  if (notifications.length === 0) return

  const drizzleDb = drizzle(db, { schema })

  try {
    await drizzleDb.insert(schema.userNotifications).values(
      notifications.map((params) => ({
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        data: params.data ? JSON.stringify(params.data) : null,
        read: false,
      }))
    )

    console.log(`[InAppNotification] Created ${notifications.length} bulk notifications`)
  } catch (error) {
    console.error(`[InAppNotification] Failed to create bulk notifications:`, error)
  }
}
