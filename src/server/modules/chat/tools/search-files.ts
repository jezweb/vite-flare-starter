/**
 * search_files — semantic search over the user's ingested files.
 *
 * Requires the VECTORS binding. Returns ranked excerpts with file metadata
 * the agent can cite. Filters by userId so one user's files never leak
 * into another user's retrieval.
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { inArray } from 'drizzle-orm'
import { FileSearch } from 'lucide-react'
import { embedText } from '@/server/lib/ai/embeddings'
import { files } from '@/server/modules/files/db/schema'
import type { ProviderEnv } from '@/server/lib/ai/providers'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

type SearchFilesEnv = ProviderEnv & {
  DB: D1Database
  VECTORS?: VectorizeIndex
}

function getEnv(ctx: AgentContext): SearchFilesEnv {
  return ctx.env as unknown as SearchFilesEnv
}

const SearchFilesOutput = z.union([
  z.object({
    query: z.string(),
    results: z.array(
      z.object({
        fileId: z.string(),
        fileName: z.string(),
        folder: z.string(),
        mimeType: z.string().nullable(),
        chunkIndex: z.number().optional(),
        excerpt: z.string().optional(),
        similarity: z.number(),
      })
    ),
    message: z.string().optional(),
  }),
  z.object({ query: z.string(), error: z.string() }),
])

export const searchFilesDefinition: ToolDefinition<
  { query: string; limit?: number; fileId?: string },
  z.infer<typeof SearchFilesOutput>
> = {
  name: 'search_files',
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
      .describe(
        'Restrict search to one file ID. Use when the user is asking about a specific file.'
      ),
  }),
  outputSchema: SearchFilesOutput,
  isAvailable: (ctx) => !!getEnv(ctx).VECTORS,
  execute: async ({ query, limit = 5, fileId }, ctx) => {
    const env = getEnv(ctx)
    try {
      const queryEmbedding = await embedText(env, query)

      const filter: VectorizeVectorMetadataFilter = {
        userId: ctx.userId,
        type: 'file',
      }
      if (fileId) filter['fileId'] = fileId

      const vectorResults = await env.VECTORS!.query(queryEmbedding, {
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

      const fileIds = Array.from(
        new Set(
          vectorResults.matches.map(
            (m) => (m.metadata as Record<string, unknown>)?.['fileId'] as string
          )
        )
      ).filter(Boolean)

      const db = drizzle(env.DB)
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
  render: { icon: FileSearch, displayName: 'Search Files' },
}

export const searchFilesDefinitions = [searchFilesDefinition] as ToolDefinition<unknown, unknown>[]
