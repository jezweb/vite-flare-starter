/**
 * Multi-entry, three-scope memory tools.
 *
 * Distinct from the legacy `remember/recall` tools (user_meta key-value).
 * These tools operate on the structured `memories` table introduced in
 * Phase 0 of the projects-first-class build.
 *
 * Scope semantics:
 *   - 'project' — scoped to the current project (if any). Falls back to
 *     'user' if there's no active project.
 *   - 'user' — always scoped to the authenticated user.
 *   - 'org' — Phase 5 wires the user's active organisation; v1 ships
 *     project + user only.
 *
 * Privacy zones (is_private flag):
 *   - Excluded from auto-injection in the system prompt.
 *   - Returned by `memory_search` only when the agent passes
 *     `includePrivate: true` (default false).
 *   - Always returned by `load_memory(name)` (explicit request).
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, like, or } from 'drizzle-orm'
import { BookOpen, Brain, Search, PencilLine, Trash2 } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'
import { memories, MEMORY_SCOPES, MEMORY_TYPES } from '@/server/modules/memories/db/schema'

interface MemoryAgentContext extends AgentContext {
  projectId?: string | null
}

function getDB(ctx: AgentContext): D1Database {
  return (ctx.env as unknown as { DB: D1Database }).DB
}

function getUserId(ctx: AgentContext): string {
  return ctx.userId
}

function resolveScope(
  scope: 'project' | 'user' | 'org' | undefined,
  ctx: MemoryAgentContext
): { scope: 'project' | 'user' | 'org'; scopeId: string } | { error: string } {
  const userId = getUserId(ctx)
  const projectId = ctx.projectId ?? null

  if (scope === 'project') {
    if (!projectId) {
      return {
        error: 'No active project. Create or open a project first, or use scope: "user" instead.',
      }
    }
    return { scope: 'project', scopeId: projectId }
  }

  if (scope === 'org') {
    return {
      error: 'Org-scope memory is not yet wired (Phase 5). Use "project" or "user" scope.',
    }
  }

  // Default to user scope
  return { scope: 'user', scopeId: userId }
}

// ─── memory_search ────────────────────────────────────────────────

export const memorySearchDefinition: ToolDefinition<
  {
    query: string
    scope?: 'project' | 'user' | 'org'
    type?: 'fact' | 'preference' | 'decision' | 'context' | 'reference'
    includePrivate?: boolean
    limit?: number
  },
  { results: Array<{ id: string; name: string; description: string; type: string; scope: string }> }
> = {
  name: 'memory_search',
  description:
    'Search the multi-entry persistent memory. Returns matching memory entries (name + description + type only — fetch full content via load_memory). Scope defaults to user if omitted.',
  inputSchema: z.object({
    query: z.string().describe('Substring or keyword to match against name + description.'),
    scope: z
      .enum(MEMORY_SCOPES)
      .optional()
      .describe('Scope to search: "project" (current project), "user" (this user), or "org".'),
    type: z.enum(MEMORY_TYPES).optional().describe('Filter by memory type.'),
    includePrivate: z
      .boolean()
      .optional()
      .describe('When true, includes is_private=1 entries. Default false.'),
    limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10).'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        type: z.string(),
        scope: z.string(),
      })
    ),
  }),
  execute: async ({ query, scope, type, includePrivate, limit }, ctx) => {
    const resolved = resolveScope(scope, ctx as MemoryAgentContext)
    if ('error' in resolved) return { results: [] }

    const db = drizzle(getDB(ctx))
    const conditions = [eq(memories.scope, resolved.scope), eq(memories.scopeId, resolved.scopeId)]
    if (type) conditions.push(eq(memories.type, type))
    if (!includePrivate) conditions.push(eq(memories.isPrivate, 0))

    const pattern = `%${query}%`
    conditions.push(or(like(memories.name, pattern), like(memories.description, pattern))!)

    const rows = await db
      .select({
        id: memories.id,
        name: memories.name,
        description: memories.description,
        type: memories.type,
        scope: memories.scope,
      })
      .from(memories)
      .where(and(...conditions))
      .limit(limit ?? 10)

    return { results: rows }
  },
  render: {
    icon: Search,
    displayName: 'Memory search',
    summary: (output) =>
      `Found ${(output as { results?: unknown[] }).results?.length ?? 0} memory ${(output as { results?: unknown[] }).results?.length === 1 ? 'entry' : 'entries'}`,
  },
}

// ─── memory_add ───────────────────────────────────────────────────

export const memoryAddDefinition: ToolDefinition<
  {
    name: string
    description: string
    type: 'fact' | 'preference' | 'decision' | 'context' | 'reference'
    content: string
    scope?: 'project' | 'user' | 'org'
    isPrivate?: boolean
  },
  { id: string; success: boolean } | { error: string }
> = {
  name: 'memory_add',
  description:
    'Add a memory entry. Use when the user explicitly asks to remember something. Scope defaults to user. Set isPrivate=true for sensitive info that should NOT auto-inject (e.g. credentials hint, account numbers).',
  needsApproval: true,
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .max(80)
      .describe('Short slug ("preferred-tone", "client-john-billing"). Stable id for retrieval.'),
    description: z.string().min(1).max(200).describe('One-line summary shown in the memory index.'),
    type: z.enum(MEMORY_TYPES).describe('What kind of memory this is.'),
    content: z.string().min(1).max(8000).describe('The full memory body. Be specific.'),
    scope: z.enum(MEMORY_SCOPES).optional().describe('Default: user.'),
    isPrivate: z
      .boolean()
      .optional()
      .describe('When true, never auto-inject into system prompts. Use for sensitive info.'),
  }),
  outputSchema: z.union([
    z.object({ id: z.string(), success: z.boolean() }),
    z.object({ error: z.string() }),
  ]),
  execute: async (input, ctx) => {
    const resolved = resolveScope(input.scope, ctx as MemoryAgentContext)
    if ('error' in resolved) return { error: resolved.error }

    const db = drizzle(getDB(ctx))
    const id = crypto.randomUUID()
    const now = new Date()
    await db.insert(memories).values({
      id,
      scope: resolved.scope,
      scopeId: resolved.scopeId,
      name: input.name,
      description: input.description,
      type: input.type,
      content: input.content,
      isPrivate: input.isPrivate ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })

    return { id, success: true }
  },
  render: {
    icon: Brain,
    displayName: 'Add to memory',
    summary: (output) => {
      const o = output as { error?: string; id?: string }
      if (o.error) return `Error: ${o.error}`
      return 'Memory entry added'
    },
  },
}

// ─── memory_update ────────────────────────────────────────────────

export const memoryUpdateDefinition: ToolDefinition<
  {
    id: string
    name?: string
    description?: string
    type?: 'fact' | 'preference' | 'decision' | 'context' | 'reference'
    content?: string
    isPrivate?: boolean
  },
  { success: boolean } | { error: string }
> = {
  name: 'memory_update',
  description:
    'Update an existing memory entry by id. Use when the user corrects something you previously remembered, or when refining an existing entry.',
  inputSchema: z.object({
    id: z.string().describe('The memory entry id (from memory_search).'),
    name: z.string().min(1).max(80).optional(),
    description: z.string().min(1).max(200).optional(),
    type: z.enum(MEMORY_TYPES).optional(),
    content: z.string().min(1).max(8000).optional(),
    isPrivate: z.boolean().optional(),
  }),
  outputSchema: z.union([z.object({ success: z.boolean() }), z.object({ error: z.string() })]),
  needsApproval: true,
  execute: async (input, ctx) => {
    const db = drizzle(getDB(ctx))
    const userId = getUserId(ctx)
    const projectId = (ctx as MemoryAgentContext).projectId ?? null

    const [existing] = await db.select().from(memories).where(eq(memories.id, input.id)).limit(1)

    if (!existing) return { error: 'Memory not found' }

    // Authorise based on scope
    if (existing.scope === 'user' && existing.scopeId !== userId) {
      return { error: 'Forbidden: not your memory' }
    }
    if (existing.scope === 'project' && existing.scopeId !== projectId) {
      return { error: 'Forbidden: not in this project' }
    }

    const patch: Partial<typeof memories.$inferInsert> = { updatedAt: new Date() }
    if (input.name !== undefined) patch.name = input.name
    if (input.description !== undefined) patch.description = input.description
    if (input.type !== undefined) patch.type = input.type
    if (input.content !== undefined) patch.content = input.content
    if (input.isPrivate !== undefined) patch.isPrivate = input.isPrivate ? 1 : 0

    await db.update(memories).set(patch).where(eq(memories.id, input.id))
    return { success: true }
  },
  render: {
    icon: PencilLine,
    displayName: 'Update memory',
    summary: (output) => {
      const o = output as { error?: string }
      if (o.error) return `Error: ${o.error}`
      return 'Memory updated'
    },
  },
}

// ─── memory_remove ────────────────────────────────────────────────

export const memoryRemoveDefinition: ToolDefinition<
  { id: string },
  { success: boolean } | { error: string }
> = {
  name: 'memory_remove',
  description:
    'Delete a memory entry by id. Use when the user asks to forget something or when an entry is superseded.',
  inputSchema: z.object({
    id: z.string().describe('The memory entry id.'),
  }),
  outputSchema: z.union([z.object({ success: z.boolean() }), z.object({ error: z.string() })]),
  needsApproval: true,
  execute: async ({ id }, ctx) => {
    const db = drizzle(getDB(ctx))
    const userId = getUserId(ctx)
    const projectId = (ctx as MemoryAgentContext).projectId ?? null

    const [existing] = await db.select().from(memories).where(eq(memories.id, id)).limit(1)

    if (!existing) return { error: 'Memory not found' }

    if (existing.scope === 'user' && existing.scopeId !== userId) {
      return { error: 'Forbidden: not your memory' }
    }
    if (existing.scope === 'project' && existing.scopeId !== projectId) {
      return { error: 'Forbidden: not in this project' }
    }

    await db.delete(memories).where(eq(memories.id, id))
    return { success: true }
  },
  render: {
    icon: Trash2,
    displayName: 'Remove memory',
    summary: (output) => {
      const o = output as { error?: string }
      if (o.error) return `Error: ${o.error}`
      return 'Memory removed'
    },
  },
}

// ─── load_memory ──────────────────────────────────────────────────

export const loadMemoryDefinition: ToolDefinition<
  { name: string; scope?: 'project' | 'user' | 'org' },
  { content: string; description: string; type: string } | { error: string }
> = {
  name: 'load_memory',
  description:
    'Fetch the full content of a memory entry by name. The system-prompt overview shows only name+description; use this to load the body when relevant. Works for is_private entries too.',
  inputSchema: z.object({
    name: z.string().describe('The memory slug (e.g. "client-john-billing").'),
    scope: z.enum(MEMORY_SCOPES).optional().describe('Default: user.'),
  }),
  outputSchema: z.union([
    z.object({
      content: z.string(),
      description: z.string(),
      type: z.string(),
    }),
    z.object({ error: z.string() }),
  ]),
  execute: async ({ name, scope }, ctx) => {
    const resolved = resolveScope(scope, ctx as MemoryAgentContext)
    if ('error' in resolved) return { error: resolved.error }

    const db = drizzle(getDB(ctx))
    const [m] = await db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.scope, resolved.scope),
          eq(memories.scopeId, resolved.scopeId),
          eq(memories.name, name)
        )
      )
      .limit(1)

    if (!m) return { error: `No memory named "${name}" in ${resolved.scope} scope` }

    return {
      content: m.content,
      description: m.description,
      type: m.type,
    }
  },
  render: {
    icon: BookOpen,
    displayName: 'Load memory',
    summary: (output) => {
      const o = output as { error?: string; description?: string }
      if (o.error) return `Error: ${o.error}`
      return o.description ? `Loaded: ${o.description}` : 'Memory loaded'
    },
  },
}

export const memoriesMultiDefinitions = [
  memorySearchDefinition,
  memoryAddDefinition,
  memoryUpdateDefinition,
  memoryRemoveDefinition,
  loadMemoryDefinition,
] as ToolDefinition<unknown, unknown>[]
