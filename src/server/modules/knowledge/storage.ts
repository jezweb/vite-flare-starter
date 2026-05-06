/**
 * Knowledge storage — CRUD + FTS5 search + always-active body loader.
 *
 * Scope authorisation lives in the routes layer (only the caller knows their
 * project membership / active org). These helpers take explicit (scope,
 * scopeId) tuples and trust them.
 *
 * Token estimation uses the GPT-style ~4 chars/token approximation. Cheap,
 * deterministic, accurate enough for UI budget warnings.
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  knowledgeDocuments,
  type KnowledgeDocument,
  type KnowledgeScope,
  type KnowledgeFormat,
  type InjectionMode,
} from './db/schema'

/** Soft cap shown in UI; routes hard-validate at HARD_CAP. */
export const KNOWLEDGE_BODY_SOFT_CAP = 100 * 1024
/** Hard rejection ceiling — anything bigger blows the prompt budget. */
export const KNOWLEDGE_BODY_HARD_CAP = 256 * 1024

export function estimateTokens(body: string): number {
  return Math.ceil(body.length / 4)
}

export function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

export function serializeTags(tags: string[]): string {
  return JSON.stringify(tags.filter((t) => typeof t === 'string' && t.trim().length > 0))
}

export interface CreateKnowledgeArgs {
  scope: KnowledgeScope
  scopeId: string
  title: string
  summary: string
  body: string
  format?: KnowledgeFormat
  injectionMode?: InjectionMode
  tags?: string[]
}

export async function createKnowledge(
  db: D1Database,
  args: CreateKnowledgeArgs,
): Promise<KnowledgeDocument> {
  const d = drizzle(db)
  const now = new Date()
  const row = {
    scope: args.scope,
    scopeId: args.scopeId,
    title: args.title,
    summary: args.summary,
    body: args.body,
    format: args.format ?? 'markdown',
    injectionMode: args.injectionMode ?? 'on_demand',
    tags: serializeTags(args.tags ?? []),
    estimatedTokens: estimateTokens(args.body),
    createdAt: now,
    updatedAt: now,
  } satisfies Omit<KnowledgeDocument, 'id'>

  const [inserted] = await d.insert(knowledgeDocuments).values(row).returning()
  if (!inserted) throw new Error('Failed to create knowledge document')
  return inserted
}

export interface UpdateKnowledgeArgs {
  title?: string
  summary?: string
  body?: string
  format?: KnowledgeFormat
  injectionMode?: InjectionMode
  tags?: string[]
}

export async function updateKnowledge(
  db: D1Database,
  id: string,
  args: UpdateKnowledgeArgs,
): Promise<KnowledgeDocument | null> {
  const d = drizzle(db)
  const patch: Partial<KnowledgeDocument> = { updatedAt: new Date() }
  if (args.title !== undefined) patch.title = args.title
  if (args.summary !== undefined) patch.summary = args.summary
  if (args.body !== undefined) {
    patch.body = args.body
    patch.estimatedTokens = estimateTokens(args.body)
  }
  if (args.format !== undefined) patch.format = args.format
  if (args.injectionMode !== undefined) patch.injectionMode = args.injectionMode
  if (args.tags !== undefined) patch.tags = serializeTags(args.tags)

  const [updated] = await d
    .update(knowledgeDocuments)
    .set(patch)
    .where(eq(knowledgeDocuments.id, id))
    .returning()
  return updated ?? null
}

export async function getKnowledge(
  db: D1Database,
  id: string,
): Promise<KnowledgeDocument | null> {
  const d = drizzle(db)
  const [row] = await d
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, id))
    .limit(1)
  return row ?? null
}

export async function deleteKnowledge(db: D1Database, id: string): Promise<boolean> {
  const d = drizzle(db)
  const result = await d
    .delete(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, id))
    .returning({ id: knowledgeDocuments.id })
  return result.length > 0
}

export interface ListKnowledgeOpts {
  injectionMode?: InjectionMode
  /** When provided, only rows whose tags JSON contains EVERY listed tag. */
  tags?: string[]
  limit?: number
}

