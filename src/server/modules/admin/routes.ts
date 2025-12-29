/**
 * Admin API Routes
 *
 * All routes require authentication and admin role.
 * Provides user management, stats, and admin status endpoints.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, like, or, desc, asc, count, and, gt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { authMiddleware } from '@/server/middleware/auth'
import { adminMiddleware, type AdminContext } from '@/server/middleware/admin'
import * as schema from '@/server/db/schema'
import {
  updateUserSchema,
  userListQuerySchema,
  type UserResponse,
  type UserListResponse,
  type AdminStatsResponse,
  type AdminStatusResponse,
} from '@/shared/schemas/admin.schema'

const app = new Hono<AdminContext>()

/**
 * Helper to check if an email is in the admin list
 */
function isAdminEmail(email: string, adminEmailsEnv: string | undefined): boolean {
  const adminEmails = (adminEmailsEnv || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)
  return adminEmails.includes(email.toLowerCase())
}

/**
 * Escape special characters in LIKE patterns to prevent pattern injection
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

// =============================================================================
// Public admin status check (only requires auth, not admin)
// =============================================================================

/**
 * GET /status - Check if current user is admin
 * Returns { isAdmin: boolean } without 403 error for non-admins
 */
app.get('/status', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const user = c.get('user')
  const db = drizzle(c.env.DB, { schema })

  // Parse admin emails from environment
  const adminEmails = (c.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0)

  // Get current role from database
  const dbUser = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { role: true, email: true },
  })

  const userEmail = dbUser?.email?.toLowerCase() || ''
  const isAdminByEmail = adminEmails.includes(userEmail)
  const isAdmin = isAdminByEmail || dbUser?.role === 'admin'

  const response: AdminStatusResponse = {
    isAdmin,
    role: (dbUser?.role as 'user' | 'manager' | 'admin') || 'user',
    email: user.email,
  }

  return c.json(response)
})

// =============================================================================
// Protected admin routes (require admin role)
// =============================================================================

// Create a sub-router for admin-only routes
const adminRoutes = new Hono<AdminContext>()

// Apply auth and admin middleware to all protected routes
adminRoutes.use('*', authMiddleware)
adminRoutes.use('*', adminMiddleware)

/**
 * GET /stats - Get admin dashboard statistics
 */
adminRoutes.get('/stats', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()

  // Total users
  const [totalResult] = await db.select({ count: count() }).from(schema.user)
  const totalUsers = totalResult?.count || 0

  // Active sessions (not expired)
  const [sessionsResult] = await db
    .select({ count: count() })
    .from(schema.session)
    .where(gt(schema.session.expiresAt, now))
  const activeSessionsCount = sessionsResult?.count || 0

  // Users created in last 7 days
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [last7Result] = await db
    .select({ count: count() })
    .from(schema.user)
    .where(gt(schema.user.createdAt, sevenDaysAgo))
  const usersCreatedLast7Days = last7Result?.count || 0

  // Users created in last 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const [last30Result] = await db
    .select({ count: count() })
    .from(schema.user)
    .where(gt(schema.user.createdAt, thirtyDaysAgo))
  const usersCreatedLast30Days = last30Result?.count || 0

  const response: AdminStatsResponse = {
    totalUsers,
    activeSessionsCount,
    usersCreatedLast7Days,
    usersCreatedLast30Days,
  }

  return c.json(response)
})

/**
 * GET /users - List all users with pagination and search
 */
adminRoutes.get('/users', zValidator('query', userListQuerySchema), async (c) => {
  const { page, limit, search, sortBy, sortOrder } = c.req.valid('query')
  const db = drizzle(c.env.DB, { schema })

  // Build where clause for search (escape LIKE special chars to prevent pattern injection)
  const searchCondition = search
    ? or(
        like(schema.user.name, `%${escapeLikePattern(search)}%`),
        like(schema.user.email, `%${escapeLikePattern(search)}%`)
      )
    : undefined

  // Get total count
  const countResult = await db.select({ total: count() }).from(schema.user).where(searchCondition)
  const total = countResult[0]?.total ?? 0

  // Build order by clause
  const orderByColumn =
    sortBy === 'name' ? schema.user.name : sortBy === 'email' ? schema.user.email : schema.user.createdAt

  const orderByClause = sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn)

  // Get paginated users
  const users = await db
    .select()
    .from(schema.user)
    .where(searchCondition)
    .orderBy(orderByClause)
    .limit(limit)
    .offset((page - 1) * limit)

  // Get session counts for each user
  const now = new Date()
  const sessionCounts: Record<string, number> = {}
  const lastActiveTimes: Record<string, Date | null> = {}

  if (users.length > 0) {
    // Get all active sessions
    const sessions = await db
      .select({
        userId: schema.session.userId,
        expiresAt: schema.session.expiresAt,
        updatedAt: schema.session.updatedAt,
      })
      .from(schema.session)
      .where(gt(schema.session.expiresAt, now))

    // Aggregate session data
    for (const session of sessions) {
      if (users.some((u) => u.id === session.userId)) {
        sessionCounts[session.userId] = (sessionCounts[session.userId] || 0) + 1
        const lastActive = lastActiveTimes[session.userId]
        if (!lastActive || (session.updatedAt && session.updatedAt > lastActive)) {
          lastActiveTimes[session.userId] = session.updatedAt
        }
      }
    }
  }

  // Map users to response format
  const usersResponse: UserResponse[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    role: user.role as 'user' | 'manager' | 'admin',
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    sessionCount: sessionCounts[user.id] || 0,
    lastActiveAt: lastActiveTimes[user.id]?.toISOString() || null,
    isAdmin: user.role === 'admin' || isAdminEmail(user.email, c.env.ADMIN_EMAILS),
  }))

  const response: UserListResponse = {
    users: usersResponse,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }

  return c.json(response)
})

