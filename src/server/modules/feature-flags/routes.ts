/**
 * Feature Flags API Routes
 *
 * Public endpoint for menu filtering (no auth required).
 * Admin endpoints for feature management (auth required).
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import * as schema from '@/server/db/schema'
import {
  toggleFeatureSchema,
  upsertFeatureSchema,
  FEATURE_FLAG_CATEGORIES,
} from '@/shared/schemas/feature-flags.schema'
import type { Env } from '@/server/index'

type PublicContext = {
  Bindings: Env
}

/**
 * Public Features API (no auth)
 * Used by frontend to filter menus based on enabled features
 */
const publicApp = new Hono<PublicContext>()

// GET /api/features - Get all enabled features as a simple map
publicApp.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })

  const flags = await db.query.featureFlags.findMany({
    columns: {
      key: true,
      enabled: true,
    },
  })

  // Convert to simple key -> boolean map
  const features: Record<string, boolean> = {}
  for (const flag of flags) {
    features[flag.key] = flag.enabled
  }

  return c.json({ features })
})

/**
 * Admin Features API (auth required)
 */
const adminApp = new Hono<AuthContext>()

// Apply auth middleware
adminApp.use('*', authMiddleware)

// GET /api/admin/feature-flags - List all features with metadata
adminApp.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })

  const features = await db.query.featureFlags.findMany({
    orderBy: (flags, { asc }) => [asc(flags.category), asc(flags.sortOrder)],
  })

  return c.json({ features })
})

// GET /api/admin/feature-flags/:key - Get single feature
adminApp.get('/:key', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const key = c.req.param('key')

  const feature = await db.query.featureFlags.findFirst({
    where: eq(schema.featureFlags.key, key),
  })

  if (!feature) {
    return c.json({ error: 'Feature not found' }, 404)
  }

  return c.json({ feature })
})

// PATCH /api/admin/feature-flags/:key - Toggle feature enabled state
adminApp.patch('/:key', zValidator('json', toggleFeatureSchema), async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const userId = c.get('userId')
  const key = c.req.param('key')
  const { enabled } = c.req.valid('json')

  // Check feature exists
  const existing = await db.query.featureFlags.findFirst({
    where: eq(schema.featureFlags.key, key),
  })

  if (!existing) {
    return c.json({ error: 'Feature not found' }, 404)
  }

  // Update the feature
  const updated = await db
    .update(schema.featureFlags)
    .set({
      enabled,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(schema.featureFlags.key, key))
    .returning()
    .get()

  return c.json({ feature: updated })
})

// POST /api/admin/feature-flags/sync - Sync features from default set
// Creates any missing features, doesn't overwrite existing
adminApp.post('/sync', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const userId = c.get('userId')

  // Default features to seed (simplified for starter kit)
  const defaultFeatures: Array<{
    key: string
    name: string
    description: string
    category: (typeof FEATURE_FLAG_CATEGORIES)[number]
    icon: string
    menuPath: string
    sortOrder: number
  }> = [
    // Core
    {
      key: 'styleGuide',
      name: 'Style Guide',
      description: 'UI component documentation',
      category: 'development',
      icon: 'Palette',
      menuPath: '/dashboard/style-guide',
      sortOrder: 0,
    },
    {
      key: 'components',
      name: 'Components',
      description: 'Component showcase',
      category: 'development',
      icon: 'Component',
      menuPath: '/dashboard/components',
      sortOrder: 1,
    },
    {
      key: 'apiTokens',
      name: 'API Tokens',
      description: 'API token management in settings',
      category: 'core',
      icon: 'Key',
      menuPath: '/dashboard/settings',
      sortOrder: 0,
    },
  ]

  // Get existing feature keys
  const existing = await db.query.featureFlags.findMany({
    columns: { key: true },
  })
  const existingKeys = new Set(existing.map((f) => f.key))

  // Insert missing features
  const toInsert = defaultFeatures.filter((f) => !existingKeys.has(f.key))

  if (toInsert.length === 0) {
    return c.json({ message: 'All features already exist', created: 0 })
  }

  const now = new Date()
  await db.insert(schema.featureFlags).values(
    toInsert.map((f) => ({
      ...f,
      enabled: true,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    }))
  )

  return c.json({
    message: `Created ${toInsert.length} feature(s)`,
    created: toInsert.length,
    features: toInsert.map((f) => f.key),
  })
})

// PUT /api/admin/feature-flags/:key - Create or update a feature (full update)
adminApp.put(
  '/:key',
  zValidator('json', upsertFeatureSchema.omit({ key: true })),
  async (c) => {
    const db = drizzle(c.env.DB, { schema })
    const userId = c.get('userId')
    const key = c.req.param('key')
    const input = c.req.valid('json')

    const now = new Date()

    // Check if exists
    const existing = await db.query.featureFlags.findFirst({
      where: eq(schema.featureFlags.key, key),
    })

    if (existing) {
      // Update
      const updated = await db
        .update(schema.featureFlags)
        .set({
          ...input,
          updatedBy: userId,
          updatedAt: now,
        })
        .where(eq(schema.featureFlags.key, key))
        .returning()
        .get()

      return c.json({ feature: updated })
    } else {
      // Create
      const created = await db
        .insert(schema.featureFlags)
        .values({
          key,
          ...input,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()

      return c.json({ feature: created }, 201)
    }
  }
)

// DELETE /api/admin/feature-flags/:key - Delete a feature
adminApp.delete('/:key', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const key = c.req.param('key')

  const deleted = await db
    .delete(schema.featureFlags)
    .where(eq(schema.featureFlags.key, key))
    .returning()
    .get()

  if (!deleted) {
    return c.json({ error: 'Feature not found' }, 404)
  }

  return c.json({ success: true })
})

export { publicApp as featuresPublicRoutes, adminApp as featuresAdminRoutes }
