import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

/**
 * Files table - stores metadata for user-uploaded files
 * Actual file content is stored in R2 bucket (FILES binding)
 */
export const files = sqliteTable('files', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),

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
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type File = typeof files.$inferSelect
export type NewFile = typeof files.$inferInsert
