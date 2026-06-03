import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'
import { projects } from '@/server/modules/projects/db/schema'

/**
 * Files table - stores metadata for user-uploaded files
 * Actual file content is stored in R2 bucket (FILES binding)
 */
export const files = sqliteTable(
  'files',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    /**
     * Optional project scoping. Null = general/personal file (default behaviour).
     * Value = scoped to a project, shown on the project's Files section, and
     * automatically injected as context into chats started in that project.
     * ON DELETE SET NULL — files survive the project deletion.
     */
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),

    // File metadata
    name: text('name').notNull(),
    key: text('key').notNull(), // R2 object key
    mimeType: text('mimeType').notNull(),
    size: integer('size').notNull(), // bytes

    // Organization
    folder: text('folder').default('/'), // virtual folder path

    // Sharing
    isPublic: integer('isPublic', { mode: 'boolean' }).default(false),
    publicUrl: text('publicUrl'), // generated public URL if isPublic

    // RAG indexing (Phase 4) — 'pending' | 'indexed' | 'failed' | null (never attempted)
    // Tracks whether the file's content has been chunked + embedded into Vectorize.
    indexStatus: text('index_status'),
    indexedAt: integer('indexed_at', { mode: 'timestamp' }),
    indexChunks: integer('index_chunks'), // number of chunks produced
    indexError: text('index_error'),

    // Timestamps
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('files_project_id_idx').on(table.projectId)]
)

export type File = typeof files.$inferSelect
export type NewFile = typeof files.$inferInsert
