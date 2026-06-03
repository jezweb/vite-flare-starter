/**
 * Knowledge documents — long-form indexed reference material for the AI agent.
 *
 * Sits between `memories` (small structured facts, ≤8KB) and `skills`
 * (procedures with progressive-disclosure resources). Knowledge docs are
 * plain reference content the agent should consult when relevant — schema
 * docs, glossaries, runbooks, FAQ corpora — without performing the doc as
 * a procedure.
 *
 * Three scopes via the (scope, scopeId) discriminator (mirrors memories):
 *   - 'user'    — visible to that user across any chat they start
 *   - 'project' — visible to project members; resolved when chat is in the project
 *   - 'org'     — visible to org members; resolved for chats in any org-shared resource
 *
 * Two injection modes (mirrors skills `always_active`):
 *   - 'always'    — body baked into every chat's system prompt (Active Knowledge)
 *   - 'on_demand' — title + summary appear in catalog; agent calls
 *                   `knowledge_search` + `load_knowledge` to fetch the body
 *   - 'disabled'  — neither catalog nor body inject; doc is parked
 *
 * FTS5 is layered on by the migration (knowledge_documents_fts) — drizzle
 * does not natively model virtual tables.
 *
 * Body soft-cap is 100KB; the route validates a hard ceiling at 256KB to
 * prevent runaway prompt bloat. Token estimate (≈ length / 4) is stored on
 * insert/update so the UI can display per-doc + total `always` budget
 * without re-counting on every render.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const KNOWLEDGE_SCOPES = ['user', 'project', 'org'] as const
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number]

export const KNOWLEDGE_FORMATS = ['markdown', 'json', 'text'] as const
export type KnowledgeFormat = (typeof KNOWLEDGE_FORMATS)[number]

export const INJECTION_MODES = ['always', 'on_demand', 'disabled'] as const
export type InjectionMode = (typeof INJECTION_MODES)[number]

export const knowledgeDocuments = sqliteTable(
  'knowledge_documents',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scope: text('scope', { enum: KNOWLEDGE_SCOPES }).notNull(),
    /** user.id | projects.id | organization.id depending on scope. */
    scopeId: text('scope_id').notNull(),
    title: text('title').notNull(),
    /** One-liner shown in catalog injection — when to use this doc. */
    summary: text('summary').notNull(),
    /** Soft cap 100KB. Hard validate at 256KB in routes. */
    body: text('body').notNull(),
    format: text('format', { enum: KNOWLEDGE_FORMATS }).notNull().default('markdown'),
    injectionMode: text('injection_mode', { enum: INJECTION_MODES }).notNull().default('on_demand'),
    /** JSON array of free-form tags for grouping. */
    tags: text('tags').notNull().default('[]'),
    /** Estimated tokens for the body — set by routes on insert/update. */
    estimatedTokens: integer('estimated_tokens').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('knowledge_scope_idx').on(t.scope, t.scopeId),
    index('knowledge_injection_idx').on(t.injectionMode),
    index('knowledge_scope_injection_idx').on(t.scope, t.scopeId, t.injectionMode),
  ]
)

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect
export type NewKnowledgeDocument = typeof knowledgeDocuments.$inferInsert
