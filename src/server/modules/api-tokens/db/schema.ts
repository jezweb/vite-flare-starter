import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

/**
 * API Tokens schema for external API access
 *
 * Enables Bearer token authentication for external services
 * like ElevenLabs agents, Zapier, or custom integrations.
 */

export const apiTokens = sqliteTable('apiTokens', {
  // Primary key
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Foreign key for multi-tenancy
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  // Token data
  name: text('name').notNull(), // User-friendly name like "ElevenLabs Agent"
  token: text('token').notNull().unique(), // The actual bearer token (hashed)
  tokenPrefix: text('tokenPrefix').notNull(), // First 8 chars for display (e.g., "vfs_abc1...")
  scopes: text('scopes').notNull().default(''), // Comma-separated list of scopes (e.g., "profile:read,chat:write")
  lastUsedAt: integer('lastUsedAt', { mode: 'timestamp' }),

  // Optional expiration
  expiresAt: integer('expiresAt', { mode: 'timestamp' }),

  // Audit timestamps
  createdAt: integer('createdAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  // Index for fast token lookups
  tokenIdx: index('apiTokens_token_idx').on(table.token),
  // Index for user queries
  userIdx: index('apiTokens_userId_idx').on(table.userId),
}))

// Type exports
export type ApiToken = typeof apiTokens.$inferSelect
export type NewApiToken = typeof apiTokens.$inferInsert
