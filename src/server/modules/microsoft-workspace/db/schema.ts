/**
 * Microsoft Workspace token schema — one row per user.
 *
 * Mirrors the Google Workspace pattern (`user_google_workspace_tokens`) so
 * forks can follow the same mental model for both identity providers:
 * separate table from `user_mcp_connections` because this is a native
 * Microsoft Graph integration (agent tools call Graph directly), not an
 * MCP server.
 *
 * Tokens stored AES-GCM encrypted via `TOKEN_ENCRYPTION_KEY`. Single row
 * per user — one consent covers all Microsoft Workspace features.
 */
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const microsoftWorkspaceTokens = sqliteTable('user_microsoft_workspace_tokens', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),

  /** Encrypted bearer for Microsoft Graph — short-lived (~1 hour). */
  accessToken: text('access_token').notNull(),
  /** Encrypted long-lived refresh token — swap for new access tokens. */
  refreshToken: text('refresh_token').notNull(),
  /** ISO 8601 expiry — consulted on every API call, refresh if within 5 min. */
  expiresAt: text('expires_at').notNull(),
  /** Space-separated list of granted scopes. */
  scope: text('scope').notNull(),
  /** Microsoft account (UPN) — shown in UI as "Connected as x@y.com". */
  microsoftEmail: text('microsoft_email'),
  /** Tenant id from the id_token — helps route to single-tenant vs /common. */
  tenantId: text('tenant_id'),

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

export type MicrosoftWorkspaceToken = typeof microsoftWorkspaceTokens.$inferSelect
export type NewMicrosoftWorkspaceToken = typeof microsoftWorkspaceTokens.$inferInsert
