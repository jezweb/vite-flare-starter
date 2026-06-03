import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

/**
 * config_diff_proposals — staged user-configurable changes awaiting
 * review, plus an audit trail of applied + rejected ones.
 *
 * Created either by the user (via the Skills editor) or by the chat
 * agent (via the `propose_patch` tool). Apply flips status and calls
 * the per-kind handler in `apply.ts`.
 */
export const configDiffProposals = sqliteTable(
  'config_diff_proposals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    resourceKind: text('resource_kind', {
      enum: ['skill', 'system-prompt', 'setting', 'connector-tool-policy'],
    }).notNull(),
    resourceId: text('resource_id').notNull(),
    resourceLabel: text('resource_label').notNull(),
    before: text('before').notNull(),
    after: text('after').notNull(),
    summary: text('summary').notNull(),
    reason: text('reason'),
    format: text('format', { enum: ['markdown', 'json', 'yaml', 'plain'] })
      .notNull()
      .default('markdown'),
    createdByType: text('created_by_type', {
      enum: ['user', 'agent', 'ai-sparkle'],
    }).notNull(),
    createdByModel: text('created_by_model'),
    status: text('status', { enum: ['pending', 'applied', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('config_diff_user_idx').on(table.userId),
    index('config_diff_resource_idx').on(table.userId, table.resourceKind, table.resourceId),
    index('config_diff_status_idx').on(table.userId, table.status),
  ]
)
