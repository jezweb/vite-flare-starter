/**
 * Feature Flags Validation Schemas
 */

import { z } from 'zod'

/**
 * Feature flag categories
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
 * Schema for toggling a feature flag
 */
export const toggleFeatureSchema = z.object({
  enabled: z.boolean(),
})

/**
 * Schema for creating/updating a feature flag
 */
export const upsertFeatureSchema = z.object({
  key: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.enum(FEATURE_FLAG_CATEGORIES).default('core'),
  enabled: z.boolean().default(true),
  icon: z.string().max(50).optional(),
  menuPath: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
})

export type ToggleFeatureInput = z.infer<typeof toggleFeatureSchema>
export type UpsertFeatureInput = z.infer<typeof upsertFeatureSchema>
