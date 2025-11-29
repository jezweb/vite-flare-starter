/**
 * Organization Settings Schema
 *
 * Stores business/organization information for each user.
 * This is user-scoped (each user has their own organization settings).
 * Useful for:
 * - Business timezone (default for contacts without timezone)
 * - Business contact details (for invoices, reports, AI context)
 * - Business branding/name
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const organizationSettings = sqliteTable('organization_settings', {
  // Primary key
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Owner (one organization per user for now)
  userId: text('userId')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),

  // Business information
  businessName: text('businessName'),
  businessEmail: text('businessEmail'),
  businessPhone: text('businessPhone'),
  businessWebsite: text('businessWebsite'),

  // Address
  addressLine1: text('addressLine1'),
  addressLine2: text('addressLine2'),
  city: text('city'),
  state: text('state'),
  postcode: text('postcode'),
  country: text('country'),

  // Timezone (IANA format, e.g., 'Australia/Sydney')
  // This is the "business timezone" - used as default when contact timezone is unknown
  timezone: text('timezone'),

  // Tax/ABN (for Australian businesses)
  abn: text('abn'),
  taxId: text('taxId'),

  // Audit timestamps
  createdAt: integer('createdAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// Type exports
export type OrganizationSettings = typeof organizationSettings.$inferSelect
export type NewOrganizationSettings = typeof organizationSettings.$inferInsert
