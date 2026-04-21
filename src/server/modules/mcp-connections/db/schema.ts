/**
 * MCP connector schema — per-user MCP server connections + per-tool policies.
 *
 * Tokens are encrypted at rest via `encrypt()` in @/server/lib/crypto before
 * writing. Decrypted on read inside the connection provider.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const userMcpConnections = sqliteTable(
  'user_mcp_connections',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),

    /** Catalog entry id or `custom:<uuid>` for user-added servers. */
    connectorId: text('connector_id').notNull(),
    displayName: text('display_name').notNull(),
    /** MCP endpoint URL — the thing we open a transport to. */
    url: text('url').notNull(),
    transport: text('transport').notNull().default('http'),

    /** 'oauth' | 'bearer' | 'none' */
    authType: text('auth_type').notNull(),

    // Credentials — all encrypted at rest
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    /** ISO 8601 expiry for access token refresh scheduling. */
    expiresAt: text('expires_at'),
    scope: text('scope'),
    oauthClientId: text('oauth_client_id'),
    oauthClientSecret: text('oauth_client_secret'),

    // Discovered OAuth metadata (from /.well-known/oauth-authorization-server)
    authServerUrl: text('auth_server_url'),
    tokenEndpoint: text('token_endpoint'),
    authorizationEndpoint: text('authorization_endpoint'),
    registrationEndpoint: text('registration_endpoint'),

    /** 'active' | 'error' | 'revoked' | 'pending' */
    status: text('status').notNull().default('active'),
    lastError: text('last_error'),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),

    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('user_mcp_connections_user_idx').on(t.userId),
    uniqueIndex('user_mcp_connections_user_connector_url_idx').on(t.userId, t.connectorId, t.url),
  ],
)

export const userMcpToolPolicies = sqliteTable(
  'user_mcp_tool_policies',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => userMcpConnections.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    /** 'always' | 'ask' | 'never' */
    policy: text('policy').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('user_mcp_tool_policies_connection_tool_idx').on(t.connectionId, t.toolName),
  ],
)

export type UserMcpConnection = typeof userMcpConnections.$inferSelect
export type NewUserMcpConnection = typeof userMcpConnections.$inferInsert
export type UserMcpToolPolicy = typeof userMcpToolPolicies.$inferSelect
