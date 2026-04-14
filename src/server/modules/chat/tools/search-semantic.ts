/**
 * Semantic Search Tool — vector-based search via AI SDK embeddings
 *
 * Two modes:
 * 1. Vectorize (when VECTORS binding available): proper vector index,
 *    metadata filtering, scales to millions of vectors
 * 2. In-memory fallback: embeds all memories on each query, suitable
 *    for small collections (<100 items)
 *
 * Uses AI SDK's embed() and cosineSimilarity() functions.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { embedText, embedBatch, findSimilar } from '@/server/lib/ai/embeddings'
import { userMeta } from '@/server/modules/user-meta/db/schema'
import type { ProviderEnv } from '@/server/lib/ai/providers'

interface SemanticSearchContext {
  env: ProviderEnv & {
    DB: D1Database
    VECTORS?: VectorizeIndex
  }
  userId: string
}

export function buildSemanticSearchTools(ctx: SemanticSearchContext) {
  return {
    semantic_search: tool({
      description: 'Search memories and facts by meaning, not just keywords. Use when the user asks a question that might match stored knowledge semantically (e.g. "what do you know about my preferences?" or "find anything related to project deadlines").',
      inputSchema: z.object({
        query: z.string().describe('Natural language search query'),
        limit: z.number().optional().describe('Max results (default 5)'),
      }),
      execute: async ({ query, limit = 5 }) => {
        try {
          // Embed the query
          const queryEmbedding = await embedText(ctx.env, query)

          // Mode 1: Vectorize — fast indexed search with metadata filtering
          if (ctx.env.VECTORS) {
            const vectorResults = await ctx.env.VECTORS.query(queryEmbedding, {
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

          // Mode 2: In-memory fallback — embed all memories and compare
          const db = drizzle(ctx.env.DB)
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

          const memoryEmbeddings = await embedBatch(ctx.env, memoryTexts)

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
    }),

    /** Index a piece of content into Vectorize for future semantic search */
    vectorize_content: tool({
      description: 'Store content in the vector search index for future semantic retrieval. Use after saving important information (memories, documents, notes) so it can be found by meaning later.',
      inputSchema: z.object({
        id: z.string().describe('Unique ID for this content (e.g. memory key, document ID)'),
        content: z.string().describe('The text content to index'),
        type: z.string().optional().describe('Content type (e.g. "memory", "document", "note")'),
        key: z.string().optional().describe('Human-readable key/title'),
      }),
      execute: async ({ id, content, type = 'memory', key }) => {
        if (!ctx.env.VECTORS) {
          return { indexed: false, message: 'Vectorize not configured. Content saved but not indexed for semantic search.' }
        }

        try {
          const embedding = await embedText(ctx.env, content)

          await ctx.env.VECTORS.upsert([{
            id: `${ctx.userId}:${id}`,
            values: embedding,
            metadata: {
              userId: ctx.userId,
              type,
              key: key || id,
              value: content.slice(0, 1000), // store first 1000 chars as metadata
            },
          }])

          return { indexed: true, id, type }
        } catch (error) {
          return { indexed: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
