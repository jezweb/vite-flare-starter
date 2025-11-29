import { z } from 'zod'

/**
 * Organization Settings Validation Schemas
 *
 * Used for API request validation and form handling
 */

/**
 * Schema for updating organization settings
 * All fields are optional (partial update)
 */
export const updateOrganizationSchema = z.object({
  // Business information
  businessName: z.string().max(200).nullable().optional(),
  businessEmail: z.string().email().max(254).nullable().optional(),
  businessPhone: z.string().max(50).nullable().optional(),
  businessWebsite: z.string().url().max(500).nullable().optional(),

  // Address
  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  postcode: z.string().max(20).nullable().optional(),
  country: z.string().max(100).nullable().optional(),

  // Timezone
  timezone: z.string().max(100).nullable().optional(),

  // Tax information
  abn: z.string().max(20).nullable().optional(),
  taxId: z.string().max(50).nullable().optional(),
})

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

/**
 * Full organization settings response
 */
export const organizationSettingsSchema = z.object({
  id: z.string(),
  userId: z.string(),
  businessName: z.string().nullable(),
  businessEmail: z.string().nullable(),
  businessPhone: z.string().nullable(),
  businessWebsite: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postcode: z.string().nullable(),
  country: z.string().nullable(),
  timezone: z.string().nullable(),
  abn: z.string().nullable(),
  taxId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type OrganizationSettingsResponse = z.infer<typeof organizationSettingsSchema>
