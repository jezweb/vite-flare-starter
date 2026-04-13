import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

/**
 * Skills registry — indexes skills available to the AI agent.
 *
 * Sources:
 * - 'bundled' — shipped with the starter (in /skills directory)
 * - 'r2' — uploaded to the SKILLS R2 bucket
 * - 'github' — fetched from a GitHub repo (cached in R2)
 *
 * The body is NOT stored in D1 — only metadata. Body is fetched
 * from R2 (or repo file) when the skill is loaded.
 */
export const skills = sqliteTable('skills', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  source: text('source', { enum: ['bundled', 'r2', 'github'] }).notNull(),
  /** Path to the SKILL.md file (R2 key, repo path, or github URL) */
  path: text('path').notNull(),
  /** JSON: extra frontmatter fields (allowed_tools, model, schedule, etc.) */
  metadata: text('metadata').notNull().default('{}'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('skills_source_idx').on(table.source),
  index('skills_enabled_idx').on(table.enabled),
])
