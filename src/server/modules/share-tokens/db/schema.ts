/**
 * share_tokens — public read-only links to app records (#62(4))
 *
 * A share token turns one record into an unauthenticated `/share/:token`
 * page: status pages, shared wiki docs, board snapshots, client-facing
 * report links. Polymorphic like comments/watchers — (entityType,
 * entityId) — with per-type payload shaping via the resolver registry
 * (../resolvers.ts), so adding "share a knowledge doc" is one registry
 * entry, not a new table.
 *
 * Security model mirrors api-tokens: the URL carries the raw token, the
 * DB stores only its SHA-256 hash, so a database read can't reconstruct
 * live links. Revocation is a soft flag (revokedAt) — rows stay for
 * audit. Unknown, expired, and revoked tokens are indistinguishable to
 * the public endpoint (uniform 404).
 */
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const shareTokens = sqliteTable(
  'share_tokens',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Creator — manages (lists/revokes) their own links in every tenancy mode. */
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Resolver key — 'entity' ships; forks register more. */
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    /** SHA-256 hex of the raw token (raw value is shown once at creation). */
    tokenHash: text('token_hash').notNull(),
    /** Reserved for future write-ish grants; only 'view' is issued today. */
    permissions: text('permissions').notNull().default('view'),
    /** Epoch seconds; NULL = never expires. */
    expiresAt: integer('expires_at'),
    revokedAt: integer('revoked_at'),
    accessCount: integer('access_count').notNull().default(0),
    lastAccessedAt: integer('last_accessed_at'),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    uniqueIndex('share_tokens_hash_uq').on(table.tokenHash),
    index('share_tokens_user_idx').on(table.userId),
    index('share_tokens_entity_idx').on(table.entityType, table.entityId),
  ]
)

export type ShareToken = typeof shareTokens.$inferSelect
