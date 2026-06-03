/**
 * AdminAgent — routine management tools.
 *
 * 3 read tools (auto-execute) + 5 write tools (approval-gated).
 *
 * Read tools (no approval): `list_routines`, `inspect_routine`,
 * `list_routine_runs` — wrap the existing storage helpers with
 * userId scoping for safety.
 *
 * Write tools call `requestApproval()` and return an approval id.
 * The user reviews the proposal in /dashboard/approvals; on approve,
 * AdminAgent.executeApproved(action, payload) runs the actual mutation.
 *
 * Recursion guard: `create_routine` rejects `agentClass === 'AdminAgent'`.
 * AdminAgent inside a routine inside AdminAgent is a foot-gun we
 * forbid in v1. If a real use case appears later, we'll add a depth
 * cap instead of a flat refusal.
 */
import { z } from 'zod'
import {
  CalendarPlus,
  CalendarSearch,
  CalendarClock,
  Pencil,
  Pause,
  Play,
  Trash2,
  ListChecks,
} from 'lucide-react'
import { drizzle } from 'drizzle-orm/d1'
import { desc, eq } from 'drizzle-orm'

import type { ToolDefinition } from '@/shared/agent'
import { getRoutine, listRoutines } from '@/server/modules/routines/storage'
import { routineRuns } from '@/server/modules/routines/db/schema'
import type { AdminToolFactoryArgs } from './types'

// ─── Schemas (subset of routines/routes.ts CreateSchema) ────────────

const TriggerKindSchema = z.enum(['schedule', 'webhook', 'event', 'manual'])
const AdjustModeSchema = z.enum(['direct', 'suggested', 'fixed'])

const CreateRoutineInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  agentClass: z
    .string()
    .min(1)
    .max(80)
    .describe(
      'Class registered in src/server/lib/agents/registry.ts. Cannot be "AdminAgent" (recursion guard).'
    ),
  agentName: z.string().min(1).max(120),
  triggerKind: TriggerKindSchema.default('schedule'),
  triggerConfig: z.unknown().optional(),
  inputTemplate: z.unknown().optional(),
  toolsAllowed: z.array(z.string()).optional(),
  skillsLoaded: z.array(z.string()).optional(),
  hooks: z.record(z.string(), z.string()).optional(),
  baseInterval: z.number().int().positive().optional(),
  minInterval: z.number().int().positive().optional(),
  maxInterval: z.number().int().positive().optional(),
  adjustMode: AdjustModeSchema.optional(),
  dailyBudgetUsd: z.number().positive().nullable().optional(),
  enabled: z.boolean().optional(),
})
type CreateRoutineInputType = z.infer<typeof CreateRoutineInputSchema>

const UpdateRoutineInputSchema = z.object({
  id: z.string().min(1),
  patch: CreateRoutineInputSchema.partial(),
})
type UpdateRoutineInputType = z.infer<typeof UpdateRoutineInputSchema>

const RoutineIdInputSchema = z.object({ id: z.string().min(1) })
type RoutineIdInputType = z.infer<typeof RoutineIdInputSchema>

// ─── Output schemas ─────────────────────────────────────────────────

const RoutineSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  agentClass: z.string(),
  agentName: z.string(),
  enabled: z.union([z.boolean(), z.number()]),
  baseInterval: z.number().nullable(),
  effectiveInterval: z.number().nullable(),
  lastRunAt: z.number().nullable(),
  lastOutcome: z.string().nullable(),
})

const ListResponseSchema = z.object({ total: z.number(), routines: z.array(RoutineSummarySchema) })
type ListResponseType = z.infer<typeof ListResponseSchema>

const InspectResponseSchema = z.union([
  z.object({ ok: z.literal(true), routine: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.string() }),
])
type InspectResponseType = z.infer<typeof InspectResponseSchema>

const RunsResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    total: z.number(),
    runs: z.array(
      z.object({
        id: z.string(),
        runNumber: z.number(),
        outcome: z.string(),
        startedAt: z.number(),
        finishedAt: z.number().nullable(),
        outputSummary: z.string().nullable(),
        costUsd: z.number().nullable(),
      })
    ),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
])
type RunsResponseType = z.infer<typeof RunsResponseSchema>

