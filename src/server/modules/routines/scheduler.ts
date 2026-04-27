/**
 * Routines scheduler — cron-tick driven.
 *
 * Each cron fire (every 15 mins by default — wrangler.jsonc cron schedule
 * '@every-15-min') sweeps for due enabled routines and fires their target
 * agent. A routine is "due" when:
 *
 *   triggerKind = 'schedule'
 *   AND enabled = true
 *   AND (lastRunAt is null OR now - lastRunAt >= effectiveInterval)
 *
 * Per-tick cap (default 5 routines) so we never blow the cron budget.
 *
 * Why not Agent.schedule() per-routine? The agents SDK has its own
 * `schedule()` which is great for ad-hoc DO-internal timers. Routines
 * intentionally use the global cron sweeper because:
 *   - routines outlive a single DO instance — cadence changes on the
 *     row should reflect immediately, not "next time the DO wakes up"
 *   - bounded per-tick processing gives a clean budget
 *   - one place to look when investigating "why didn't this fire"
 *
 * The agent's own DO `Agent.schedule()` stays available for sub-routine
 * timers (e.g. inside a single run, schedule a follow-up step).
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm'
import { routines, type RoutineOutcome } from './db/schema'
import {
  startRoutineRun,
  finishRoutineRun,
  getRecentRunSummaries,
  formatRunSummaryTail,
} from './storage'

interface SchedulerEnv {
  DB: D1Database
  // Other bindings get passed straight through to the agent stub.
  [k: string]: unknown
}

export interface ProcessDueResult {
  considered: number
  fired: number
  errors: number
}

/**
 * Sweep due routines and fire each one's target agent.
 *
 * Returns counters for cron-tick logging.
 */
export async function processDueRoutines(
  env: SchedulerEnv,
  options: { maxPerTick?: number } = {},
): Promise<ProcessDueResult> {
  const max = options.maxPerTick ?? 5
  const db = drizzle(env.DB)
  const now = Math.floor(Date.now() / 1000)

  // Find enabled schedule-triggered routines that are due.
  // due = lastRunAt IS NULL OR (now - lastRunAt) >= effectiveInterval
  const due = await db
    .select()
    .from(routines)
    .where(
      and(
        eq(routines.enabled, true),
        eq(routines.triggerKind, 'schedule'),
        or(
          isNull(routines.lastRunAt),
          // SQL: lastRunAt + effectiveInterval <= now
          // Drizzle 0.45 needs a tiny raw fragment for the addition.
          lte(sql<number>`${routines.lastRunAt} + COALESCE(${routines.effectiveInterval}, ${routines.baseInterval}, 0)`, now),
        ),
      ),
    )
    .orderBy(asc(routines.lastRunAt))
    .limit(max)

  let fired = 0
  let errors = 0

  for (const r of due) {
    try {
      await fireRoutine(env, r)
      fired++
    } catch (err) {
      errors++
      console.error(
        JSON.stringify({
          event: 'routine_fire_error',
          routineId: r.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }

  return { considered: due.length, fired, errors }
}

/**
 * Fire one routine — start a run row, look up the target DO stub,
 * compose input from template + run-summary tail, invoke runOnce, then
 * finish the run with outcome + summary.
 *
 * Exported separately from processDueRoutines so tests + the manual-fire
 * REST endpoint can reuse it.
 */
export async function fireRoutine(env: SchedulerEnv, routine: typeof routines.$inferSelect): Promise<void> {
  // Compose the run-summary tail (last K=5 runs) so the agent sees what
  // it has been doing recently. This is the cheap "long-run agent
  // context" pattern from .jez/artifacts/long-run-agent-context-2026-04-27.md
  const tail = await getRecentRunSummaries(env, routine.id, 5)
  const tailText = formatRunSummaryTail(tail)

  // Resolve the input template — for now we expect either a plain
  // string or { input: string }. Slice 6+ wires richer template
  // expansion ({{recent_runs}}, {{now}}, {{user.name}}). For slice 3
  // we just append the tail to whatever the user's template says.
  const inputTemplate = parseTemplate(routine.inputTemplateJson)
  const composedInput = composeInput(inputTemplate, tailText)

  // Start the run row before invoking the agent so we can mark
  // outcome=error if the invoke throws.
  const run = await startRoutineRun(env, {
    routineId: routine.id,
    inputContextSummary: tailText,
  })

  // Resolve the target DO namespace by class name. Convention: the
  // class name is registered as a wrangler.jsonc DO binding using the
  // same name. e.g. AssistantAgent → env.AssistantAgent.
  const ns = (env as unknown as Record<string, unknown>)[routine.agentClass] as
    | { idFromName(name: string): unknown; get(id: unknown): unknown }
    | undefined
  if (!ns) {
    await finishRoutineRun(env, {
      runId: run.id,
      outcome: 'error',
      outputSummary: `Agent class "${routine.agentClass}" has no DO binding — check wrangler.jsonc.`,
    })
    return
  }

  const stub = ns.get(ns.idFromName(routine.agentName)) as {
    runOnce: (input: unknown) => Promise<{ text: string; usage: unknown; steps: number }>
    setToolsAllowed?: (names: string[] | null) => Promise<void>
  }

  // Apply tools allowlist for this fire (per slice 2 contract).
  const toolsAllowed = parseStringArray(routine.toolsAllowedJson)
  if (toolsAllowed && stub.setToolsAllowed) {
    try {
      await stub.setToolsAllowed(toolsAllowed)
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: 'routine_tools_allowed_warn',
          routineId: routine.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }

  // Fire. Outcome is rough — the run audit row in agent_runs holds the
  // detailed cost/tokens/steps; here we just record success/error and
  // produce a 1-paragraph summary for the next-fire tail.
  let outcome: RoutineOutcome = 'ok'
  let outputSummary: string | null = null
  try {
    const result = await stub.runOnce({
      input: composedInput,
      trigger: 'schedule',
    })
    // Truncate to ~280 chars for the tail. The agent can be coached
    // (via skill) to emit a 1-line summary at the end of its run; if
    // it doesn't, use the trailing N chars as a fallback.
    outputSummary = (result.text ?? '').trim().slice(-280) || null
  } catch (err) {
    outcome = 'error'
    outputSummary = `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 280)
  }

  await finishRoutineRun(env, {
    runId: run.id,
    outcome,
    ...(outputSummary !== null ? { outputSummary } : {}),
  })
}

// ─── Template helpers ───────────────────────────────────────────────

interface InputTemplate {
  input?: string
}

function parseTemplate(json: string | null): InputTemplate {
  if (!json) return {}
  try {
    const v = JSON.parse(json)
    if (typeof v === 'string') return { input: v }
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as InputTemplate
    return {}
  } catch {
    return {}
  }
}

function composeInput(template: InputTemplate, tail: string): string {
  const base = template.input?.trim() || 'Run the routine and emit a 1-line summary at the end.'
  // Slice 3 keeps composition trivial: prepend the tail as a system-style
  // context block. Slice 6+ adds richer template expansion.
  return `## Recent run history\n\n${tail}\n\n## This run\n\n${base}`
}

function parseStringArray(json: string | null): string[] | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null
  } catch {
    return null
  }
}
