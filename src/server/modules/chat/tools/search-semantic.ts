/**
 * Semantic Search Tools — vector search via AI SDK embeddings.
 *
 * Two modes:
 * 1. Vectorize (when VECTORS binding available): proper vector index
 * 2. In-memory fallback: embeds all memories per query (small collections)
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { Sparkles, Database } from 'lucide-react'
import { embedText, embedBatch, findSimilar } from '@/server/lib/ai/embeddings'
import { userMeta } from '@/server/modules/user-meta/db/schema'
import type { ProviderEnv } from '@/server/lib/ai/providers'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

type SemanticEnv = ProviderEnv & {
  DB: D1Database
  VECTORS?: VectorizeIndex
}

function getSemanticEnv(ctx: AgentContext): SemanticEnv {
  return ctx.env as unknown as SemanticEnv
}

const SemanticSearchOutput = z.union([
  z.object({
    query: z.string(),
    mode: z.literal('vectorize'),
    results: z.array(
      z.object({
        id: z.string(),
        key: z.string().optional(),
        value: z.string().optional(),
        type: z.string().optional(),
        similarity: z.number(),
      })
    ),
  }),
  z.object({
    query: z.string(),
    mode: z.literal('in-memory'),
    results: z.array(
      z.object({
        key: z.string(),
        value: z.string(),
        similarity: z.number(),
      })
    ),
    message: z.string().optional(),
  }),
  z.object({ query: z.string(), error: z.string() }),
])

export const semanticSearchDefinition: ToolDefinition<
  { query: string; limit?: number },
  z.infer<typeof SemanticSearchOutput>
> = {
  name: 'semantic_search',
  description:
    'Search memories and facts by meaning, not just keywords. Use when the user asks a question that might match stored knowledge semantically (e.g. "what do you know about my preferences?" or "find anything related to project deadlines").',
  inputSchema: z.object({
    query: z.string().describe('Natural language search query'),
    limit: z.number().optional().describe('Max results (default 5)'),
  }),
  outputSchema: SemanticSearchOutput,
  execute: async ({ query, limit = 5 }, ctx) => {
    const env = getSemanticEnv(ctx)
    try {
      const queryEmbedding = await embedText(env, query)

      if (env.VECTORS) {
        const vectorResults = await env.VECTORS.query(queryEmbedding, {
          topK: limit,
          filter: { userId: ctx.userId },
          returnMetadata: 'all',
        })
        return {
          query,
          mode: 'vectorize',
          results: vectorResults.matches.map((m) => ({
            id: m.id,
            key: (m.metadata as Record<string, unknown>)?.['key'] as string,
            value: (m.metadata as Record<string, unknown>)?.['value'] as string,
            type: (m.metadata as Record<string, unknown>)?.['type'] as string,
            similarity: Math.round(m.score * 100) / 100,
          })),
        }
      }

      const db = drizzle(env.DB)
      const memories = await db
        .select({ key: userMeta.key, value: userMeta.value })
        .from(userMeta)
        .where(eq(userMeta.userId, ctx.userId))

      if (memories.length === 0) {
        return { query, mode: 'in-memory', results: [], message: 'No memories stored yet.' }
      }

      const memoryTexts = memories.map((m) => {
        try {
          const parsed = JSON.parse(m.value)
          return `${m.key}: ${parsed.value || parsed.description || m.value}`
        } catch {
          return `${m.key}: ${m.value}`
        }
      })

      const memoryEmbeddings = await embedBatch(env, memoryTexts)
      const items = memories.map((m, i) => ({
        embedding: memoryEmbeddings[i]!,
        data: { key: m.key, value: m.value },
      }))
      const results = findSimilar(queryEmbedding, items, limit)

      return {
        query,
        mode: 'in-memory',
        results: results.map((r) => ({
          key: r.data.key,
          value: r.data.value,
          similarity: Math.round(r.similarity * 100) / 100,
        })),
      }
    } catch (error) {
      return { query, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Sparkles, displayName: 'Semantic Search' },
}

const VectorizeContentOutput = z.union([
  z.object({ indexed: z.literal(true), id: z.string(), type: z.string() }),
  z.object({ indexed: z.literal(false), message: z.string() }),
  z.object({ indexed: z.literal(false), error: z.string() }),
])

export const vectorizeContentDefinition: ToolDefinition<
  { id: string; content: string; type?: string; key?: string },
  z.infer<typeof VectorizeContentOutput>
> = {
  name: 'vectorize_content',
  description:
    'Store content in the vector search index for future semantic retrieval. Use after saving important information (memories, documents, notes) so it can be found by meaning later.',
  inputSchema: z.object({
    id: z.string().describe('Unique ID for this content (e.g. memory key, document ID)'),
    content: z.string().describe('The text content to index'),
    type: z.string().optional().describe('Content type (e.g. "memory", "document", "note")'),
    key: z.string().optional().describe('Human-readable key/title'),
  }),
  outputSchema: VectorizeContentOutput,
  execute: async ({ id, content, type = 'memory', key }, ctx) => {
    const env = getSemanticEnv(ctx)
    if (!env.VECTORS) {
      return {
        indexed: false,
        message: 'Vectorize not configured. Content saved but not indexed for semantic search.',
      }
    }
    try {
      const embedding = await embedText(env, content)
      await env.VECTORS.upsert([
        {
          id: `${ctx.userId}:${id}`,
          values: embedding,
          metadata: {
            userId: ctx.userId,
            type,
            key: key || id,
            value: content.slice(0, 1000),
          },
        },
      ])
      return { indexed: true, id, type }
    } catch (error) {
      return { indexed: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Database, displayName: 'Vectorize Content' },
}

export const semanticSearchDefinitions = [
  semanticSearchDefinition,
  vectorizeContentDefinition,
] as ToolDefinition<unknown, unknown>[]
