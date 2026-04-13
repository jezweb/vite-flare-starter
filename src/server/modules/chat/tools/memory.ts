/**
 * Memory Tools — per-user persistent facts
 *
 * Wraps the user_meta table as AI tools. Lets the agent remember
 * facts across conversations: preferences, context, learned info.
 *
 * @example
 * AI: "I'll remember that your dog is named Rex"
 * → remember({ key: 'pet.name', value: 'Rex', description: "User's dog" })
 *
 * AI: "What's your dog's name?"
 * → recall({ key: 'pet.name' }) → 'Rex'
 */
import { tool } from 'ai'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, like } from 'drizzle-orm'
import { userMeta } from '@/server/modules/user-meta/db/schema'

interface MemoryContext {
  db: D1Database
  userId: string
}

export function buildMemoryTools(ctx: MemoryContext) {
  return {
    remember: tool({
      description: 'Save a fact to long-term memory for this user. Use when the user tells you personal info, preferences, or context you should remember across conversations.',
      inputSchema: z.object({
        key: z.string().describe('Short identifier for this memory (e.g. "pet.name", "preferences.theme", "projects.current")'),
        value: z.string().describe('The fact to remember (will be JSON-stringified if complex)'),
        description: z.string().optional().describe('Why this was saved (helps future searches)'),
      }),
      execute: async ({ key, value, description }) => {
        try {
          const db = drizzle(ctx.db)
          const existing = await db
            .select({ id: userMeta.id })
            .from(userMeta)
            .where(and(eq(userMeta.userId, ctx.userId), eq(userMeta.key, key)))
            .get()

          const valueJson = JSON.stringify(description ? { value, description } : { value })
          const now = new Date()

          if (existing) {
            await db.update(userMeta).set({ value: valueJson, updatedAt: now }).where(eq(userMeta.id, existing.id))
            return { key, value, action: 'updated' }
          }
          await db.insert(userMeta).values({ userId: ctx.userId, key, value: valueJson, updatedAt: now })
          return { key, value, action: 'created' }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    recall: tool({
      description: 'Retrieve a specific fact from memory by key. Use when you need to check something the user told you before.',
      inputSchema: z.object({
        key: z.string().describe('The memory key to look up (e.g. "pet.name")'),
      }),
      execute: async ({ key }) => {
        try {
          const db = drizzle(ctx.db)
          const row = await db
            .select({ value: userMeta.value, updatedAt: userMeta.updatedAt })
            .from(userMeta)
            .where(and(eq(userMeta.userId, ctx.userId), eq(userMeta.key, key)))
            .get()

          if (!row) return { key, found: false }

          try {
            const parsed = JSON.parse(row.value)
            return { key, found: true, ...parsed, updatedAt: row.updatedAt }
          } catch {
            return { key, found: true, value: row.value, updatedAt: row.updatedAt }
          }
        } catch (error) {
          return { key, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    search_memory: tool({
      description: 'Search memory by substring match on keys. Use to discover what you remember about a topic (e.g. search "project" to find all project-related facts).',
      inputSchema: z.object({
        query: z.string().describe('Search term — matches against memory keys'),
      }),
      execute: async ({ query }) => {
        try {
          const db = drizzle(ctx.db)
          const rows = await db
            .select({ key: userMeta.key, value: userMeta.value, updatedAt: userMeta.updatedAt })
            .from(userMeta)
            .where(and(eq(userMeta.userId, ctx.userId), like(userMeta.key, `%${query}%`)))
            .limit(20)

          const items = rows.map((row) => {
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

    forget: tool({
      description: 'Delete a fact from memory. Use when the user asks you to forget something or when a fact becomes invalid. Requires user approval.',
      inputSchema: z.object({
        key: z.string().describe('The memory key to delete'),
      }),
      needsApproval: true,
      execute: async ({ key }) => {
        try {
          const db = drizzle(ctx.db)
          await db.delete(userMeta).where(and(eq(userMeta.userId, ctx.userId), eq(userMeta.key, key)))
          return { key, deleted: true }
        } catch (error) {
          return { key, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