export async function listKnowledge(
  db: D1Database,
  scope: KnowledgeScope,
  scopeId: string,
  opts: ListKnowledgeOpts = {},
): Promise<KnowledgeDocument[]> {
  const d = drizzle(db)
  const where = [eq(knowledgeDocuments.scope, scope), eq(knowledgeDocuments.scopeId, scopeId)]
  if (opts.injectionMode) where.push(eq(knowledgeDocuments.injectionMode, opts.injectionMode))
  const rows = await d
    .select()
    .from(knowledgeDocuments)
    .where(and(...where))
    .orderBy(desc(knowledgeDocuments.updatedAt))
    .limit(opts.limit ?? 200)

  if (!opts.tags || opts.tags.length === 0) return rows
  const wanted = opts.tags.map((t) => t.toLowerCase())
  return rows.filter((r) => {
    const tags = parseTags(r.tags).map((t) => t.toLowerCase())
    return wanted.every((t) => tags.includes(t))
  })
}

/**
 * FTS5 keyword search across the user's accessible scopes. Caller passes the
 * scopes the user has access to (own user scope + project scopes + org scope).
 *
 * Ranking: BM25 (FTS5 default). Query is escaped to avoid syntax errors on
 * common punctuation; star-suffix wildcard appended to the last term so
 * "broker rule" matches "broker rules" / "broker rulings" / etc.
 */
export interface KnowledgeSearchHit {
  id: string
  title: string
  summary: string
  scope: KnowledgeScope
  scopeId: string
  injectionMode: InjectionMode
  tags: string[]
  estimatedTokens: number
  /** BM25 rank (lower = better). */
  rank: number
}

export async function searchKnowledge(
  db: D1Database,
  scopes: ReadonlyArray<{ scope: KnowledgeScope; scopeId: string }>,
  query: string,
  limit = 20,
): Promise<KnowledgeSearchHit[]> {
  if (scopes.length === 0 || !query.trim()) return []

  // Sanitise the query — strip FTS5 operators that bite on free-text input.
  // Keep alphanumerics + spaces + simple punctuation that FTS5 tokenises.
  const cleaned = query.replace(/["'()*+:^]/g, ' ').trim()
  if (!cleaned) return []
  const terms = cleaned.split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  // Append wildcard to the LAST term so partial-typed queries find prefixes.
  const ftsQuery = terms
    .map((t, i) => (i === terms.length - 1 ? `${t}*` : t))
    .join(' ')

  // Build (scope=? AND scope_id=?) OR (scope=? AND scope_id=?) ... safely.
  const scopePredicates = scopes
    .map(() => '(d.scope = ? AND d.scope_id = ?)')
    .join(' OR ')
  const bindings: unknown[] = [ftsQuery]
  for (const s of scopes) {
    bindings.push(s.scope, s.scopeId)
  }
  bindings.push(limit)

  const rows = await db
    .prepare(
      `SELECT d.id, d.title, d.summary, d.scope, d.scope_id as scopeId,
              d.injection_mode as injectionMode, d.tags, d.estimated_tokens as estimatedTokens,
              fts.rank as rank
       FROM knowledge_documents_fts fts
       JOIN knowledge_documents d ON d.rowid = fts.rowid
       WHERE knowledge_documents_fts MATCH ?
         AND (${scopePredicates})
       ORDER BY fts.rank
       LIMIT ?`,
    )
    .bind(...bindings)
    .all<{
      id: string
      title: string
      summary: string
      scope: KnowledgeScope
      scopeId: string
      injectionMode: InjectionMode
      tags: string
      estimatedTokens: number
      rank: number
    }>()

  return (rows.results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    scope: r.scope,
    scopeId: r.scopeId,
    injectionMode: r.injectionMode,
    tags: parseTags(r.tags),
    estimatedTokens: r.estimatedTokens,
    rank: r.rank,
  }))
}

/**
 * Load every always-active knowledge body across the user's accessible scopes.
 *
 * Returns full bodies in stable order (user → project → org) so the system
 * prompt cache key is deterministic — same scopes + same docs ⇒ same bytes.
 */
export interface AlwaysActiveKnowledge {
  id: string
  title: string
  summary: string
  body: string
  scope: KnowledgeScope
  estimatedTokens: number
}

