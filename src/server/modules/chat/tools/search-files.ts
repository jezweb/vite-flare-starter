/**
 * search_files — semantic search over the user's ingested files (Phase 4).
 *
 * Requires the VECTORS binding. Returns ranked excerpts with file metadata
 * the agent can cite. Filters by userId so one user's files never leak
 * into another user's retrieval — this is critical even though files are
 * already scoped by R2 prefix.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { inArray } from 'drizzle-orm'
import { embedText } from '@/server/lib/ai/embeddings'
import { files } from '@/server/modules/files/db/schema'
import type { ProviderEnv } from '@/server/lib/ai/providers'

interface SearchFilesCtx {
  env: ProviderEnv & {
    DB: D1Database
    VECTORS?: VectorizeIndex
  }
  userId: string
}

export function buildSearchFilesTools(ctx: SearchFilesCtx) {
  if (!ctx.env.VECTORS) return {}

  return {
    search_files: tool({
      description:
        "Search the user's uploaded files by meaning. Returns the most relevant excerpts with file name, chunk index, and similarity score. Use before answering any question that might benefit from the user's own documents (e.g. 'what does my invoice say', 'summarise the uploaded PDF', 'find the bit about X in my notes'). Results are scoped to the current user only.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(500)
          .describe('Natural-language description of what you are looking for'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .optional()
          .describe('Max number of excerpts to return (default 5)'),
        fileId: z
          .string()
          .optional()
          .describe('Restrict search to one file ID. Use when the user is asking about a specific file.'),
      }),
      execute: async ({ query, limit = 5, fileId }) => {
        try {
          const queryEmbedding = await embedText(ctx.env, query)

          const filter: VectorizeVectorMetadataFilter = {
            userId: ctx.userId,
            type: 'file',
          }
          if (fileId) filter['fileId'] = fileId

          const vectorResults = await ctx.env.VECTORS!.query(queryEmbedding, {
            topK: limit,
            filter,
            returnMetadata: 'all',
          })

          if (vectorResults.matches.length === 0) {
            return {
              query,
              results: [],
              message:
                "No indexed content matched this query. The user may not have uploaded any files yet, or the files aren't indexed. Check Files → Indexed to see which files are searchable.",
            }
          }

          // Enrich with file metadata (folder, size, updatedAt) from D1.
          const fileIds = Array.from(
            new Set(
              vectorResults.matches.map(
                (m) => (m.metadata as Record<string, unknown>)?.['fileId'] as string,
              ),
            ),
          ).filter(Boolean)

          const db = drizzle(ctx.env.DB)
          const rows = fileIds.length
            ? await db
                .select({
                  id: files.id,
                  name: files.name,
                  folder: files.folder,
                  mimeType: files.mimeType,
                  updatedAt: files.updatedAt,
                })
                .from(files)
                .where(inArray(files.id, fileIds))
            : []
          const byId = new Map(rows.map((r) => [r.id, r]))

          return {
            query,
            results: vectorResults.matches.map((m) => {
              const meta = (m.metadata ?? {}) as Record<string, unknown>
              const fid = meta['fileId'] as string
              const file = byId.get(fid)
              return {
                fileId: fid,
                fileName: file?.name ?? (meta['fileName'] as string | undefined) ?? 'unknown',
                folder: file?.folder ?? '/',
                mimeType: file?.mimeType ?? (meta['mimeType'] as string | undefined) ?? null,
                chunkIndex: meta['chunkIndex'] as number | undefined,
                excerpt: meta['excerpt'] as string | undefined,
                similarity: Math.round(m.score * 100) / 100,
              }
            }),
          }
        } catch (err) {
          return {
            query,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
    }),
  }
}
