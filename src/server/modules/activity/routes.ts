/**
 * Activity Logs API Routes
 *
 * Provides endpoints for viewing and filtering activity logs.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, inArray, sql, gte } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import * as schema from '@/server/db/schema'

const app = new Hono<AuthContext>()

// Apply auth middleware to all routes
app.use('*', authMiddleware)

// Query schema for activity logs
const activityQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z
    .enum([
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
    ])
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

/**
 * GET /api/activity
 * List activity logs for the authenticated user
 * Supports: filtering by entityType, entityId, action; pagination
 */
app.get('/', zValidator('query', activityQuerySchema), async (c) => {
  const userId = c.get('userId')
  const query = c.req.valid('query')
  const db = drizzle(c.env.DB, { schema })

  // Build where clause - only show user's own activities
  const conditions = [eq(schema.activityLogs.userId, userId)]

  if (query.entityType) {
    conditions.push(eq(schema.activityLogs.entityType, query.entityType))
  }

  if (query.entityId) {
    conditions.push(eq(schema.activityLogs.entityId, query.entityId))
  }

  if (query.action) {
    conditions.push(eq(schema.activityLogs.action, query.action))
  }

  // Fetch activity logs with pagination
  const activities = await db.query.activityLogs.findMany({
    where: and(...conditions),
    limit: query.limit,
    offset: query.offset,
    orderBy: [desc(schema.activityLogs.createdAt)],
  })

  // Batch fetch user info for display
  const userIds = [...new Set(activities.map((a) => a.userId))]
  const userMap = new Map<string, { name: string | null; email: string }>()

  if (userIds.length > 0) {
    const users = await db.query.user.findMany({
      where: inArray(schema.user.id, userIds),
      columns: { id: true, name: true, email: true },
    })
    users.forEach((user) => {
      userMap.set(user.id, { name: user.name, email: user.email })
    })
  }

  // Enrich activities with user info
  const enrichedActivities = activities.map((activity) => ({
    ...activity,
    userName: userMap.get(activity.userId)?.name || null,
    userEmail: userMap.get(activity.userId)?.email || null,
  }))

  return c.json({
    activities: enrichedActivities,
    count: activities.length,
    hasMore: activities.length === query.limit,
  })
})

/**
 * GET /api/activity/entity/:entityType/:entityId
 * Get activity history for a specific entity
 */
app.get(
  '/entity/:entityType/:entityId',
  zValidator(
    'query',
    z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
    })
  ),
  async (c) => {
    const userId = c.get('userId')
    const entityType = c.req.param('entityType')
    const entityId = c.req.param('entityId')
    const query = c.req.valid('query')
    const db = drizzle(c.env.DB, { schema })

    // Fetch activity logs for this entity
    const activities = await db.query.activityLogs.findMany({
      where: and(
        eq(schema.activityLogs.userId, userId),
        eq(schema.activityLogs.entityType, entityType),
        eq(schema.activityLogs.entityId, entityId)
      ),
      limit: query.limit,
      orderBy: [desc(schema.activityLogs.createdAt)],
    })

    return c.json({ activities })
  }
)

/**
 * GET /api/activity/recent
 * Get most recent activities across all entities
 */
app.get('/recent', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  // Fetch 10 most recent activities
  const activities = await db.query.activityLogs.findMany({
    where: eq(schema.activityLogs.userId, userId),
    limit: 10,
    orderBy: [desc(schema.activityLogs.createdAt)],
  })

  return c.json({ activities })
})

/**
 * GET /api/activity/stats
 * Get activity statistics for the current user
 *
 * Optimized: Uses SQL aggregation instead of loading all records into memory
 */
app.get('/stats', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  // Calculate date boundaries
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Run all aggregation queries in parallel for efficiency
  const [entityTypeStats, actionStats, totalResult, todayResult, weekResult] = await Promise.all([
    // Group by entity type
    db
      .select({
        entityType: schema.activityLogs.entityType,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.activityLogs)
      .where(eq(schema.activityLogs.userId, userId))
      .groupBy(schema.activityLogs.entityType),

    // Group by action
    db
      .select({
        action: schema.activityLogs.action,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.activityLogs)
      .where(eq(schema.activityLogs.userId, userId))
      .groupBy(schema.activityLogs.action),

    // Total count
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.activityLogs)
      .where(eq(schema.activityLogs.userId, userId)),

    // Today's count
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.activityLogs)
      .where(
        and(eq(schema.activityLogs.userId, userId), gte(schema.activityLogs.createdAt, todayStart))
      ),

    // This week's count
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.activityLogs)
      .where(
        and(eq(schema.activityLogs.userId, userId), gte(schema.activityLogs.createdAt, weekStart))
      ),
  ])

  // Transform grouped results into record objects
  const byEntityType: Record<string, number> = {}
  for (const row of entityTypeStats) {
    byEntityType[row.entityType] = Number(row.count)
  }

  const byAction: Record<string, number> = {}
  for (const row of actionStats) {
    byAction[row.action] = Number(row.count)
  }

  return c.json({
    total: Number(totalResult[0]?.count ?? 0),
    today: Number(todayResult[0]?.count ?? 0),
    thisWeek: Number(weekResult[0]?.count ?? 0),
    byEntityType,
    byAction,
  })
})

export default app
