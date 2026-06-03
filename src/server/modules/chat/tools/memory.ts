/**
 * Memory Tools — per-user persistent facts
 *
 * Wraps the user_meta table as AI tools. Lets the agent remember
 * facts across conversations: preferences, context, learned info.
 * All 4 tools on canonical ToolDefinition contract (Phase 0).
 *
 * @example
 * AI: "I'll remember that your dog is named Rex"
 * → remember({ key: 'pet.name', value: 'Rex', description: "User's dog" })
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, like } from 'drizzle-orm'
import { Brain, Search, Trash2, BookOpen } from 'lucide-react'
import { userMeta } from '@/server/modules/user-meta/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

function getDB(ctx: AgentContext): D1Database {
  return (ctx.env as unknown as { DB: D1Database }).DB
}

// ─── remember ───────────────────────────────────────────────────

export const rememberDefinition: ToolDefinition<
  { key: string; value: string; description?: string },
  { key: string; value: string; action: 'created' | 'updated' } | { error: string }
> = {
  name: 'remember',
  description:
    'Save a fact to long-term memory for this user. Use when the user tells you personal info, preferences, or context you should remember across conversations.',
  inputSchema: z.object({
    key: z
      .string()
      .describe(
        'Short identifier for this memory (e.g. "pet.name", "preferences.theme", "projects.current")'
      ),
    value: z.string().describe('The fact to remember (will be JSON-stringified if complex)'),
    description: z.string().optional().describe('Why this was saved (helps future searches)'),
  }),
  outputSchema: z.union([
    z.object({
      key: z.string(),
      value: z.string(),
      action: z.enum(['created', 'updated']),
    }),
    z.object({ error: z.string() }),
  ]),
  execute: async ({ key, value, description }, ctx) => {
    try {
      const db = drizzle(getDB(ctx))
      const existing = await db
        .select({ id: userMeta.id })
        .from(userMeta)
        .where(and(eq(userMeta.userId, ctx.userId), eq(userMeta.key, key)))
        .get()

      const valueJson = JSON.stringify(description ? { value, description } : { value })
      const now = new Date()

      if (existing) {
        await db
          .update(userMeta)
          .set({ value: valueJson, updatedAt: now })
          .where(eq(userMeta.id, existing.id))
        return { key, value, action: 'updated' as const }
      }
      await db
        .insert(userMeta)
        .values({ userId: ctx.userId, key, value: valueJson, updatedAt: now })
      return { key, value, action: 'created' as const }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: {
    icon: Brain,
    displayName: 'Remember',
    summary: (output) => {
      if ('error' in output) return 'failed'
      return output.action
    },
  },
}

// ─── recall ─────────────────────────────────────────────────────

const RecallOutput = z.union([
  z.object({ key: z.string(), found: z.literal(false) }),
  z
    .object({
      key: z.string(),
      found: z.literal(true),
      value: z.unknown().optional(),
      description: z.string().optional(),
      updatedAt: z.unknown().optional(),
    })
    .passthrough(),
  z.object({ key: z.string(), error: z.string() }),
])

export const recallDefinition: ToolDefinition<{ key: string }, z.infer<typeof RecallOutput>> = {
  name: 'recall',
  description:
    'Retrieve a specific fact from memory by key. Use when you need to check something the user told you before.',
  inputSchema: z.object({
    key: z.string().describe('The memory key to look up (e.g. "pet.name")'),
  }),
  outputSchema: RecallOutput,
  execute: async ({ key }, ctx) => {
    try {
      const db = drizzle(getDB(ctx))
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
  render: { icon: BookOpen, displayName: 'Recall' },
}

// ─── search_memory ──────────────────────────────────────────────

const SearchMemoryOutput = z.union([
  z.object({
    query: z.string(),
    results: z.array(z.record(z.string(), z.unknown())),
    count: z.number(),
  }),
  z.object({ query: z.string(), error: z.string() }),
])

export const searchMemoryDefinition: ToolDefinition<
  { query: string },
  z.infer<typeof SearchMemoryOutput>
> = {
  name: 'search_memory',
  description:
    'Search memory by substring match on keys. Use to discover what you remember about a topic (e.g. search "project" to find all project-related facts).',
  inputSchema: z.object({
    query: z.string().describe('Search term — matches against memory keys'),
  }),
  outputSchema: SearchMemoryOutput,
  execute: async ({ query }, ctx) => {
    try {
      const db = drizzle(getDB(ctx))
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
  render: { icon: Search, displayName: 'Search Memory' },
}

// ─── forget ─────────────────────────────────────────────────────

export const forgetDefinition: ToolDefinition<
  { key: string },
  { key: string; deleted: boolean } | { key: string; error: string }
> = {
  name: 'forget',
  description:
    'Delete a fact from memory. Use when the user asks you to forget something or when a fact becomes invalid. Requires user approval.',
  inputSchema: z.object({
    key: z.string().describe('The memory key to delete'),
  }),
  outputSchema: z.union([
    z.object({ key: z.string(), deleted: z.boolean() }),
    z.object({ key: z.string(), error: z.string() }),
  ]),
  needsApproval: true,
  execute: async ({ key }, ctx) => {
    try {
      const db = drizzle(getDB(ctx))
      await db.delete(userMeta).where(and(eq(userMeta.userId, ctx.userId), eq(userMeta.key, key)))
      return { key, deleted: true }
    } catch (error) {
      return { key, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Trash2, displayName: 'Forget' },
}

export const memoryDefinitions = [
  rememberDefinition,
  recallDefinition,
  searchMemoryDefinition,
  forgetDefinition,
] as ToolDefinition<unknown, unknown>[]
