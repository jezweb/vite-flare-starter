/**
 * Projects — group conversations by topic, client, or mode of work.
 *
 * A project adds:
 *   - a shared name + description
 *   - a project-level system prompt injected into every chat in the project
 *   - a default model (falls back to user default)
 *   - an optional colour for visual tagging in the sidebar
 *
 * Conversations reference a project via `conversations.project_id` (nullable
 * — null = ungrouped). Deleting a project uses `ON DELETE SET NULL` so the
 * conversations survive and return to the flat list.
 *
 * Phase 1 scope: organisation only. Phase 2+ adds the project page with the
 * instruction editor + knowledge files + vectorised search (see
 * .jez/artifacts/projects-plan-2026-04-18.md).
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** Short description shown on the project page. */
  description: text('description'),
  /** Project-wide system prompt injected on every chat in this project. */
  systemPrompt: text('system_prompt'),
  /** Default model for new convos (null = user default). */
  defaultModel: text('default_model'),
  /** Optional colour token ("blue", "emerald", "rose", etc. — see UI). */
  color: text('color'),
  /** Sidebar sort order within a user's list. Lower = earlier. */
  position: integer('position').notNull().default(0),
  /** 1 when archived — hidden from sidebar, still accessible via archive view. */
  archived: integer('archived').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('projects_user_id_idx').on(table.userId),
  index('projects_user_position_idx').on(table.userId, table.position),
  index('projects_user_archived_idx').on(table.userId, table.archived),
])
