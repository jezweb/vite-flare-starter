/**
 * Semantic Search Tool — vector-based search via AI SDK embeddings
 *
 * Searches across user memories and files using cosine similarity.
 * When Vectorize is available, queries the vector index directly.
 * Falls back to in-memory embedding + comparison for small collections.
 *
 * Uses AI SDK's embed() and cosineSimilarity() functions.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { embedText, findSimilar } from '@/server/lib/ai/embeddings'
import { userMeta } from '@/server/modules/user-meta/db/schema'
import type { ProviderEnv } from '@/server/lib/ai/providers'

interface SemanticSearchContext {
  env: ProviderEnv & { DB: D1Database }
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
          const db = drizzle(ctx.env.DB)

          // Load all user memories
          const memories = await db
            .select({ key: userMeta.key, value: userMeta.value })
            .from(userMeta)
            .where(eq(userMeta.userId, ctx.userId))

          if (memories.length === 0) {
            return { query, results: [], message: 'No memories stored yet.' }
          }

          // Embed the query
          const queryEmbedding = await embedText(ctx.env, query)

          // Embed all memory values and find similar
          const memoryTexts = memories.map((m) => {
            try {
              const parsed = JSON.parse(m.value)
              return `${m.key}: ${parsed.value || parsed.description || m.value}`
            } catch {
              return `${m.key}: ${m.value}`
            }
          })

          // Batch embed all memories
          const { embedBatch } = await import('@/server/lib/ai/embeddings')
          const memoryEmbeddings = await embedBatch(ctx.env, memoryTexts)

          // Find most similar
          const items = memories.map((m, i) => ({
            embedding: memoryEmbeddings[i]!,
            data: { key: m.key, value: m.value },
          }))

          const results = findSimilar(queryEmbedding, items, limit)

          return {
            query,
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
  }
}
