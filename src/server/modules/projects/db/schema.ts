/**
 * Projects — first-class workspaces grouping conversations, files, instructions,
 * and (Phase 3) memory. Inspired by claude.ai's Projects pattern.
 *
 * A project provides:
 *   - shared name + description + optional cover colour
 *   - project-level system prompt (`system_prompt`) injected on every chat
 *   - default model (falls back to user default)
 *   - optional org scoping (`org_id`) — null = personal, value = team-shared
 *   - star/favourite (`starred`)
 *   - soft-archive (`archived_at`) — hidden from index, restorable
 *   - memory update trust mode — 'ask' | 'auto' | 'never' (Phase 3 + Extension E)
 *
 * Conversations reference a project via `conversations.project_id` (nullable
 * — null = ungrouped). Deleting a project uses `ON DELETE SET NULL` so the
 * conversations survive and return to the flat list.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  /**
   * Optional org scoping. Null = personal project. Value = shared with
   * everyone in this org. Org table is `organization` (better-auth plugin),
   * managed via raw SQL migration 0030 — no Drizzle FK reference here.
   */
  orgId: text('org_id'),
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
  /** 1 when starred — sorted to the top of the index. */
  starred: integer('starred').notNull().default(0),
  /**
   * Legacy archived flag (kept for back-compat with existing rows).
   * New code should use `archivedAt` instead — null = active, value = archived.
   */
  archived: integer('archived').notNull().default(0),
  /** Soft-archive timestamp. Null = active. */
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  /**
   * Memory update trust mode (Phase 3 / Extension E).
   * 'ask'    → updates queue to approvals module before applying (default for new projects)
   * 'auto'   → updates apply immediately, no approval needed
   * 'never'  → auto-job is skipped entirely (manual regen still works)
   */
  memoryUpdateMode: text('memory_update_mode', { enum: ['ask', 'auto', 'never'] }).notNull().default('ask'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('projects_user_id_idx').on(table.userId),
  index('projects_user_position_idx').on(table.userId, table.position),
  index('projects_user_archived_idx').on(table.userId, table.archived),
  index('projects_user_starred_idx').on(table.userId, table.starred, table.updatedAt),
  index('projects_org_id_idx').on(table.orgId),
])

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