export async function loadAlwaysActiveKnowledge(
  db: D1Database,
  userId: string,
  projectId: string | null,
  orgId: string | null,
): Promise<AlwaysActiveKnowledge[]> {
  const d = drizzle(db)
  const out: AlwaysActiveKnowledge[] = []

  const userRows = await d
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.scope, 'user'),
        eq(knowledgeDocuments.scopeId, userId),
        eq(knowledgeDocuments.injectionMode, 'always'),
      ),
    )
    .orderBy(knowledgeDocuments.title)
  out.push(...userRows.map(toAlwaysActive))

  if (projectId) {
    const projectRows = await d
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.scope, 'project'),
          eq(knowledgeDocuments.scopeId, projectId),
          eq(knowledgeDocuments.injectionMode, 'always'),
        ),
      )
      .orderBy(knowledgeDocuments.title)
    out.push(...projectRows.map(toAlwaysActive))
  }

  if (orgId) {
    const orgRows = await d
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.scope, 'org'),
          eq(knowledgeDocuments.scopeId, orgId),
          eq(knowledgeDocuments.injectionMode, 'always'),
        ),
      )
      .orderBy(knowledgeDocuments.title)
    out.push(...orgRows.map(toAlwaysActive))
  }

  return out
}

/**
 * Catalog entries (title + summary + scope) for on-demand-mode docs across
 * the user's accessible scopes. Used to populate the chat agent's "Available
 * Knowledge" system-prompt section so the agent knows which docs exist
 * without loading bodies.
 */
export interface KnowledgeCatalogEntry {
  id: string
  title: string
  summary: string
  scope: KnowledgeScope
  estimatedTokens: number
  tags: string[]
}

export async function listKnowledgeCatalog(
  db: D1Database,
  userId: string,
  projectId: string | null,
  orgId: string | null,
): Promise<KnowledgeCatalogEntry[]> {
  const d = drizzle(db)
  // Build a single OR-ed query so we get a stable round-trip count.
  const scopeFilters = [
    and(eq(knowledgeDocuments.scope, 'user'), eq(knowledgeDocuments.scopeId, userId)),
  ]
  if (projectId) {
    scopeFilters.push(
      and(eq(knowledgeDocuments.scope, 'project'), eq(knowledgeDocuments.scopeId, projectId)),
    )
  }
  if (orgId) {
    scopeFilters.push(
      and(eq(knowledgeDocuments.scope, 'org'), eq(knowledgeDocuments.scopeId, orgId)),
    )
  }
  const rows = await d
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.injectionMode, 'on_demand'),
        sql`(${sql.join(scopeFilters, sql` OR `)})`,
      ),
    )
    .orderBy(knowledgeDocuments.title)
    .limit(100)

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    scope: r.scope,
    estimatedTokens: r.estimatedTokens,
    tags: parseTags(r.tags),
  }))
}

/**
 * Bulk-fetch knowledge bodies by id list, scoped to the user's accessible
 * scopes — used by the `load_knowledge` chat tool. Caller guarantees the ids
 * came from `listKnowledgeCatalog` or `searchKnowledge` results, but we still
 * filter by scope as a defence-in-depth check.
 */
export async function getKnowledgeForUser(
  db: D1Database,
  ids: string[],
  scopes: ReadonlyArray<{ scope: KnowledgeScope; scopeId: string }>,
): Promise<KnowledgeDocument[]> {
  if (ids.length === 0 || scopes.length === 0) return []
  const d = drizzle(db)
  const scopeFilters = scopes.map((s) =>
    and(eq(knowledgeDocuments.scope, s.scope), eq(knowledgeDocuments.scopeId, s.scopeId)),
  )
  const rows = await d
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        inArray(knowledgeDocuments.id, ids),
        sql`(${sql.join(scopeFilters, sql` OR `)})`,
      ),
    )
  return rows
}

function toAlwaysActive(r: KnowledgeDocument): AlwaysActiveKnowledge {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    body: r.body,
    scope: r.scope,
    estimatedTokens: r.estimatedTokens,
  }
}
