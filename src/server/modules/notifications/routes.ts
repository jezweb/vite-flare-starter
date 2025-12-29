/**
 * Notifications API Routes
 *
 * CRUD operations for user notifications.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import * as schema from '@/server/db/schema'

const app = new Hono<AuthContext>()

// Apply auth middleware to all routes
app.use('*', authMiddleware)

// Query schema for notifications list
const notificationsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  unreadOnly: z.coerce.boolean().default(false),
})

/**
 * GET /api/notifications
 * List notifications for the authenticated user
 *
 * Requires: notifications:read scope for API tokens
 */
app.get('/', requireScopes('notifications:read'), zValidator('query', notificationsQuerySchema), async (c) => {
  const userId = c.get('userId')
  const query = c.req.valid('query')
  const db = drizzle(c.env.DB, { schema })

  const conditions = [eq(schema.userNotifications.userId, userId)]

  if (query.unreadOnly) {
    conditions.push(eq(schema.userNotifications.read, false))
  }

  const notifications = await db.query.userNotifications.findMany({
    where: and(...conditions),
    limit: query.limit,
    offset: query.offset,
    orderBy: [desc(schema.userNotifications.createdAt)],
  })

  // Parse JSON data fields
  const enrichedNotifications = notifications.map((n) => ({
    ...n,
    data: n.data ? JSON.parse(n.data) : null,
  }))

  // Get unread count
  const unreadCount = await db.query.userNotifications
    .findMany({
      where: and(
        eq(schema.userNotifications.userId, userId),
        eq(schema.userNotifications.read, false)
      ),
      columns: { id: true },
    })
    .then((rows) => rows.length)

  return c.json({
    notifications: enrichedNotifications,
    count: notifications.length,
    unreadCount,
    hasMore: notifications.length === query.limit,
  })
})

/**
 * GET /api/notifications/unread-count
 * Get the count of unread notifications
 *
 * Requires: notifications:read scope for API tokens
 */
app.get('/unread-count', requireScopes('notifications:read'), async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  const unreadNotifications = await db.query.userNotifications.findMany({
    where: and(
      eq(schema.userNotifications.userId, userId),
      eq(schema.userNotifications.read, false)
    ),
    columns: { id: true },
  })

  return c.json({ count: unreadNotifications.length })
})

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read
 *
 * Requires: notifications:write scope for API tokens
 */
app.patch('/:id/read', requireScopes('notifications:write'), async (c) => {
  const userId = c.get('userId')
  const notificationId = c.req.param('id')
  const db = drizzle(c.env.DB, { schema })

  // Check notification exists and belongs to user
  const notification = await db.query.userNotifications.findFirst({
    where: and(
      eq(schema.userNotifications.id, notificationId),
      eq(schema.userNotifications.userId, userId)
    ),
  })

  if (!notification) {
    return c.json({ error: 'Notification not found' }, 404)
  }

  // Update notification
  await db
    .update(schema.userNotifications)
    .set({ read: true })
    .where(eq(schema.userNotifications.id, notificationId))

  return c.json({ success: true })
})

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read for the user
 *
 * Requires: notifications:write scope for API tokens
 */
app.post('/read-all', requireScopes('notifications:write'), async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  await db
    .update(schema.userNotifications)
    .set({ read: true })
    .where(
      and(
        eq(schema.userNotifications.userId, userId),
        eq(schema.userNotifications.read, false)
      )
    )

  return c.json({ success: true })
})

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 *
 * Requires: notifications:write scope for API tokens
 */
app.delete('/:id', requireScopes('notifications:write'), async (c) => {
  const userId = c.get('userId')
  const notificationId = c.req.param('id')
  const db = drizzle(c.env.DB, { schema })

  // Check notification exists and belongs to user
  const notification = await db.query.userNotifications.findFirst({
    where: and(
      eq(schema.userNotifications.id, notificationId),
      eq(schema.userNotifications.userId, userId)
    ),
  })

  if (!notification) {
    return c.json({ error: 'Notification not found' }, 404)
  }

  // Delete notification
  await db
    .delete(schema.userNotifications)
    .where(eq(schema.userNotifications.id, notificationId))

  return c.json({ success: true })
})

/**
 * DELETE /api/notifications
 * Delete all read notifications for the user
 *
 * Requires: notifications:write scope for API tokens
 */
app.delete('/', requireScopes('notifications:write'), async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  await db
    .delete(schema.userNotifications)
    .where(
      and(
        eq(schema.userNotifications.userId, userId),
        eq(schema.userNotifications.read, true)
      )
    )

  return c.json({ success: true })
})

export default app
