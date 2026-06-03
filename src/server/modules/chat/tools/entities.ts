/**
 * Entity tools — agent-callable CRUD over the generic entities table
 *
 * Use these when an agent needs to create / update / list / get
 * tracked items (tickets, deals, contacts, projects, anything with
 * a status). The tools are scoped to the agent's owner via
 * `ctx.userId`, so an agent can never read or modify another user's
 * entities.
 *
 * For CRM / Atlassian-style apps, this is the agent's "world model"
 * — the persistent place it knows about tickets, customers, deals,
 * etc. Pair with: existing memory blocks for short-term context,
 * Vectorize-via-recallSemantic for long-term semantic recall, and
 * the entities table for structured records the agent acts on.
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, like, or } from 'drizzle-orm'
import { Database, FilePlus, FilePen, ListChecks, FileSearch } from 'lucide-react'
import { entities } from '@/server/modules/entities/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

interface EntityEnv {
  DB: D1Database
}

function getDb(ctx: AgentContext): D1Database | undefined {
  return (ctx.env as Partial<EntityEnv>).DB
}

const entitiesAvailable = (ctx: AgentContext) => !!getDb(ctx)

const NAME_RE = /^[a-zA-Z0-9_-]+$/

function parseFields(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function serialiseRow(row: typeof entities.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    externalId: row.externalId,
    assigneeId: row.assigneeId,
    fields: parseFields(row.fields),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─── entity_create ───────────────────────────────────────────────

const EntityCreateInput = z.object({
  type: z.string().min(1).max(50).regex(NAME_RE).describe('e.g. "ticket", "deal", "contact"'),
  title: z.string().min(1).max(500).describe('Display title — what the user sees in lists'),
  status: z
    .string()
    .max(50)
    .regex(NAME_RE)
    .optional()
    .describe('Initial state. Defaults to "open".'),
  externalId: z
    .string()
    .max(200)
    .optional()
    .describe('Correlation id for external systems (Stripe customer, GitHub PR)'),
  fields: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Type-specific fields (priority, amount, contact_email, etc)'),
})

const EntityRowOutput = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  status: z.string(),
  externalId: z.string().nullable(),
  assigneeId: z.string().nullable(),
  fields: z.record(z.string(), z.unknown()),
  createdAt: z.number(),
  updatedAt: z.number(),
})

const EntityCreateOutput = z.union([EntityRowOutput, z.object({ error: z.string() })])

export const entityCreateDefinition: ToolDefinition<
  z.infer<typeof EntityCreateInput>,
  z.infer<typeof EntityCreateOutput>
> = {
  name: 'entity_create',
  description:
    "Create a tracked entity (ticket, deal, contact, etc) in the user's entities store. Returns the created row including its id. Use when the user asks you to record something they want to track.",
  inputSchema: EntityCreateInput,
  outputSchema: EntityCreateOutput,
  isAvailable: entitiesAvailable,
  needsApproval: true,
  execute: async (input, ctx) => {
    const db = drizzle(getDb(ctx)!)
    const id = crypto.randomUUID()
    await db.insert(entities).values({
      id,
      userId: ctx.userId,
      type: input.type,
      title: input.title,
      ...(input.status !== undefined && { status: input.status }),
      ...(input.externalId !== undefined && { externalId: input.externalId }),
      ...(input.fields !== undefined && { fields: JSON.stringify(input.fields) }),
    })
    const [row] = await db.select().from(entities).where(eq(entities.id, id)).limit(1)
    if (!row) return { error: 'Insert succeeded but row not found' }
    return serialiseRow(row)
  },
  render: { icon: FilePlus, displayName: 'Create Entity' },
}

// ─── entity_update ───────────────────────────────────────────────

const EntityUpdateInput = z.object({
  id: z.string(),
  title: z.string().min(1).max(500).optional(),
  status: z.string().max(50).regex(NAME_RE).optional(),
  externalId: z.string().max(200).nullable().optional(),
  /** Merged into existing fields. Pass null per key to clear. */
  fields: z.record(z.string(), z.unknown()).optional(),
})

export const entityUpdateDefinition: ToolDefinition<
  z.infer<typeof EntityUpdateInput>,
  z.infer<typeof EntityCreateOutput>
