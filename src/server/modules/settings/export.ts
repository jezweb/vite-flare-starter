/**
 * Data Export API
 *
 * GDPR-compliant data export functionality.
 * Returns all user data in JSON format.
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import * as schema from '@/server/db/schema'

const app = new Hono<AuthContext>()

// Apply auth middleware
app.use('/*', authMiddleware)

/**
 * GET /api/settings/export
 * Export all user data as JSON
 *
 * Includes:
 * - User profile
 * - Sessions (current)
 * - API tokens (metadata only, not secrets)
 * - Activity logs
 * - Notifications
 * - Preferences
 *
 * Requires: settings:read scope for API tokens
 */
app.get('/', requireScopes('settings:read'), async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  try {
    // Fetch all user data in parallel
    const [user, sessions, apiTokens, activities, notifications] = await Promise.all([
      // User profile
      db.query.user.findFirst({
        where: eq(schema.user.id, userId),
        columns: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          role: true,
          preferences: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      // Active sessions
      db.query.session.findMany({
        where: eq(schema.session.userId, userId),
        columns: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          expiresAt: true,
        },
      }),

      // API tokens (metadata only - no secrets)
      db.query.apiTokens.findMany({
        where: eq(schema.apiTokens.userId, userId),
        columns: {
          id: true,
          name: true,
          tokenPrefix: true,
          scopes: true,
          expiresAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
      }),

      // Activity logs
      db.query.activityLogs.findMany({
        where: eq(schema.activityLogs.userId, userId),
        columns: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          entityName: true,
          changes: true,
          metadata: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
        },
        orderBy: (logs, { desc }) => [desc(logs.createdAt)],
        limit: 1000, // Limit to last 1000 entries
      }),

      // Notifications
      db.query.userNotifications.findMany({
        where: eq(schema.userNotifications.userId, userId),
        columns: {
          id: true,
          type: true,
          title: true,
          message: true,
          data: true,
          read: true,
          createdAt: true,
        },
        orderBy: (notifs, { desc }) => [desc(notifs.createdAt)],
      }),
    ])

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    // Prepare export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      user: {
        ...user,
        createdAt: user.createdAt?.toISOString(),
        updatedAt: user.updatedAt?.toISOString(),
      },
      sessions: sessions.map((s) => ({
        ...s,
        createdAt: s.createdAt?.toISOString(),
        expiresAt: s.expiresAt?.toISOString(),
      })),
      apiTokens: apiTokens.map((t) => ({
        ...t,
        expiresAt: t.expiresAt?.toISOString(),
        lastUsedAt: t.lastUsedAt?.toISOString(),
        createdAt: t.createdAt?.toISOString(),
      })),
      activities: activities.map((a) => ({
        ...a,
        createdAt: a.createdAt?.toISOString(),
      })),
      notifications: notifications.map((n) => ({
        ...n,
        createdAt: n.createdAt?.toISOString(),
      })),
    }

    // Return as downloadable JSON
    const filename = `user-data-export-${new Date().toISOString().split('T')[0]}.json`

    return c.json(exportData, 200, {
      'Content-Disposition': `attachment; filename="${filename}"`,
    })
  } catch (error) {
    console.error('Data export error:', error)
    return c.json({ error: 'Failed to export data' }, 500)
  }
})

export default app
