/**
 * Routines storage — D1 helpers around routines + routine_runs +
 * routine_cadence_changes.
 *
 * Pure CRUD + the run-summary-tail composer. Scheduler + REST routes
 * import these helpers; nothing in here knows about Cloudflare-specific
 * primitives so it stays unit-testable with a stubbed D1.
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import {
  routines,
  routineRuns,
  routineCadenceChanges,
  type RoutineTriggerKind,
  type RoutineOutcome,
  type CadenceAdjustMode,
} from './db/schema'

export type RoutineRow = typeof routines.$inferSelect
export type RoutineRunRow = typeof routineRuns.$inferSelect

interface DbEnv {
  DB: D1Database
}

// ─── Routine CRUD ───────────────────────────────────────────────────

export interface CreateRoutineInput {
  userId: string
  /** Optional org scope at create time. NULL = personal routine.
   *  When the request happens inside an active organisation context
   *  the route handler stamps this from `getActiveOrg(c)`. */
  organizationId?: string | null
  name: string
  description?: string
  agentClass: string
  agentName: string
  triggerKind: RoutineTriggerKind
  triggerConfig?: unknown
  inputTemplate?: unknown
  toolsAllowed?: string[]
  skillsLoaded?: string[]
  hooks?: Record<string, string>
  baseInterval?: number
  minInterval?: number
  maxInterval?: number
  adjustMode?: CadenceAdjustMode
  dailyBudgetUsd?: number | null
  enabled?: boolean
  /** Local-hour gate (0-23) — see schema docstring. */
  localFireHour?: number | null
}

export async function createRoutine(env: DbEnv, input: CreateRoutineInput): Promise<RoutineRow> {
  const db = drizzle(env.DB)
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const row = {
    id,
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    name: input.name,
    description: input.description ?? null,
    agentClass: input.agentClass,
    agentName: input.agentName,
    triggerKind: input.triggerKind,
    triggerConfigJson: input.triggerConfig ? JSON.stringify(input.triggerConfig) : null,
    inputTemplateJson: input.inputTemplate ? JSON.stringify(input.inputTemplate) : null,
    toolsAllowedJson: input.toolsAllowed ? JSON.stringify(input.toolsAllowed) : null,
    skillsLoadedJson: input.skillsLoaded ? JSON.stringify(input.skillsLoaded) : null,
    hooksJson: input.hooks ? JSON.stringify(input.hooks) : null,
    enabled: input.enabled ?? true,
    baseInterval: input.baseInterval ?? null,
    minInterval: input.minInterval ?? null,
    maxInterval: input.maxInterval ?? null,
    effectiveInterval: input.baseInterval ?? null,
    adjustMode: input.adjustMode ?? 'suggested',
    dailyBudgetUsd: input.dailyBudgetUsd ?? null,
    localFireHour: input.localFireHour ?? null,
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
    lastOutcome: null,
  }
  await db.insert(routines).values(row)
  const [inserted] = await db.select().from(routines).where(eq(routines.id, id)).limit(1)
  if (!inserted) throw new Error(`createRoutine failed for ${id}`)
  return inserted
}

/**
 * Org-scoping helper. When `orgId` is provided, the visibility filter is:
 *   organizationId = orgId  OR  organizationId IS NULL
 * The IS-NULL clause keeps pre-multi-tenant rows visible to their owner
 * across orgs until a deliberate backfill is performed. When `orgId` is
 * null (no active org), the filter is `organizationId IS NULL` — the
 * user only sees their personal routines.
 */
function orgScopeWhere(orgId: string | null) {
  if (orgId) {
    return or(eq(routines.organizationId, orgId), isNull(routines.organizationId))
  }
  return isNull(routines.organizationId)
}

export async function getRoutine(
  env: DbEnv,
  id: string,
  userId: string,
  orgId: string | null = null,
): Promise<RoutineRow | null> {
  const db = drizzle(env.DB)
  const [row] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.id, id), eq(routines.userId, userId), orgScopeWhere(orgId)))
    .limit(1)
  return row ?? null
}

export async function listRoutines(
  env: DbEnv,
  userId: string,
  orgId: string | null = null,
): Promise<RoutineRow[]> {
  const db = drizzle(env.DB)
  return db
    .select()
    .from(routines)
    .where(and(eq(routines.userId, userId), orgScopeWhere(orgId)))
    .orderBy(desc(routines.updatedAt))
}

