/**
 * field_configs — user-definable field schemas for the entities module (#62(2))
 *
 * Turns the schema-on-read `entities.fields` JSON blob into something a
 * product can render forms against: each row declares one field of one
 * entity type (label, input type, options, required, order). The
 * `<DynamicFieldRenderer>` client component consumes a type's configs
 * and renders the right inputs with zero per-type form code;
 * `buildFieldsSchema()` (../validation.ts) turns the same configs into
 * a zod schema for server-side validation.
 *
 * Deliberately NOT a constraint on the entities table — entities keep
 * accepting arbitrary `fields` keys (agents and sync jobs write shapes
 * users never configured). Configs describe what the FORM shows, and
 * validation is opt-in per call site.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date', // ISO yyyy-mm-dd string
  'select',
  'multi_select', // string[]
  'checkbox', // boolean
  'url',
  'email',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

export const fieldConfigs = sqliteTable(
  'field_configs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Matches entities.type (same caller-defined discriminator). */
    entityType: text('entity_type').notNull(),
    /** Key inside the entities.fields JSON blob. */
    fieldName: text('field_name').notNull(),
    /** Human label the form renders. */
    label: text('label').notNull(),
    fieldType: text('field_type', { enum: FIELD_TYPES }).notNull(),
    /** JSON string[] of choices — select / multi_select only. */
    options: text('options'),
    required: integer('required', { mode: 'boolean' }).notNull().default(false),
    placeholder: text('placeholder'),
    helpText: text('help_text'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
    updatedAt: integer('updated_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index('field_configs_user_type_idx').on(table.userId, table.entityType),
    // One config per field name per type per owner. Shared-tenancy mode
    // merges owners at read time; the create route re-checks within the
    // active scope so teams don't end up with duplicate names either.
    uniqueIndex('field_configs_user_type_name_uq').on(
      table.userId,
      table.entityType,
      table.fieldName
    ),
  ]
)

export type FieldConfig = typeof fieldConfigs.$inferSelect
export type NewFieldConfig = typeof fieldConfigs.$inferInsert
