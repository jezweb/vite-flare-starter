import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { UserPreferences } from '@/shared/schemas/preferences.schema'

/**
 * Better-auth database schema for Cloudflare D1
 *
 * Tables required by better-auth:
 * - user: User accounts
 * - session: Active sessions
 * - account: Social/OAuth accounts
 * - verification: Email verification tokens
 *
 * IMPORTANT: Column names must be camelCase (not snake_case)
 * better-auth expects: emailVerified, createdAt, updatedAt, etc.
 */

// User table
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull().$defaultFn(() => ''),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  preferences: text('preferences', { mode: 'json' })
    .$type<UserPreferences>()
    .$defaultFn(() => ({ theme: 'default', mode: 'system' })),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// Session table
export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// Account table (for OAuth/social logins)
export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }), // Legacy field, kept for compatibility
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'), // Hashed password for email/password auth
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // CRITICAL: Unique constraint required by Better Auth for OAuth account linking
  providerAccountIdx: uniqueIndex('account_provider_account_idx').on(table.providerId, table.accountId),
}))

// Verification table (for email verification, password reset, etc.)
export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(), // Email address or user ID
  value: text('value').notNull(), // Verification token
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// Type exports for use in application code
export type User = typeof user.$inferSelect
export type NewUser = typeof user.$inferInsert
export type Session = typeof session.$inferSelect
export type NewSession = typeof session.$inferInsert
export type Account = typeof account.$inferSelect
export type NewAccount = typeof account.$inferInsert
export type Verification = typeof verification.$inferSelect
export type NewVerification = typeof verification.$inferInsert