const ApprovalQueuedSchema = z.union([
  z.object({
    ok: z.literal(true),
    approvalId: z.string(),
    status: z.literal('pending'),
    summary: z.string(),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
])
type ApprovalQueuedType = z.infer<typeof ApprovalQueuedSchema>

// ─── Factory ────────────────────────────────────────────────────────

export function buildRoutineAdminTools(
  args: AdminToolFactoryArgs
): ToolDefinition<unknown, unknown>[] {
  const { requestApproval, userId, env } = args

  const tools: ToolDefinition<unknown, unknown>[] = [
    // ─── Read tools (auto-execute) ──────────────────────────────────

    {
      name: 'list_routines',
      description:
        'List all routines owned by the current user. Returns id, name, agentClass, schedule, last run outcome. Use to recall what already exists before creating a new one.',
      inputSchema: z.object({}),
      outputSchema: ListResponseSchema,
      execute: async (): Promise<ListResponseType> => {
        const rows = await listRoutines(env, userId)
        return {
          total: rows.length,
          routines: rows.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            agentClass: r.agentClass,
            agentName: r.agentName,
            enabled: r.enabled,
            baseInterval: r.baseInterval,
            effectiveInterval: r.effectiveInterval,
            lastRunAt: r.lastRunAt,
            lastOutcome: r.lastOutcome,
          })),
        }
      },
      render: { icon: CalendarSearch, displayName: 'List routines' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'inspect_routine',
      description:
        'Get the full config for one routine by id. Returns name, agentClass, agentName, schedule, tools allowed, skills loaded, hooks, budget. Use after list_routines when the user references "that one".',
      inputSchema: RoutineIdInputSchema,
      outputSchema: InspectResponseSchema,
      execute: async (input: RoutineIdInputType): Promise<InspectResponseType> => {
        const r = await getRoutine(env, input.id, userId)
        if (!r) return { ok: false as const, error: `Routine ${input.id} not found` }
        return { ok: true as const, routine: r }
      },
      render: { icon: CalendarClock, displayName: 'Inspect routine' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'list_routine_runs',
      description:
        'List recent runs of one routine, newest first. Returns id, run number, status, started/finished timestamps, summary. Use for "did my routine fire today?" / "why did it fail last time?".',
      inputSchema: z.object({
        id: z.string().min(1),
        limit: z.number().int().positive().max(50).default(10),
      }),
      outputSchema: RunsResponseSchema,
      execute: async (input: { id: string; limit: number }): Promise<RunsResponseType> => {
        const r = await getRoutine(env, input.id, userId)
        if (!r) return { ok: false as const, error: `Routine ${input.id} not found` }
        const db = drizzle(env.DB)
        const rows = await db
          .select()
          .from(routineRuns)
          .where(eq(routineRuns.routineId, input.id))
          .orderBy(desc(routineRuns.runNumber))
          .limit(input.limit)
        return {
          ok: true as const,
          total: rows.length,
          runs: rows.map((row) => ({
            id: row.id,
            runNumber: row.runNumber,
            outcome: row.outcome,
            startedAt: row.startedAt,
            finishedAt: row.finishedAt,
            outputSummary: row.outputSummary,
            costUsd: row.costUsd,
          })),
        }
      },
      render: { icon: ListChecks, displayName: 'Recent runs' },
    } as ToolDefinition<unknown, unknown>,

    // ─── Write tools (approval-gated) ───────────────────────────────

    {
      name: 'create_routine',
      description:
        'Propose creating a new routine for the user. Returns an approval id — the routine is NOT created until the user reviews and approves the proposal in /dashboard/approvals. Required: name + agentClass + agentName. agentClass cannot be "AdminAgent" (recursion guard).',
      inputSchema: CreateRoutineInputSchema,
      outputSchema: ApprovalQueuedSchema,
      execute: async (input: CreateRoutineInputType): Promise<ApprovalQueuedType> => {
        if (input.agentClass === 'AdminAgent') {
          return {
            ok: false as const,
            error:
              'Cannot create a routine that uses AdminAgent — recursion guard. Pick a different agent class.',
          }
        }
        try {
          const summary = `Create routine "${input.name}" using ${input.agentClass}`
          const result = await requestApproval('admin_create_routine', input, summary)
          return { ok: true as const, ...result, summary }
        } catch (err) {
          return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
        }
      },
      render: { icon: CalendarPlus, displayName: 'Propose new routine' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'update_routine',
      description:
        'Propose editing an existing routine. Returns an approval id — changes are NOT applied until the user reviews and approves. Pass `id` + the partial `patch` (only the fields you want to change).',
      inputSchema: UpdateRoutineInputSchema,
      outputSchema: ApprovalQueuedSchema,
      execute: async (input: UpdateRoutineInputType): Promise<ApprovalQueuedType> => {
        const r = await getRoutine(env, input.id, userId)
        if (!r) return { ok: false as const, error: `Routine ${input.id} not found` }
        if (input.patch.agentClass === 'AdminAgent') {
          return {
            ok: false as const,
            error: 'Cannot reassign a routine to AdminAgent — recursion guard.',
          }
        }
        try {
          const summary = `Update routine "${r.name}" (${Object.keys(input.patch).join(', ')})`
          const result = await requestApproval('admin_update_routine', input, summary)
          return { ok: true as const, ...result, summary }
        } catch (err) {
          return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
        }
      },
      render: { icon: Pencil, displayName: 'Propose update' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'pause_routine',
      description:
        'Propose pausing a routine (sets enabled=false). Returns an approval id. Same as the user clicking the pause toggle — easily reversible.',
      inputSchema: RoutineIdInputSchema,
      outputSchema: ApprovalQueuedSchema,
      execute: async (input: RoutineIdInputType): Promise<ApprovalQueuedType> => {
        const r = await getRoutine(env, input.id, userId)
        if (!r) return { ok: false as const, error: `Routine ${input.id} not found` }
        try {
          const summary = `Pause routine "${r.name}"`
          const result = await requestApproval('admin_pause_routine', { id: input.id }, summary)
          return { ok: true as const, ...result, summary }
        } catch (err) {
          return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
        }
      },
      render: { icon: Pause, displayName: 'Propose pause' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'run_routine_now',
      description:
        'Propose firing a routine off-schedule (one-shot). Returns an approval id. Useful for "let me see what it would produce" without waiting for the next scheduled run.',
      inputSchema: RoutineIdInputSchema,
      outputSchema: ApprovalQueuedSchema,
      execute: async (input: RoutineIdInputType): Promise<ApprovalQueuedType> => {
        const r = await getRoutine(env, input.id, userId)
        if (!r) return { ok: false as const, error: `Routine ${input.id} not found` }
        try {
          const summary = `Run routine "${r.name}" now (off-schedule)`
          const result = await requestApproval('admin_run_routine_now', { id: input.id }, summary)
          return { ok: true as const, ...result, summary }
        } catch (err) {
          return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
        }
      },
      render: { icon: Play, displayName: 'Propose fire-now' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'delete_routine',
      description:
        'Propose DELETING a routine. Returns an approval id. Permanent — cascades runs + cadence changes. Approval card shows the routine name + last-run date so the user can confirm.',
      inputSchema: RoutineIdInputSchema,
      outputSchema: ApprovalQueuedSchema,
      execute: async (input: RoutineIdInputType): Promise<ApprovalQueuedType> => {
        const r = await getRoutine(env, input.id, userId)
        if (!r) return { ok: false as const, error: `Routine ${input.id} not found` }
        try {
          const summary = `DELETE routine "${r.name}" — permanent, cascades runs`
          const result = await requestApproval(
            'admin_delete_routine',
            { id: input.id, name: r.name },
            summary
          )
          return { ok: true as const, ...result, summary }
        } catch (err) {
          return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
        }
      },
      render: { icon: Trash2, displayName: 'Propose delete' },
    } as ToolDefinition<unknown, unknown>,
  ]

  return tools
}
