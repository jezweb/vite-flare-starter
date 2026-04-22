/**
 * Google Workspace token schema — one row per user.
 *
 * Stores refresh + access tokens encrypted via AES-GCM (`TOKEN_ENCRYPTION_KEY`).
 * Separate from `user_mcp_connections` because Google Workspace is a native
 * agent-tools integration, not an MCP server. Single row per user keeps the
 * model simple — one consent covers all Google Workspace features in this
 * starter. Forkers who want per-service toggles can extend with a scope-set
 * selection flow.
 */
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const googleWorkspaceTokens = sqliteTable('user_google_workspace_tokens', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),

  /** Encrypted bearer for Google APIs — short-lived (~1 hour). */
  accessToken: text('access_token').notNull(),
  /** Encrypted long-lived refresh token — swap for new access tokens. */
  refreshToken: text('refresh_token').notNull(),
  /** ISO 8601 expiry — consulted on every API call, refresh if within 5 min. */
  expiresAt: text('expires_at').notNull(),
  /** Space-separated list of granted scopes (e.g. `gmail.send drive.file`). */
  scope: text('scope').notNull(),
  /** Google account email — shown in UI as "Connected as x@y.com". */
  googleEmail: text('google_email'),

  /** 'active' | 'error' — when refresh fails, status goes error + lastError set. */
  status: text('status').notNull().default('active'),
  lastError: text('last_error'),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export type GoogleWorkspaceToken = typeof googleWorkspaceTokens.$inferSelect
export type NewGoogleWorkspaceToken = typeof googleWorkspaceTokens.$inferInsert