> = {
  name: 'entity_update',
  description:
    'Update a tracked entity by id (partial). Use to change status (e.g. "open" → "in_progress"), update fields, rename, etc. Always preserves untouched fields.',
  inputSchema: EntityUpdateInput,
  needsApproval: true,
  outputSchema: EntityCreateOutput,
  isAvailable: entitiesAvailable,
  execute: async ({ id, title, status, externalId, fields }, ctx) => {
    const db = drizzle(getDb(ctx)!)
    const [existing] = await db
      .select()
      .from(entities)
      .where(and(eq(entities.id, id), eq(entities.userId, ctx.userId)))
      .limit(1)
    if (!existing) return { error: `Entity ${id} not found` }

    const updates: Record<string, unknown> = {
      updatedAt: Math.floor(Date.now() / 1000),
    }
    if (title !== undefined) updates['title'] = title
    if (status !== undefined) updates['status'] = status
    if (externalId !== undefined) updates['externalId'] = externalId
    if (fields !== undefined) {
      const merged = parseFields(existing.fields)
      for (const [k, v] of Object.entries(fields)) {
        if (v === null) delete merged[k]
        else merged[k] = v
      }
      updates['fields'] = JSON.stringify(merged)
    }
    await db.update(entities).set(updates).where(eq(entities.id, id))
    const [row] = await db.select().from(entities).where(eq(entities.id, id)).limit(1)
    if (!row) return { error: 'Update succeeded but row vanished' }
    return serialiseRow(row)
  },
  render: { icon: FilePen, displayName: 'Update Entity' },
}

// ─── entity_get ──────────────────────────────────────────────────

export const entityGetDefinition: ToolDefinition<
  { id: string },
  z.infer<typeof EntityCreateOutput>
> = {
  name: 'entity_get',
  description: 'Fetch a single entity by id. Returns its current state including fields.',
  inputSchema: z.object({ id: z.string() }),
  outputSchema: EntityCreateOutput,
  isAvailable: entitiesAvailable,
  execute: async ({ id }, ctx) => {
    const db = drizzle(getDb(ctx)!)
    const [row] = await db
      .select()
      .from(entities)
      .where(and(eq(entities.id, id), eq(entities.userId, ctx.userId)))
      .limit(1)
    if (!row) return { error: `Entity ${id} not found` }
    return serialiseRow(row)
  },
  render: { icon: Database, displayName: 'Get Entity' },
}

// ─── entity_list ─────────────────────────────────────────────────

const EntityListInput = z.object({
  type: z.string().regex(NAME_RE).describe('Required — list scoped to one entity type at a time'),
  status: z.string().regex(NAME_RE).optional(),
  q: z.string().min(1).max(200).optional().describe('LIKE search across title + externalId'),
  limit: z.number().int().min(1).max(200).optional(),
})

const EntityListOutput = z.object({
  total: z.number(),
  entities: z.array(EntityRowOutput),
})

export const entityListDefinition: ToolDefinition<
  z.infer<typeof EntityListInput>,
  z.infer<typeof EntityListOutput>
> = {
  name: 'entity_list',
  description:
    'List entities of a given type, optionally filtered by status or a substring search. Returns most-recently-updated first. Default limit 50.',
  inputSchema: EntityListInput,
  outputSchema: EntityListOutput,
  isAvailable: entitiesAvailable,
  execute: async ({ type, status, q, limit = 50 }, ctx) => {
    const db = drizzle(getDb(ctx)!)
    const conditions = [eq(entities.userId, ctx.userId), eq(entities.type, type)]
    if (status) conditions.push(eq(entities.status, status))
    if (q) {
      const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`
      const orClause = or(like(entities.title, pattern), like(entities.externalId, pattern))
      if (orClause) conditions.push(orClause)
    }
    const rows = await db
      .select()
      .from(entities)
      .where(and(...conditions))
      .orderBy(desc(entities.updatedAt))
      .limit(limit)
    return {
      total: rows.length,
      entities: rows.map(serialiseRow),
    }
  },
  render: { icon: ListChecks, displayName: 'List Entities' },
}

// ─── entity_search (cross-type substring) ────────────────────────

const EntitySearchInput = z.object({
  q: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(100).optional(),
})

export const entitySearchDefinition: ToolDefinition<
  z.infer<typeof EntitySearchInput>,
  z.infer<typeof EntityListOutput>
> = {
  name: 'entity_search',
  description:
    "Search across ALL entity types by title / externalId substring. Use when the user mentions something by name and you don't know which type it is.",
  inputSchema: EntitySearchInput,
  outputSchema: EntityListOutput,
  isAvailable: entitiesAvailable,
  execute: async ({ q, limit = 25 }, ctx) => {
    const db = drizzle(getDb(ctx)!)
    const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`
    const orClause = or(like(entities.title, pattern), like(entities.externalId, pattern))
    if (!orClause) return { total: 0, entities: [] }
    const rows = await db
      .select()
      .from(entities)
      .where(and(eq(entities.userId, ctx.userId), orClause))
      .orderBy(desc(entities.updatedAt))
      .limit(limit)
    return {
      total: rows.length,
      entities: rows.map(serialiseRow),
    }
  },
  render: { icon: FileSearch, displayName: 'Search Entities' },
}

export const entityDefinitions = [
  entityCreateDefinition,
  entityUpdateDefinition,
  entityGetDefinition,
  entityListDefinition,
  entitySearchDefinition,
] as ToolDefinition<unknown, unknown>[]
