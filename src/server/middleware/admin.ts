import { createMiddleware } from 'hono/factory'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { Env } from '../index'
import * as schema from '@/server/db/schema'

/**
 * Admin middleware for protecting admin-only routes
 *
 * IMPORTANT: Must be used AFTER authMiddleware (requires userId to be set)
 *
 * How it works:
 * 1. Checks if user's email is in ADMIN_EMAILS env var
 * 2. Auto-promotes matching users to admin role in DB
 * 3. Returns 403 if user is not an admin
 *
 * Works with both session and API token authentication.
 */

// Extend context with admin user info
export type AdminContext = {
  Bindings: Env
  Variables: {
    userId: string
    user: {
      id: string
      email: string
      name: string
      image?: string | null
      role: 'user' | 'manager' | 'admin'
    }
    authMethod: 'session' | 'api-token'
  }
}

export const adminMiddleware = createMiddleware<AdminContext>(async (c, next) => {
  const user = c.get('user')
  const userId = c.get('userId')

  // Ensure authMiddleware ran first
  if (!user || !userId) {
    return c.json({ error: 'Unauthorized - Auth required' }, 401)
  }

  const db = drizzle(c.env.DB, { schema })

  // Parse admin emails from environment
  const adminEmails = (c.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0)

  // Check if user email is in admin list
  const isAdminEmail = adminEmails.includes(user.email.toLowerCase())

  // Get current user role from database
  const dbUser = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { role: true },
  })

  const currentRole = dbUser?.role || 'user'

  // Auto-promote if email matches and not already admin
  if (isAdminEmail && currentRole !== 'admin') {
    await db
      .update(schema.user)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(eq(schema.user.id, userId))
  }

  // Check authorization - user must be admin by email or DB role
  const isAdmin = isAdminEmail || currentRole === 'admin'

  if (!isAdmin) {
    return c.json({ error: 'Forbidden - Admin access required' }, 403)
  }

  // Update context with role
  c.set('user', { ...user, role: 'admin' })

  await next()
})