/**
 * GET /users/:id - Get a single user's details
 */
adminRoutes.get('/users/:id', async (c) => {
  const id = c.req.param('id')
  const db = drizzle(c.env.DB, { schema })

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, id),
  })

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  // Get active session count
  const now = new Date()
  const [sessionResult] = await db
    .select({ count: count() })
    .from(schema.session)
    .where(and(eq(schema.session.userId, id), gt(schema.session.expiresAt, now)))

  // Get last active session
  const lastSession = await db
    .select({ updatedAt: schema.session.updatedAt })
    .from(schema.session)
    .where(eq(schema.session.userId, id))
    .orderBy(desc(schema.session.updatedAt))
    .limit(1)

  const response: UserResponse = {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    role: user.role as 'user' | 'manager' | 'admin',
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    sessionCount: sessionResult?.count || 0,
    lastActiveAt: lastSession[0]?.updatedAt?.toISOString() || null,
    isAdmin: user.role === 'admin' || isAdminEmail(user.email, c.env.ADMIN_EMAILS),
  }

  return c.json({ user: response })
})

/**
 * PATCH /users/:id - Update a user
 */
adminRoutes.patch('/users/:id', zValidator('json', updateUserSchema), async (c) => {
  const id = c.req.param('id')
  const input = c.req.valid('json')
  const db = drizzle(c.env.DB, { schema })
  const currentUser = c.get('user')

  // Prevent admins from modifying their own account through admin panel
  if (id === currentUser.id) {
    return c.json({ error: 'Cannot modify your own account through admin panel. Use Settings instead.' }, 400)
  }

  // Check if user exists
  const existingUser = await db.query.user.findFirst({
    where: eq(schema.user.id, id),
  })

  if (!existingUser) {
    return c.json({ error: 'User not found' }, 404)
  }

  // Prevent modifying other admins
  if (isAdminEmail(existingUser.email, c.env.ADMIN_EMAILS)) {
    return c.json({ error: 'Cannot modify another admin user' }, 403)
  }

  // If changing email, check for duplicates
  if (input.email && input.email !== existingUser.email) {
    const emailExists = await db.query.user.findFirst({
      where: eq(schema.user.email, input.email),
    })
    if (emailExists) {
      return c.json({ error: 'Email already in use' }, 409)
    }
  }

  // Update user
  const updated = await db
    .update(schema.user)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(schema.user.id, id))
    .returning()
    .get()

  const response: UserResponse = {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    emailVerified: updated.emailVerified,
    image: updated.image,
    role: updated.role as 'user' | 'manager' | 'admin',
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    sessionCount: 0,
    lastActiveAt: null,
    isAdmin: updated.role === 'admin' || isAdminEmail(updated.email, c.env.ADMIN_EMAILS),
  }

  return c.json({ user: response })
})

/**
 * DELETE /users/:id - Delete a user
 */
adminRoutes.delete('/users/:id', async (c) => {
  const id = c.req.param('id')
  const db = drizzle(c.env.DB, { schema })
  const currentUser = c.get('user')

  // Prevent admin from deleting themselves
  if (id === currentUser.id) {
    return c.json({ error: 'Cannot delete your own account through admin panel' }, 400)
  }

  // Check if user exists
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, id),
  })

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  // Prevent deleting other admins
  if (isAdminEmail(user.email, c.env.ADMIN_EMAILS)) {
    return c.json({ error: 'Cannot delete another admin user' }, 403)
  }

  // Delete user (cascade will handle sessions, accounts, etc.)
  await db.delete(schema.user).where(eq(schema.user.id, id))

  return c.json({ success: true })
})

/**
 * POST /users/:id/revoke - Revoke all sessions for a user
 */
adminRoutes.post('/users/:id/revoke', async (c) => {
  const id = c.req.param('id')
  const db = drizzle(c.env.DB, { schema })
  const currentUser = c.get('user')

  // Prevent admin from revoking their own sessions here
  if (id === currentUser.id) {
    return c.json({ error: 'Cannot revoke your own sessions through admin panel' }, 400)
  }

  // Check if user exists
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, id),
  })

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  // Delete all sessions for this user
  await db.delete(schema.session).where(eq(schema.session.userId, id))

  return c.json({ success: true, message: 'All sessions revoked' })
})

// Mount admin routes under root
app.route('/', adminRoutes)

export default app
