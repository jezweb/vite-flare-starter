import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Skills registry — indexes skills available to the AI agent.
 *
 * Per-user overrides:
 *   - `user_id = 'bundled'` — default rows shared by every user (shipped
 *     with the starter + GitHub installs + zip uploads done at admin-level).
 *   - `user_id = <user.id>` — a user's personal override. Created when a
 *     user saves an edit via the skills editor or the propose_patch chat tool.
 *   - loadSkill(env, name, userId) looks up the user's row first, falls
 *     back to `'bundled'` if no personal override exists.
 *
 * The `(user_id, name)` unique index enforces one row per user per skill
 * name — multiple users can have independent overrides of the same skill.
 *
 * Body is NOT stored in D1 — only metadata. Body is fetched from R2 at
 * `${user_id}/${name}/SKILL.md` or from the bundled filesystem glob.
 */
export const BUNDLED_USER_ID = 'bundled'

export const skills = sqliteTable(
  'skills',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().default(BUNDLED_USER_ID),
    /**
     * Optional org scoping (Phase 5). Null = personal/bundled. Value = visible
     * to all members of this org. Org table is `organization` (better-auth
     * plugin), no Drizzle FK reference — managed via raw SQL migration 0030.
     */
    orgId: text('org_id'),
    name: text('name').notNull(),
    description: text('description').notNull(),
    source: text('source', { enum: ['bundled', 'r2', 'github'] }).notNull(),
    /** Path to the SKILL.md file (R2 key, repo path, or github URL) */
    path: text('path').notNull(),
    /** JSON: extra frontmatter fields (allowed_tools, model, schedule, etc.) */
    metadata: text('metadata').notNull().default('{}'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('skills_user_name_idx').on(table.userId, table.name),
    index('skills_source_idx').on(table.source),
    index('skills_enabled_idx').on(table.enabled),
    index('skills_org_id_idx').on(table.orgId),
  ]
)
