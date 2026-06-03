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
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const projects = sqliteTable(
  'projects',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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
     * 'ask'    → updates queue to approvals module before applying
     * 'auto'   → updates apply immediately, no approval needed (default — best UX for new users)
     * 'never'  → auto-job is skipped entirely (manual regen still works)
     */
    memoryUpdateMode: text('memory_update_mode', { enum: ['ask', 'auto', 'never'] })
      .notNull()
      .default('auto'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('projects_user_id_idx').on(table.userId),
    index('projects_user_position_idx').on(table.userId, table.position),
    index('projects_user_archived_idx').on(table.userId, table.archived),
    index('projects_user_starred_idx').on(table.userId, table.starred, table.updatedAt),
    index('projects_org_id_idx').on(table.orgId),
  ]
)

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert

/**
 * project_members — multi-user Project membership (Phase 5).
 *
 * Existing solo projects keep the legacy `projects.user_id` semantics:
 * the creator is always treated as an implicit owner. The dual-read
 * helpers in storage check this table first; absence falls back to
 * legacy ownership so no migration of every existing row is needed.
 *
 * Roles:
 *   owner   — creator; can invite, remove members, delete project
 *   editor  — read + write everything in the project
 *   viewer  — read-only; cannot create conversations, edit memory, etc.
 */
export type ProjectMemberRole = 'owner' | 'editor' | 'viewer'

export const projectMembers = sqliteTable(
  'project_members',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').$type<ProjectMemberRole>().notNull().default('editor'),
    invitedByUserId: text('invited_by_user_id'),
    joinedAt: integer('joined_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index('project_members_project_idx').on(table.projectId),
    index('project_members_user_idx').on(table.userId),
    uniqueIndex('project_members_project_user_unique').on(table.projectId, table.userId),
  ]
)

export type ProjectMember = typeof projectMembers.$inferSelect
