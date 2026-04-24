/**
 * File ingest pipeline (Phase 4 — RAG)
 *
 *  R2 object  ->  convert to markdown  ->  chunk  ->  embed  ->  Vectorize upsert
 *
 * Called from:
 *  - Direct file upload (POST /api/files)
 *  - Save-to-Files action from chat attachments (existing route)
 *  - Re-index job (PATCH /api/files/:id/reindex)
 *
 * Degrades gracefully when Vectorize isn't configured — status stays `null`
 * and search_files falls back to metadata-only listing. Never throws.
 */
import { drizzle } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import { files } from './db/schema'
import { embedBatch } from '@/server/lib/ai/embeddings'
import { convertToMarkdown } from '@/server/lib/ai/documents'
import type { ProviderEnv } from '@/server/lib/ai/providers'

/** Target chunk length in characters (roughly 200-300 tokens). */
const CHUNK_SIZE = 1400
/** Overlap between neighbouring chunks — helps retrieval across boundaries. */
const CHUNK_OVERLAP = 200
/** Upper bound on chunks per file — anything larger probably shouldn't be ingested wholesale. */
const MAX_CHUNKS_PER_FILE = 200

export interface IngestEnv extends ProviderEnv {
  DB: D1Database
  FILES: R2Bucket
  AI: Ai
  VECTORS?: VectorizeIndex
}

export interface IngestResult {
  status: 'indexed' | 'skipped' | 'failed'
  chunks?: number
  reason?: string
  error?: string
}

/**
 * Index a file row: fetch R2 content, convert to markdown, chunk, embed,
 * upsert to Vectorize. Updates the files row with status + chunk count.
 */
export async function ingestFile(
  env: IngestEnv,
  fileId: string,
  userId: string,
): Promise<IngestResult> {
  const db = drizzle(env.DB)

  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .limit(1)

  if (!row) return { status: 'failed', error: 'File not found' }

  if (!env.VECTORS) {
    return { status: 'skipped', reason: 'Vectorize not configured — bind VECTORS to enable RAG.' }
  }

  // Mark the row as pending so the UI shows progress.
  await db
    .update(files)
    .set({ indexStatus: 'pending', indexError: null })
    .where(eq(files.id, fileId))

  try {
    const obj = await env.FILES.get(row.key)
    if (!obj) throw new Error(`R2 object missing at key ${row.key}`)

    // Convert to markdown — PDFs, images, docs, plain text all flow through
    // the same helper so the chunker gets text it can split.
    const arrayBuffer = await obj.arrayBuffer()
    const markdown = await convertToMarkdown(env, new Uint8Array(arrayBuffer), row.mimeType, {
      filename: row.name,
    })

    if (!markdown || !markdown.trim()) {
      throw new Error('No text content extracted — skipping index')
    }

    const chunks = chunkMarkdown(markdown, CHUNK_SIZE, CHUNK_OVERLAP).slice(0, MAX_CHUNKS_PER_FILE)
    if (chunks.length === 0) throw new Error('Chunking produced no output')

    // Delete any existing vectors for this file before re-indexing, so a
    // re-ingested file doesn't leave stale chunks behind.
    await deleteFileVectors(env, fileId, userId).catch(() => {
      // Best-effort; we'll still upsert new IDs below. Any orphans will be
      // cleaned by the full delete path.
    })

    const embeddings = await embedBatch(env, chunks)
    if (embeddings.length !== chunks.length) {
      throw new Error(`Embedding count mismatch: ${embeddings.length} vs ${chunks.length} chunks`)
    }

    const vectors = chunks.map((chunk, i) => ({
      id: `file:${userId}:${fileId}:${i}`,
      values: embeddings[i]!,
      metadata: {
        userId,
        fileId,
        chunkIndex: i,
        excerpt: chunk.slice(0, 500),
        mimeType: row.mimeType,
        fileName: row.name,
        type: 'file',
      } satisfies Record<string, string | number>,
    }))

    await env.VECTORS.upsert(vectors)

    await db
      .update(files)
      .set({
        indexStatus: 'indexed',
        indexedAt: new Date(),
        indexChunks: chunks.length,
        indexError: null,
      })
      .where(eq(files.id, fileId))

    return { status: 'indexed', chunks: chunks.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(files)
      .set({
        indexStatus: 'failed',
        indexError: message.slice(0, 500),
      })
      .where(eq(files.id, fileId))
    console.error(
      JSON.stringify({
        event: 'file_ingest_failed',
        fileId,
        userId,
        error: message,
      }),
    )
    return { status: 'failed', error: message }
  }
}

/**
 * Delete all Vectorize entries for a given file. Call on file delete and
 * before re-indexing so stale chunks don't leak into future searches.
 */
export async function deleteFileVectors(
  env: IngestEnv,
  fileId: string,
  userId: string,
): Promise<void> {
  if (!env.VECTORS) return
  const db = drizzle(env.DB)
  const row = await db
    .select({ indexChunks: files.indexChunks })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .get()
  const chunkCount = row?.indexChunks ?? 0
  if (chunkCount === 0) return

  // Vectorize doesn't support wildcard deletes; we build the ID range we wrote.
  const ids: string[] = []
  for (let i = 0; i < chunkCount; i++) {
    ids.push(`file:${userId}:${fileId}:${i}`)
  }
  // Delete in batches of 100 (Vectorize soft limit)
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    await env.VECTORS.deleteByIds(batch)
  }
}

/**
 * Character-based chunker with overlap. Prefers to split on paragraph or
 * newline boundaries so chunks don't end mid-sentence.
 */
export function chunkMarkdown(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = []
  const trimmed = text.trim()
  if (trimmed.length <= size) return [trimmed]

  let start = 0
  while (start < trimmed.length) {
    let end = Math.min(start + size, trimmed.length)
    // If we're not at the end, try to find a paragraph break within the last
    // 200 chars of the window to avoid splitting mid-sentence.
    if (end < trimmed.length) {
      const tail = trimmed.slice(end - 200, end)
      const paraBreak = tail.lastIndexOf('\n\n')
      const lineBreak = tail.lastIndexOf('\n')
      const sentenceEnd = Math.max(tail.lastIndexOf('. '), tail.lastIndexOf('! '), tail.lastIndexOf('? '))
      const boundary = paraBreak !== -1 ? paraBreak : lineBreak !== -1 ? lineBreak : sentenceEnd
      if (boundary !== -1) end = end - 200 + boundary + 1
    }
    const chunk = trimmed.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= trimmed.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks
}