export async function updateRoutine(
  env: DbEnv,
  id: string,
  userId: string,
  patch: Partial<CreateRoutineInput> & { effectiveInterval?: number },
  orgId: string | null = null,
): Promise<RoutineRow | null> {
  const db = drizzle(env.DB)
  // Only update fields that are explicitly present in the patch.
  const updates: Record<string, unknown> = { updatedAt: Math.floor(Date.now() / 1000) }
  if (patch.name !== undefined) updates['name'] = patch.name
  if (patch.description !== undefined) updates['description'] = patch.description
  if (patch.enabled !== undefined) updates['enabled'] = patch.enabled
  if (patch.triggerKind !== undefined) updates['triggerKind'] = patch.triggerKind
  if (patch.triggerConfig !== undefined) updates['triggerConfigJson'] = JSON.stringify(patch.triggerConfig)
  if (patch.inputTemplate !== undefined) updates['inputTemplateJson'] = JSON.stringify(patch.inputTemplate)
  if (patch.toolsAllowed !== undefined) updates['toolsAllowedJson'] = JSON.stringify(patch.toolsAllowed)
  if (patch.skillsLoaded !== undefined) updates['skillsLoadedJson'] = JSON.stringify(patch.skillsLoaded)
  if (patch.hooks !== undefined) updates['hooksJson'] = JSON.stringify(patch.hooks)
  if (patch.baseInterval !== undefined) updates['baseInterval'] = patch.baseInterval
  if (patch.minInterval !== undefined) updates['minInterval'] = patch.minInterval
  if (patch.maxInterval !== undefined) updates['maxInterval'] = patch.maxInterval
  if (patch.adjustMode !== undefined) updates['adjustMode'] = patch.adjustMode
  if (patch.dailyBudgetUsd !== undefined) updates['dailyBudgetUsd'] = patch.dailyBudgetUsd
  if (patch.effectiveInterval !== undefined) updates['effectiveInterval'] = patch.effectiveInterval
  if (patch.localFireHour !== undefined) updates['localFireHour'] = patch.localFireHour

  await db
    .update(routines)
    .set(updates)
    .where(and(eq(routines.id, id), eq(routines.userId, userId), orgScopeWhere(orgId)))
  return getRoutine(env, id, userId, orgId)
}

export async function deleteRoutine(
  env: DbEnv,
  id: string,
  userId: string,
  orgId: string | null = null,
): Promise<boolean> {
  const db = drizzle(env.DB)
  const result = await db
    .delete(routines)
    .where(and(eq(routines.id, id), eq(routines.userId, userId), orgScopeWhere(orgId)))
  // D1 returns { meta: { changes } } on delete; on miss meta.changes = 0.
  // Drizzle hides this; assume success unless thrown.
  return !!result
}

// ─── Run lifecycle ──────────────────────────────────────────────────

export interface StartRunInput {
  routineId: string
  inputContextSummary?: string
}

export async function startRoutineRun(env: DbEnv, input: StartRunInput): Promise<RoutineRunRow> {
  const db = drizzle(env.DB)
  // Compute next run number (incremental per routine).
  const [latest] = await db
    .select()
    .from(routineRuns)
    .where(eq(routineRuns.routineId, input.routineId))
    .orderBy(desc(routineRuns.runNumber))
    .limit(1)
  const runNumber = (latest?.runNumber ?? 0) + 1

  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await db.insert(routineRuns).values({
    id,
    routineId: input.routineId,
    runNumber,
    startedAt: now,
    inputContextSummary: input.inputContextSummary ?? null,
    outcome: 'started',
  })

  // Bump the routine's lastRunAt.
  await db
    .update(routines)
    .set({ lastRunAt: now, updatedAt: now })
    .where(eq(routines.id, input.routineId))

  const [row] = await db.select().from(routineRuns).where(eq(routineRuns.id, id)).limit(1)
  if (!row) throw new Error(`startRoutineRun failed for routine ${input.routineId}`)
  return row
}

export interface FinishRunInput {
  runId: string
  outcome: RoutineOutcome
  outputSummary?: string
  costUsd?: number | null
  agentRunId?: string
}

