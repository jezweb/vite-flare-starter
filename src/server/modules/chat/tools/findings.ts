/**
 * Finding + learning tools — agent's "I noticed something" primitive.
 *
 * Adopted from goanna's two-stage memory pipeline:
 *   - `findings/`  — surfaced patterns waiting for graduation
 *   - `learnings/` — graduated patterns; the wiki the agent accumulates
 *
 * Storage: both live in the generic `entities` table with `type='finding'`
 * or `type='learning'`. No schema migration. Fields-blob shape:
 *
 *     fields = {
 *       body: string,              // the observation / pattern
 *       category?: string,         // ux / perf / auth / data / etc.
 *       tags?: string[],
 *       agentClass?: string,       // who recorded it (defaults to caller)
 *       agentName?: string,
 *       recurrenceCount: number,   // bumped on repeat — see promote logic
 *       sourceFindingId?: string,  // (learnings only) — lineage pointer
 *       promotedAt?: number,       // (findings only) — when graduated
 *       dismissedReason?: string,  // (findings only) — why dropped
 *     }
 *
 * Statuses (on findings):
 *   open → recurred → promoted | dismissed | resolved | archived
 *
 * Reflect skill (slice 3) drives the status transitions; the agent
 * itself only writes new findings + queries existing ones.
 *
 * See `.jez/artifacts/goanna-adoption-plan-2026-05-04.md` and
 * `~/Documents/goanna/SPEC.md` for the broader rationale.
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, sql } from 'drizzle-orm'
import { Lightbulb, BookOpen, Trash2 } from 'lucide-react'
import { entities } from '@/server/modules/entities/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

interface FindingsEnv {
  DB: D1Database
}

function getDb(ctx: AgentContext): D1Database | undefined {
  return (ctx.env as Partial<FindingsEnv>).DB
}

const findingsAvailable = (ctx: AgentContext) => !!getDb(ctx)

const FINDING_STATUSES = [
  'open',
  'recurred',
  'promoted',
  'dismissed',
  'resolved',
  'archived',
] as const

type FindingFields = {
  body: string
  category?: string
  tags?: string[]
  agentClass?: string
  agentName?: string
  recurrenceCount?: number
  sourceFindingId?: string
  promotedAt?: number
  dismissedReason?: string
}

function parseFields(raw: string): FindingFields {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as FindingFields) : { body: '' }
  } catch {
    return { body: '' }
  }
}

function deriveTitle(body: string): string {
  // Title = first line, capped to 200 chars.
  const firstLine = body.split('\n', 1)[0]?.trim() ?? body.trim()
  return firstLine.slice(0, 200) || body.slice(0, 200)
}

// ─── record_finding ──────────────────────────────────────────────

const RecordFindingInput = z.object({
  body: z
    .string()
    .min(10)
    .max(4000)
    .describe(
      'The observation. 1-3 paragraphs. Lead with the pattern; add context only if non-obvious. Markdown ok.',
    ),
  category: z
    .string()
    .max(50)
    .optional()
    .describe('Optional grouping (e.g. "ux", "perf", "auth", "data")'),
  tags: z
    .array(z.string().max(40))
    .max(10)
    .optional()
    .describe('Free-form tags for filtering'),
})

const FindingRowOutput = z.object({
  id: z.string(),
  status: z.enum(FINDING_STATUSES),
  title: z.string(),
  body: z.string(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  agentClass: z.string().nullable(),
  agentName: z.string().nullable(),
  recurrenceCount: z.number(),
  createdAt: z.number(),
})

const RecordFindingOutput = z.union([
  FindingRowOutput,
  z.object({ error: z.string() }),
])

export const recordFindingDefinition: ToolDefinition<
  z.infer<typeof RecordFindingInput>,
  z.infer<typeof RecordFindingOutput>
> = {
  name: 'record_finding',
  description:
    'Record an observation, gotcha, or surfaced pattern noticed during work. Writes to the user\'s findings store. Use when you spot something worth remembering — a recurring user pain point, a non-obvious workaround, an inconsistency. Don\'t use for everyday completions ("things went normally"); only for things future agents would benefit from knowing.',
  inputSchema: RecordFindingInput,
  outputSchema: RecordFindingOutput,
  isAvailable: findingsAvailable,
  execute: async (input, ctx) => {
    const db = drizzle(getDb(ctx)!)
    const id = crypto.randomUUID()
    const now = Math.floor(Date.now() / 1000)
    const fields: FindingFields = {
      body: input.body,
      ...(input.category !== undefined && { category: input.category }),
      ...(input.tags !== undefined && { tags: input.tags }),
      // Default to caller's agent metadata when present in context. Some
      // tool callers (e.g. ad-hoc chat) won't have an agent identity —
      // leave these fields undefined in that case.
      agentClass: (ctx as { agentClass?: string }).agentClass,
      agentName: (ctx as { agentName?: string }).agentName,
      recurrenceCount: 0,
    }
    await db.insert(entities).values({
      id,
      userId: ctx.userId,
      type: 'finding',
      title: deriveTitle(input.body),
      status: 'open',
      fields: JSON.stringify(fields),
      createdAt: now,
      updatedAt: now,
    })
    return {
      id,
      status: 'open' as const,
      title: deriveTitle(input.body),
      body: input.body,
      category: input.category ?? null,
      tags: input.tags ?? [],
      agentClass: fields.agentClass ?? null,
      agentName: fields.agentName ?? null,
      recurrenceCount: 0,
      createdAt: now,
    }
  },
  render: { icon: Lightbulb, displayName: 'Record finding' },
}

// ─── promote_finding ─────────────────────────────────────────────

const PromoteFindingInput = z.object({
  findingId: z.string().describe('The id of the finding to promote'),
  refinedBody: z
    .string()
    .max(4000)
    .optional()
    .describe(
      'Optional rewritten / distilled version of the body for the learning. Defaults to the finding\'s body verbatim.',
    ),
})

const PromoteFindingOutput = z.union([
  z.object({
    learningId: z.string(),
    findingId: z.string(),
    title: z.string(),
  }),
  z.object({ error: z.string() }),
])

export const promoteFindingDefinition: ToolDefinition<
  z.infer<typeof PromoteFindingInput>,
  z.infer<typeof PromoteFindingOutput>
> = {
  name: 'promote_finding',
  description:
    'Promote a finding to a learning. Creates a new learning entity referencing the finding and flips the finding\'s status to "promoted". Use when an observation has recurred or is stable enough to be worth keeping as a durable pattern. The librarian skill calls this during weekly curation.',
  inputSchema: PromoteFindingInput,
  outputSchema: PromoteFindingOutput,
  isAvailable: findingsAvailable,
  execute: async ({ findingId, refinedBody }, ctx) => {
    const db = drizzle(getDb(ctx)!)
    const [finding] = await db
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.id, findingId),
          eq(entities.userId, ctx.userId),
          eq(entities.type, 'finding'),
        ),
      )
      .limit(1)
    if (!finding) return { error: `Finding ${findingId} not found` }
    if (finding.status === 'promoted') {
      return { error: `Finding ${findingId} already promoted` }
    }
    const findingFields = parseFields(finding.fields)
    const learningId = crypto.randomUUID()
    const now = Math.floor(Date.now() / 1000)
    const body = refinedBody ?? findingFields.body
    const learningFields: FindingFields = {
      body,
      ...(findingFields.category !== undefined && { category: findingFields.category }),
      ...(findingFields.tags !== undefined && { tags: findingFields.tags }),
      ...(findingFields.agentClass !== undefined && { agentClass: findingFields.agentClass }),
      ...(findingFields.agentName !== undefined && { agentName: findingFields.agentName }),
      sourceFindingId: findingId,
    }
    await db.insert(entities).values({
      id: learningId,
      userId: ctx.userId,
      type: 'learning',
      title: deriveTitle(body),
      status: 'active',
      fields: JSON.stringify(learningFields),
      createdAt: now,
      updatedAt: now,
    })
    await db
      .update(entities)
      .set({
        status: 'promoted',
        fields: JSON.stringify({ ...findingFields, promotedAt: now }),
        updatedAt: now,
      })
      .where(eq(entities.id, findingId))
    return { learningId, findingId, title: deriveTitle(body) }
  },
  render: { icon: BookOpen, displayName: 'Promote finding' },
}

// ─── dismiss_finding ─────────────────────────────────────────────

const DismissFindingInput = z.object({
  findingId: z.string(),
  reason: z
    .string()
    .max(500)
    .optional()
    .describe('Optional one-line reason — preserves the audit trail'),
})

const DismissFindingOutput = z.union([
  z.object({ findingId: z.string(), status: z.literal('dismissed') }),
  z.object({ error: z.string() }),
])

export const dismissFindingDefinition: ToolDefinition<
  z.infer<typeof DismissFindingInput>,
  z.infer<typeof DismissFindingOutput>
> = {
  name: 'dismiss_finding',
  description:
    'Mark a finding as dismissed (no longer relevant, won\'t fix, false positive, etc). Keeps the row for audit; reflect skill archives dismissed findings older than 30 days. Use when a finding turned out not to be a real pattern.',
  inputSchema: DismissFindingInput,
  outputSchema: DismissFindingOutput,
  isAvailable: findingsAvailable,
  execute: async ({ findingId, reason }, ctx) => {
    const db = drizzle(getDb(ctx)!)
    const [finding] = await db
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.id, findingId),
          eq(entities.userId, ctx.userId),
          eq(entities.type, 'finding'),
        ),
      )
      .limit(1)
    if (!finding) return { error: `Finding ${findingId} not found` }
    const fields = parseFields(finding.fields)
    await db
      .update(entities)
      .set({
        status: 'dismissed',
        fields: JSON.stringify({
          ...fields,
          ...(reason !== undefined && { dismissedReason: reason }),
        }),
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(entities.id, findingId))
    return { findingId, status: 'dismissed' as const }
  },
  render: { icon: Trash2, displayName: 'Dismiss finding' },
}

// ─── recurrence helper (server-only, not a tool) ─────────────────

/**
 * Increment the `recurrenceCount` on an existing finding when a
 * matching pattern surfaces again. Used by reflect skill / dedup
 * logic — exported so server code can call without going through the
 * tool surface. Returns the new count, or null if the finding is
 * missing or owned by a different user.
 */
export async function bumpFindingRecurrence(
  db: D1Database,
  userId: string,
  findingId: string,
): Promise<number | null> {
  const drizz = drizzle(db)
  const [row] = await drizz
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.id, findingId),
        eq(entities.userId, userId),
        eq(entities.type, 'finding'),
      ),
    )
    .limit(1)
  if (!row) return null
  const fields = parseFields(row.fields)
  const next = (fields.recurrenceCount ?? 0) + 1
  await drizz
    .update(entities)
    .set({
      // Bump status to 'recurred' the moment a finding repeats; keep it
      // there until promoted / dismissed.
      status: row.status === 'open' ? 'recurred' : row.status,
      fields: JSON.stringify({ ...fields, recurrenceCount: next }),
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(entities.id, findingId))
  return next
}

// ─── exports ─────────────────────────────────────────────────────

export const findingsDefinitions = [
  recordFindingDefinition,
  promoteFindingDefinition,
  dismissFindingDefinition,
] as ToolDefinition<unknown, unknown>[]

// Suppress unused import — `desc` and `sql` are reserved for upcoming
// list/sweep helpers in slice 3 (reflect skill scans recent findings).
void desc
void sql
