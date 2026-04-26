/**
 * entities — generic typed entity store for CRM / Atlassian-style apps
 *
 * One table, many entity types. Discriminated by `type`; type-specific
 * data in the `fields` JSON blob. Schema-on-read keeps cross-type
 * queries (sum of all entities by type, recent activity across types)
 * trivial without per-type table proliferation.
 *
 * When to evolve out of this:
 *   - A type grows past ~10 indexed fields you're regularly filtering on
 *   - You need foreign-key relationships between entity rows (e.g.
 *     deal.contactId → contacts.id)
 *   - JSON-field SQL filtering hurts perf at scale
 * → fork into typed tables for that entity type, migrate existing rows.
 *
 * The `entities` table is a starting point — a flexible scaffold for
 * the first 80% of CRM/Atlassian/PM functionality without writing a
 * new table per concept.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const entities = sqliteTable(
  'entities',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    /** Optional organisation scoping. NULL = personal entity (default).
     *  When set, the entity belongs to an org and access is gated by
     *  org membership rather than (or alongside) userId ownership.
     *  Forks adopt this incrementally — keep userId as creator,
     *  add orgId when sharing matters. */
    organizationId: text('organization_id'),
    /** Type discriminator — caller-defined, no enum constraint. */
    type: text('type').notNull(),
    /** External system id (Stripe customer, Jira issue, GitHub PR). */
    externalId: text('external_id'),
    /** Display title — required so list views always have something. */
    title: text('title').notNull(),
    /** Workflow state. Caller-defined string; no enum so forks add states freely. */
    status: text('status').notNull().default('open'),
    /** Optional assignee (FK to user). */
    assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
    /** Type-specific fields as JSON string. */
    fields: text('fields').notNull().default('{}'),
    createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
    updatedAt: integer('updated_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index('entities_user_id_idx').on(table.userId),
    index('entities_user_type_idx').on(table.userId, table.type),
    index('entities_user_type_status_idx').on(table.userId, table.type, table.status),
    index('entities_external_id_idx').on(table.externalId),
    index('entities_assignee_idx').on(table.assigneeId),
    index('entities_updated_at_idx').on(table.updatedAt),
    index('entities_org_idx').on(table.organizationId),
  ],
)

export type Entity = typeof entities.$inferSelect
export type NewEntity = typeof entities.$inferInsert
