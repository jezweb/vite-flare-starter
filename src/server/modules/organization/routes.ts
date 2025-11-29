/**
 * Organization Settings API Routes
 *
 * Endpoints:
 * - GET /api/organization - Get organization settings
 * - PATCH /api/organization - Update organization settings
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import * as schema from '@/server/db/schema'
import { updateOrganizationSchema } from '@/shared/schemas/organization.schema'

const app = new Hono<AuthContext>()

// Apply auth middleware to all routes
app.use('/*', authMiddleware)

/**
 * GET /api/organization
 * Get organization settings for the current user
 *
 * Returns existing settings or creates default empty settings if none exist
 */
app.get('/', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  try {
    // Try to find existing settings
    let settings = await db.query.organizationSettings.findFirst({
      where: eq(schema.organizationSettings.userId, userId),
    })

    // If no settings exist, create default empty settings
    if (!settings) {
      settings = await db
        .insert(schema.organizationSettings)
        .values({
          userId,
        })
        .returning()
        .get()
    }

    return c.json({ organization: settings })
  } catch (error) {
    console.error('Get organization settings error:', error)
    return c.json({ error: 'Failed to fetch organization settings' }, 500)
  }
})

/**
 * PATCH /api/organization
 * Update organization settings
 *
 * Creates settings if they don't exist (upsert pattern)
 */
app.patch('/', zValidator('json', updateOrganizationSchema), async (c) => {
  const userId = c.get('userId')
  const input = c.req.valid('json')
  const db = drizzle(c.env.DB, { schema })

  try {
    // Check if settings exist
    const existing = await db.query.organizationSettings.findFirst({
      where: eq(schema.organizationSettings.userId, userId),
    })

    let settings

    if (existing) {
      // Update existing settings
      settings = await db
        .update(schema.organizationSettings)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(schema.organizationSettings.userId, userId))
        .returning()
        .get()
    } else {
      // Create new settings with provided values
      settings = await db
        .insert(schema.organizationSettings)
        .values({
          userId,
          ...input,
        })
        .returning()
        .get()
    }

    return c.json({
      message: 'Organization settings updated successfully',
      organization: settings,
    })
  } catch (error) {
    console.error('Update organization settings error:', error)
    return c.json({ error: 'Failed to update organization settings' }, 500)
  }
})

export default app