export async function finishRoutineRun(env: DbEnv, input: FinishRunInput): Promise<void> {
  const db = drizzle(env.DB)
  const now = Math.floor(Date.now() / 1000)
  await db
    .update(routineRuns)
    .set({
      finishedAt: now,
      outcome: input.outcome,
      outputSummary: input.outputSummary ?? null,
      costUsd: input.costUsd ?? null,
      ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    })
    .where(eq(routineRuns.id, input.runId))

  // Mirror the outcome on the routine row for fast index lookups.
  const [run] = await db.select().from(routineRuns).where(eq(routineRuns.id, input.runId)).limit(1)
  if (run) {
    await db
      .update(routines)
      .set({ lastOutcome: input.outcome, updatedAt: now })
      .where(eq(routines.id, run.routineId))
  }
}

// ─── Run-summary tail ───────────────────────────────────────────────

/**
 * Fetch the K most recent finished runs for a routine. Used to compose
 * the "tail" — a short context block of "what's happened recently" that
 * gets injected into the next run's input.
 */
export async function getRecentRunSummaries(
  env: DbEnv,
  routineId: string,
  limit: number = 5,
): Promise<Pick<RoutineRunRow, 'runNumber' | 'startedAt' | 'outcome' | 'outputSummary'>[]> {
  const db = drizzle(env.DB)
  const rows = await db
    .select({
      runNumber: routineRuns.runNumber,
      startedAt: routineRuns.startedAt,
      outcome: routineRuns.outcome,
      outputSummary: routineRuns.outputSummary,
    })
    .from(routineRuns)
    .where(eq(routineRuns.routineId, routineId))
    .orderBy(desc(routineRuns.runNumber))
    .limit(limit)
  return rows.reverse() // chronological ascending for prompt readability
}

/**
 * Compose a plain-text context block from the recent run tail, suitable
 * for injection into the agent's system prompt or the next-run input
 * template ({{recent_runs}}).
 */
export function formatRunSummaryTail(
  rows: Pick<RoutineRunRow, 'runNumber' | 'startedAt' | 'outcome' | 'outputSummary'>[],
): string {
  if (rows.length === 0) return 'No prior runs.'
  const lines = rows
    .filter((r) => r.outputSummary)
    .map((r) => {
      const when = new Date(r.startedAt * 1000).toISOString().slice(0, 16).replace('T', ' ')
      return `- Run #${r.runNumber} @ ${when} (${r.outcome}): ${r.outputSummary}`
    })
  if (lines.length === 0) return 'No prior runs with summaries.'
  return ['Recent runs (oldest → newest):', ...lines].join('\n')
}

// ─── Cadence self-adjust ────────────────────────────────────────────

/**
 * Apply a cadence adjustment proposal. Behaviour varies by adjustMode:
 *
 *   - direct    — applies immediately, clamped to [minInterval, maxInterval]
 *   - suggested — logs the proposal but the interval stays put (the user
 *                 reviews suggestions in the routine UI)
 *   - fixed     — silently no-op; agent has no influence over cadence
 *
 * Always writes a `routine_cadence_changes` audit row regardless of mode.
 */
export interface AdjustCadenceInput {
  routineId: string
  proposed: number
  reason?: string
}

export async function adjustRoutineCadence(env: DbEnv, input: AdjustCadenceInput): Promise<{
  applied: boolean
  effectiveInterval: number | null
}> {
  const db = drizzle(env.DB)
  const [r] = await db.select().from(routines).where(eq(routines.id, input.routineId)).limit(1)
  if (!r) throw new Error(`adjustRoutineCadence: routine ${input.routineId} not found`)

  const fromInterval = r.effectiveInterval ?? r.baseInterval ?? 0
  let toInterval = input.proposed
  if (r.minInterval != null) toInterval = Math.max(toInterval, r.minInterval)
  if (r.maxInterval != null) toInterval = Math.min(toInterval, r.maxInterval)

  let applied = false
  if (r.adjustMode === 'direct') {
    await db
      .update(routines)
      .set({ effectiveInterval: toInterval, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(routines.id, r.id))
    applied = true
  }

  await db.insert(routineCadenceChanges).values({
    routineId: r.id,
    fromInterval,
    toInterval,
    reason: input.reason ?? null,
    applied,
  })

  return { applied, effectiveInterval: applied ? toInterval : r.effectiveInterval }
}
