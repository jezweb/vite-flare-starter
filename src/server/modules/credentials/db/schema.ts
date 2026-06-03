/**
 * service_credentials — BYOK keys for AI providers + scraping/search
 *
 * Per-user (or per-org) keys that override the operator's env-supplied
 * defaults. Encrypted at rest with the same envelope used for MCP
 * connector tokens (`src/server/lib/crypto.ts`).
 *
 * Resolution: getServiceKey(env, userId, orgId, provider) checks
 * user-credential → org-credential → env-fallback → null.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export type CredentialStatus = 'active' | 'revoked'

export const serviceCredentials = sqliteTable(
  'service_credentials',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id'),
    /** Provider id (e.g. 'anthropic', 'openrouter', 'serper', 'firecrawl'). */
    provider: text('provider').notNull(),
    /** Friendly label so users can store multiple keys per provider. */
    label: text('label').notNull().default('default'),
    /** AES-GCM encrypted base64url envelope. */
    encryptedValue: text('encrypted_value').notNull(),
    status: text('status').$type<CredentialStatus>().notNull().default('active'),
    /** Last 4 chars for UI display. Not sensitive on its own. */
    lastFour: text('last_four'),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
    updatedAt: integer('updated_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index('service_creds_user_idx').on(table.userId),
    index('service_creds_org_idx').on(table.organizationId),
  ]
)
