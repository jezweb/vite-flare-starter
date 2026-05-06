/**
 * Knowledge tools — keyword search + on-demand body load.
 *
 * Mirrors the skills tool pair (`list_skills` + `load_skill`) but for
 * long-form indexed reference documents. The agent first searches by
 * keyword (FTS5) to find relevant docs, then loads a specific body.
 *
 * Scope authorisation: the chat agent's context carries `userId` and
 * (optionally) `projectId`. We pass both into the storage helpers so
 * docs in inaccessible scopes are never returned, even if their id leaks
 * through some other path.
 *
 * Loaded bodies are wrapped in <knowledge_content> tags — the same
 * compaction-guard shape as <skill_content> so future cleanup logic
 * can preserve them.
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { BookOpen, Search } from 'lucide-react'
import { projects } from '@/server/modules/projects/db/schema'
import {
  getKnowledgeForUser,
  searchKnowledge,
} from '@/server/modules/knowledge/storage'
import type { KnowledgeScope } from '@/server/modules/knowledge/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

/**
 * Marker that wraps every load_knowledge output. Future context-compaction
 * code should preserve messages containing this token.
 */
export const KNOWLEDGE_CONTENT_MARKER = '<knowledge_content'

interface KnowledgeEnv {
  DB: D1Database
}

function getDb(ctx: AgentContext): D1Database | undefined {
  return (ctx.env as Partial<KnowledgeEnv>).DB
}

const knowledgeAvailable = (ctx: AgentContext) => !!getDb(ctx)

async function userScopes(
  db: D1Database,
  userId: string,
  projectId: string | null,
): Promise<Array<{ scope: KnowledgeScope; scopeId: string }>> {
  const d = drizzle(db)
  const ownProjects = await d
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.userId, userId))

  // ctx.projectId is only added if the user actually owns it. Without
  // this intersection, a chat created under a project the user has lost
  // access to would still be able to search that project's knowledge.
  // Caught by 2026-05-07 brains-trust review.
  const ownIds = new Set(ownProjects.map((p) => p.id))
  const projectIds = new Set<string>()
  for (const id of ownIds) projectIds.add(id)
  if (projectId && ownIds.has(projectId)) projectIds.add(projectId)

  return [
    { scope: 'user' as const, scopeId: userId },
    ...Array.from(projectIds).map((id) => ({ scope: 'project' as const, scopeId: id })),
  ]
}

const SearchOutput = z.union([
  z.object({
    hits: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        scope: z.enum(['user', 'project', 'org']),
        tags: z.array(z.string()),
        estimatedTokens: z.number(),
      }),
    ),
    count: z.number(),
  }),
  z.object({ error: z.string() }),
])

const knowledgeSearchDef: ToolDefinition<{ query: string; limit?: number }, z.infer<typeof SearchOutput>> = {
  name: 'knowledge_search',
  description:
    "Search the user's knowledge base by keyword across user + project scopes. Returns ranked matches with title + summary + scope + tags. Use to discover relevant reference docs BEFORE asking the user — the answer to a factual question may already exist in their KB. Follow up with load_knowledge(id) to read a hit's body.",
  inputSchema: z.object({
    query: z.string().min(1).describe('Keyword query, e.g. "broker pricing" or "queensland conveyancing".'),
    limit: z.number().int().min(1).max(50).optional().describe('Max hits to return (default 20).'),
  }),
  outputSchema: SearchOutput,
  isAvailable: knowledgeAvailable,
  execute: async ({ query, limit }, ctx) => {
    const db = getDb(ctx)
    if (!db) return { error: 'Knowledge unavailable: DB binding missing' }
    try {
      const scopes = await userScopes(db, ctx.userId, ctx.projectId ?? null)
      const hits = await searchKnowledge(db, scopes, query, limit ?? 20)
      return {
        hits: hits.map((h) => ({
          id: h.id,
          title: h.title,
          summary: h.summary,
          scope: h.scope,
          tags: h.tags,
          estimatedTokens: h.estimatedTokens,
        })),
        count: hits.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
  render: { icon: Search, displayName: 'Knowledge Search' },
}

const LoadOutput = z.union([
  z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    scope: z.enum(['user', 'project', 'org']),
    tags: z.array(z.string()),
    content: z.string(),
  }),
  z.object({ id: z.string(), error: z.string() }),
])

const loadedKnowledgeDedup = new WeakMap<AgentContext, Set<string>>()

function getDedup(ctx: AgentContext): Set<string> {
  let set = loadedKnowledgeDedup.get(ctx)
  if (!set) {
    set = new Set()
    loadedKnowledgeDedup.set(ctx, set)
  }
  return set
}

const loadKnowledgeDef: ToolDefinition<{ id: string }, z.infer<typeof LoadOutput>> = {
  name: 'load_knowledge',
  description:
    "Load a knowledge document's full body by id (use the id from knowledge_search hits). Returns the body wrapped in <knowledge_content> tags so it survives compaction. Call only when a search hit is relevant to the user's task — bodies can be large.",
  inputSchema: z.object({
    id: z.string().describe('Knowledge document id (from a knowledge_search hit).'),
  }),
  outputSchema: LoadOutput,
  isAvailable: knowledgeAvailable,
  execute: async ({ id }, ctx) => {
    const db = getDb(ctx)
    if (!db) return { id, error: 'Knowledge unavailable: DB binding missing' }
    try {
      const scopes = await userScopes(db, ctx.userId, ctx.projectId ?? null)
      const rows = await getKnowledgeForUser(db, [id], scopes)
      const row = rows[0]
      if (!row) return { id, error: 'Not found or not in an accessible scope' }

      const dedup = getDedup(ctx)
      if (dedup.has(id)) {
        return {
          id,
          title: row.title,
          summary: row.summary,
          scope: row.scope,
          tags: safeParseTags(row.tags),
          content: `<knowledge_content id="${id}" deduped="true">\nKnowledge "${row.title}" was already loaded earlier in this conversation — its body is above.\n</knowledge_content>`,
        }
      }
      dedup.add(id)

      return {
        id,
        title: row.title,
        summary: row.summary,
        scope: row.scope,
        tags: safeParseTags(row.tags),
        content: [
          `<knowledge_content id="${id}" title="${row.title}" scope="${row.scope}">`,
          row.body,
          '</knowledge_content>',
        ].join('\n'),
      }
    } catch (err) {
      return { id, error: err instanceof Error ? err.message : String(err) }
    }
  },
  render: { icon: BookOpen, displayName: 'Load Knowledge' },
}

function safeParseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

export const knowledgeDefinitions: ToolDefinition<unknown, unknown>[] = [
  knowledgeSearchDef,
  loadKnowledgeDef,
] as ToolDefinition<unknown, unknown>[]
