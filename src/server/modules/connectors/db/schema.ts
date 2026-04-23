/**
 * User connector settings — per-user, per-provider tool enablement.
 *
 * Lets a user disable a whole provider (without disconnecting OAuth —
 * tokens stay so they can re-enable instantly) OR disable specific tools
 * within a provider. Default when no row exists = all tools from that
 * provider are enabled. That preserves the pre-registry behaviour.
 *
 * See `.jez/artifacts/connector-scaling-plan-2026-04-23.md` for the
 * broader design doc this table supports.
 */
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const userConnectorSettings = sqliteTable(
  'user_connector_settings',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    /** Stable connector id (e.g. 'google-workspace', 'slack'). */
    connectorId: text('connector_id').notNull(),

    /**
     * Master switch for this provider. When `false`, ALL tools from this
     * provider are filtered out of the agent toolkit — zero context cost.
     */
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

    /**
     * JSON array of tool names (e.g. `["outlook_search", "outlook_send"]`).
     * If `null`, the provider's `defaultEnabledTools` set is used. When
     * serialised as null the server applies defaults on read — cheap way
     * to say "user hasn't customised this".
     */
    enabledToolsJson: text('enabled_tools_json'),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('user_connector_settings_user_connector_uidx').on(
      table.userId,
      table.connectorId,
    ),
  ],
)

export type UserConnectorSetting = typeof userConnectorSettings.$inferSelect
export type NewUserConnectorSetting = typeof userConnectorSettings.$inferInsert
