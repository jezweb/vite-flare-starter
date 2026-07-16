/**
 * mirror — reference pattern for keeping an external dataset current in D1.
 *
 * One generic table: rows are whatever `source.ts` returns, keyed by the
 * source system's own id. `syncedAt` makes freshness visible per record
 * (and MAX(synced_at) per dataset) — the whole point of a mirror is that
 * you can SEE how stale it is.
 *
 * Deliberately NOT user-scoped: reference data (pricing, catalogues,
 * lookup tables) is app-level, read by every user and by agent tools.
 * If your fork mirrors per-tenant data, add userId/orgId and scope reads
 * with `scopeUser` like every other module.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const mirrorRecords = sqliteTable(
  'mirror_records',
  {
    /** Natural key from the source system (country code, SKU, model id…). */
    externalId: text('external_id').primaryKey(),
    /** Display name — required so list views always have something. */
    name: text('name').notNull(),
    /** Full source record as JSON — schema-on-read, same as entities.fields. */
    payload: text('payload').notNull().default('{}'),
    /** Unix seconds of the last successful sync touch for THIS row. */
    syncedAt: integer('synced_at').notNull(),
  },
  (table) => [index('mirror_records_synced_at_idx').on(table.syncedAt)]
)
