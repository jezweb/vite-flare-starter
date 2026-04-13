/**
 * Session Tools — conversation history and self-management
 *
 * Lets the agent view its own usage stats, recent activity,
 * and manage the current session. For full conversation search,
 * a conversations table would be needed (future enhancement).
 */
import { tool } from 'ai'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, sql } from 'drizzle-orm'
import { aiUsageLogs } from '../db/schema'
import { userMeta } from '@/server/modules/user-meta/db/schema'

interface SessionContext {
  db: D1Database
  userId: string
}

export function buildSessionTools(ctx: SessionContext) {
  return {
    session_stats: tool({
      description: 'View your usage statistics — total conversations, tokens used, most-used models, recent activity. Use when the user asks about their usage, history, or "how much have I used?".',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const db = drizzle(ctx.db)

          const [totals] = await db
            .select({
              totalRequests: sql<number>`count(*)`,
              totalTokens: sql<number>`coalesce(sum(${aiUsageLogs.totalTokens}), 0)`,
              avgTokens: sql<number>`coalesce(avg(${aiUsageLogs.totalTokens}), 0)`,
              avgDuration: sql<number>`coalesce(avg(${aiUsageLogs.durationMs}), 0)`,
            })
            .from(aiUsageLogs)
            .where(eq(aiUsageLogs.userId, ctx.userId))

          const modelUsage = await db
            .select({
              model: aiUsageLogs.model,
              count: sql<number>`count(*)`,
              tokens: sql<number>`sum(${aiUsageLogs.totalTokens})`,
            })
            .from(aiUsageLogs)
            .where(eq(aiUsageLogs.userId, ctx.userId))
            .groupBy(aiUsageLogs.model)
            .orderBy(desc(sql`count(*)`))
            .limit(5)

          const recent = await db
            .select({
              model: aiUsageLogs.model,
              tokens: aiUsageLogs.totalTokens,
              durationMs: aiUsageLogs.durationMs,
              createdAt: aiUsageLogs.createdAt,
            })
            .from(aiUsageLogs)
            .where(eq(aiUsageLogs.userId, ctx.userId))
            .orderBy(desc(aiUsageLogs.createdAt))
            .limit(10)

          return {
            totals: {
              requests: totals?.totalRequests ?? 0,
              totalTokens: totals?.totalTokens ?? 0,
              avgTokensPerRequest: Math.round(totals?.avgTokens ?? 0),
              avgDurationMs: Math.round(totals?.avgDuration ?? 0),
            },
            topModels: modelUsage,
            recentActivity: recent.map((r) => ({
              ...r,
              createdAt: r.createdAt ? new Date(r.createdAt as unknown as number).toISOString() : null,
            })),
          }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    search_memories: tool({
      description: 'Search all saved memories/facts for this user. Unlike recall (which needs an exact key), this searches across all keys and values. Use to find everything the agent knows about the user or a topic.',
      inputSchema: z.object({
        query: z.string().describe('Search term — matches against memory keys and values'),
      }),
      execute: async ({ query }) => {
        try {
          const db = drizzle(ctx.db)

          // Search both keys and values
          const byKey = await db
            .select({ key: userMeta.key, value: userMeta.value, updatedAt: userMeta.updatedAt })
            .from(userMeta)
            .where(sql`${userMeta.userId} = ${ctx.userId} AND (${userMeta.key} LIKE ${'%' + query + '%'} OR ${userMeta.value} LIKE ${'%' + query + '%'})`)
            .limit(20)

          const items = byKey.map((row) => {
            try {
              const parsed = JSON.parse(row.value)
              return { key: row.key, ...parsed, updatedAt: row.updatedAt }
            } catch {
              return { key: row.key, value: row.value, updatedAt: row.updatedAt }
            }
          })

          return { query, results: items, count: items.length }
        } catch (error) {
          return { query, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    list_all_memories: tool({
      description: 'List all saved memories/facts for this user. Shows every key-value pair the agent has stored. Use to review what the agent remembers, or to help the user see all their saved context.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const db = drizzle(ctx.db)
          const rows = await db
            .select({ key: userMeta.key, value: userMeta.value, updatedAt: userMeta.updatedAt })
            .from(userMeta)
            .where(eq(userMeta.userId, ctx.userId))
            .orderBy(userMeta.key)

          const items = rows.map((row) => {
            try {
              const parsed = JSON.parse(row.value)
              return { key: row.key, ...parsed, updatedAt: row.updatedAt }
            } catch {
              return { key: row.key, value: row.value, updatedAt: row.updatedAt }
            }
          })

          return { memories: items, count: items.length }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
