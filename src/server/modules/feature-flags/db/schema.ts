/**
 * Feature Flags Database Schema
 *
 * Stores feature flags in the database for runtime toggling via admin UI.
 * CMS menu items can reference feature keys to auto-hide when disabled.
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { user } from '@/server/modules/auth/db/schema'

/**
 * Feature flag categories for grouping in admin UI
 */
export const FEATURE_FLAG_CATEGORIES = [
  'core',
  'crm',
  'communication',
  'content',
  'development',
] as const

export type FeatureFlagCategory = (typeof FEATURE_FLAG_CATEGORIES)[number]

/**
 * Feature Flags Table
 *
 * Primary key is the feature key (e.g., 'tasks', 'contacts', 'sms')
 * which matches the keys in the legacy features.ts config.
 */
export const featureFlags = sqliteTable(
  'feature_flags',
  {
    // Primary key - the feature key
    key: text('key').primaryKey(), // e.g., 'tasks', 'contacts', 'sms'

    // Display information
    name: text('name').notNull(), // Human-readable: "Tasks Module"
    description: text('description'), // "CRM-native task management"
    category: text('category', { enum: FEATURE_FLAG_CATEGORIES }).notNull().default('core'),

    // State
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

    // UI hints (for reference in admin)
    icon: text('icon'), // Lucide icon name: "CheckSquare"
    menuPath: text('menuPath'), // Dashboard path: "/dashboard/tasks"

    // Ordering for admin UI
    sortOrder: integer('sortOrder').notNull().default(0),

    // Audit
    updatedBy: text('updatedBy').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    categoryIdx: index('idx_feature_flags_category').on(table.category),
    enabledIdx: index('idx_feature_flags_enabled').on(table.enabled),
  })
)

/**
 * Relations
 */
export const featureFlagsRelations = relations(featureFlags, ({ one }) => ({
  updater: one(user, {
    fields: [featureFlags.updatedBy],
    references: [user.id],
  }),
}))

/**
 * Type exports
 */
export type FeatureFlag = typeof featureFlags.$inferSelect
export type NewFeatureFlag = typeof featureFlags.$inferInsert
