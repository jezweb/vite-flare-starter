/**
 * artifacts — durable, versioned identity for AI-generated documents
 *
 * The create_artifact / edit_artifact chat tools stream their payload
 * into the transcript (that stays the source for inline rendering),
 * but ALSO index every create/edit here. That upgrade gives artifacts
 * what message-derivation can't:
 *
 *   - identity that survives the conversation (gallery, deep links)
 *   - a real version chain (v1..vN with full code per version)
 *   - publishability — the share-tokens 'artifact' resolver reads the
 *     latest version for public /share/:token pages
 *
 * Rows are written best-effort from the tools: a D1 hiccup degrades to
 * an unpersisted (but still rendered) artifact, never a failed tool.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const ARTIFACT_TYPES = ['html', 'svg', 'mermaid', 'markdown'] as const
export type ArtifactType = (typeof ARTIFACT_TYPES)[number]

export const artifacts = sqliteTable(
  'artifacts',
  {
    /** Stable public id — the tools echo it into the transcript payload. */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id'),
    type: text('type', { enum: ARTIFACT_TYPES }).notNull(),
    /** Denormalised from the latest version for cheap list views. */
    title: text('title').notNull(),
    latestVersion: integer('latest_version').notNull().default(1),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
    updatedAt: integer('updated_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index('artifacts_user_idx').on(table.userId, table.updatedAt),
    index('artifacts_conversation_idx').on(table.conversationId),
  ]
)

export const artifactVersions = sqliteTable(
  'artifact_versions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    artifactId: text('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    code: text('code').notNull(),
    height: integer('height'),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [uniqueIndex('artifact_versions_uq').on(table.artifactId, table.version)]
)

export type Artifact = typeof artifacts.$inferSelect
export type ArtifactVersion = typeof artifactVersions.$inferSelect
