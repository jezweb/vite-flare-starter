/**
 * Central schema export file
 *
 * All Drizzle table schemas from modules are exported here.
 * This ensures Drizzle Kit can find all tables for migration generation.
 */

// Auth module schemas
export { user, session, account, verification } from '@/server/modules/auth/db/schema'

// API Tokens module schemas
export { apiTokens } from '@/server/modules/api-tokens/db/schema'

// Organization module schemas
export { organizationSettings } from '@/server/modules/organization/db/schema'
