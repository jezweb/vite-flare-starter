import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { UserPreferences } from '@/shared/schemas/preferences.schema'
import { isoTimestamp } from './types'

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
  role: text('role', { enum: ['user', 'manager', 'admin'] }).notNull().default('user'),
  preferences: text('preferences', { mode: 'json' })
    .$type<UserPreferences>()
    .$defaultFn(() => ({ theme: 'default', mode: 'system' })),
  /**
   * Memory update trust mode for user-scope memories (Phase 3 / Extension E).
   * Default 'auto' — the AI's memory updates apply automatically. Users
   * who want diff-review can flip to 'ask' from Settings → Memory.
   * Stored on the user table (better-auth requires camelCase column names).
   */
  memoryUpdateMode: text('memoryUpdateMode', { enum: ['ask', 'auto', 'never'] }).notNull().default('auto'),
  /**
   * Last login method used by this user — written by better-auth's
   * `lastLoginMethod()` plugin's `databaseHooks.user.create.before` hook
   * on real OAuth callbacks. Nullable: legacy users created before the
   * column existed will have NULL until their next sign-in.
   *
   * Missing this column was the root cause of issue #67 — OAuth INSERT
   * silently failed and the adapter returned null, surfacing as the
   * opaque "unable_to_create_user" error. Test-auth doesn't trip the
   * plugin's before-hook (no request context), so headless tests pass
   * even when production OAuth is broken.
   */
  lastLoginMethod: text('lastLoginMethod'),
  createdAt: isoTimestamp('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt: isoTimestamp('updatedAt').notNull().$defaultFn(() => new Date()),
})

// Session table
export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: isoTimestamp('expiresAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  createdAt: isoTimestamp('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt: isoTimestamp('updatedAt').notNull().$defaultFn(() => new Date()),
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
  expiresAt: isoTimestamp('expiresAt'), // Legacy field, kept for compatibility
  accessTokenExpiresAt: isoTimestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: isoTimestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'), // Hashed password for email/password auth
  createdAt: isoTimestamp('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt: isoTimestamp('updatedAt').notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // CRITICAL: Unique constraint required by Better Auth for OAuth account linking
  providerAccountIdx: uniqueIndex('account_provider_account_idx').on(table.providerId, table.accountId),
}))

// Verification table (for email verification, password reset, etc.)
export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(), // Email address or user ID
  value: text('value').notNull(), // Verification token
  expiresAt: isoTimestamp('expiresAt').notNull(),
  createdAt: isoTimestamp('createdAt').notNull().$defaultFn(() => new Date()),
  updatedAt: isoTimestamp('updatedAt').notNull().$defaultFn(() => new Date()),
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
