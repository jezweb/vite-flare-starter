/**
 * Notifications Module
 *
 * In-app notification system with persistence.
 */

export { userNotifications, userNotificationsRelations, NOTIFICATION_TYPES } from './db/schema'
export type { UserNotification, NewUserNotification, NotificationType } from './db/schema'
export { createInAppNotification, createBulkNotifications } from './service'
export type { NotificationData, CreateNotificationParams } from './service'
export { default as notificationsRoutes } from './routes'
