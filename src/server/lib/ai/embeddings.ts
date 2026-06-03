/**
 * Embedding utilities via AI SDK
 *
 * Uses the provider registry for embedding model access.
 * Workers AI provides free embeddings via @cf/baai/bge-base-en-v1.5.
 *
 * @example
 * import { embedText, embedMany, findSimilar } from '@/server/lib/ai/embeddings'
 *
 * const vector = await embedText(env, 'search query')
 * const vectors = await embedBatch(env, ['doc1', 'doc2'])
 * const similar = findSimilar(queryVector, docVectors, 5)
 */
import { embed, embedMany as sdkEmbedMany, cosineSimilarity } from 'ai'
import { buildRegistry } from './providers'
import type { ProviderEnv } from './providers'

/** Default embedding model — Workers AI, free, no key needed */
const DEFAULT_EMBEDDING_MODEL = 'cf:@cf/baai/bge-base-en-v1.5'

/**
 * Generate a single embedding vector for a text string.
 */
export async function embedText(env: ProviderEnv, text: string, modelId?: string) {
  const registry = buildRegistry(env)
  const { embedding } = await embed({
    model: registry.embeddingModel((modelId || DEFAULT_EMBEDDING_MODEL) as `${string}:${string}`),
    value: text,
  })
  return embedding
}

/**
 * Generate embedding vectors for multiple texts in batch.
 */
export async function embedBatch(env: ProviderEnv, texts: string[], modelId?: string) {
  const registry = buildRegistry(env)
  const { embeddings } = await sdkEmbedMany({
    model: registry.embeddingModel((modelId || DEFAULT_EMBEDDING_MODEL) as `${string}:${string}`),
    values: texts,
  })
  return embeddings
}

/**
 * Find the most similar items from a collection using cosine similarity.
 * Returns items sorted by similarity (highest first).
 */
export function findSimilar<T>(
  queryEmbedding: number[],
  items: Array<{ embedding: number[]; data: T }>,
  topK: number = 5
): Array<{ data: T; similarity: number }> {
  return items
    .map((item) => ({
      data: item.data,
      similarity: cosineSimilarity(queryEmbedding, item.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}

export { cosineSimilarity }
