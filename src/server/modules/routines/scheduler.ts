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
import { and, asc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { routines, routineRuns, type RoutineOutcome } from './db/schema'
import {
  startRoutineRun,
  finishRoutineRun,
  getRecentRunSummaries,
  formatRunSummaryTail,
} from './storage'
import { getUserTimezone, localHourFor } from '@/server/lib/users/timezone'

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

  // Per-user tz cache so we don't re-query for every routine in the
  // batch when a user owns several local-hour-gated routines.
  const tzCache = new Map<string, string>()

  for (const r of due) {
    // Local-hour gate (goanna slice 6). When `localFireHour` is null
    // the routine fires whenever the cron sweeper finds it due —
    // existing behaviour. When set, we skip this fire (keeping
    // `lastRunAt` unchanged so the row stays due for the next tick)
    // unless the user's local hour matches.
    if (r.localFireHour !== null && r.localFireHour !== undefined) {
      let tz = tzCache.get(r.userId)
      if (!tz) {
        tz = await getUserTimezone(env.DB, r.userId)
        tzCache.set(r.userId, tz)
      }
      const currentHour = localHourFor(tz)
      if (currentHour !== r.localFireHour) {
        console.log(
          JSON.stringify({
            event: 'routine_skipped_local_hour',
            routineId: r.id,
            userId: r.userId,
            timezone: tz,
            currentHour,
            wantedHour: r.localFireHour,
          }),
        )
        continue
      }
    }

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
  const composedInput = composeInput(inputTemplate, tailText, routine.name, routine.description)

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
    runOnce: (input: unknown) => Promise<{
      text: string
      usage: unknown
      steps: number
      hookSummary?: string | null
    }>
    setToolsAllowed?: (names: string[] | null) => Promise<void>
    setSkillsLoaded?: (names: string[] | null) => Promise<void>
    setHooks?: (hooks: Record<string, string> | null) => Promise<void>
  }

  // Apply tools allowlist + skills + hooks for this fire (slice 2 + 4
  // contracts). Each is a "best-effort" call — older agent classes that
  // haven't yet inherited the latest AutonomousAgent base might not have
  // the setter; the scheduler logs and continues.
  const toolsAllowed = parseStringArray(routine.toolsAllowedJson)
  const skillsLoaded = parseStringArray(routine.skillsLoadedJson)
  const hooks = parseHooksMap(routine.hooksJson)
  await applyConfig(routine.id, () => stub.setToolsAllowed?.(toolsAllowed))
  await applyConfig(routine.id, () => stub.setSkillsLoaded?.(skillsLoaded))
  await applyConfig(routine.id, () => stub.setHooks?.(hooks))

  // Fire. Outcome is rough — the run audit row in agent_runs holds the
  // detailed cost/tokens/steps; here we just record success/error and
  // produce a 1-paragraph summary for the next-fire tail.
  //
  // P2-005 — wrap runOnce in a watchdog. Agent runs that exceed the
  // Workers wall-time limit (or that loop indefinitely) used to leave
  // the run stuck at outcome='started' because the promise never
  // resolved before the worker was killed by `waitUntil`. The
  // Promise.race with a timeout means we always finalise the run row
  // with outcome 'error' (timeout in the message), so the UI never
  // spins forever and observability sees the failure.
  const RUN_TIMEOUT_MS = 120_000 // 2 min — generous; cron tick is 15min
  let outcome: RoutineOutcome = 'ok'
  let outputSummary: string | null = null
  try {
    const result = await Promise.race([
      stub.runOnce({
        input: composedInput,
        trigger: 'schedule',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`routine run exceeded ${RUN_TIMEOUT_MS}ms watchdog`)),
          RUN_TIMEOUT_MS,
        ),
      ),
    ])
    // Prefer the SessionEnd hook output if the routine configured one.
    // Falls back to the trailing 280 chars of the assistant text — the
    // agent can be coached via a SessionEnd skill to produce a clean
    // 1-line summary instead.
    const hookOut = (result.hookSummary ?? '').trim()
    outputSummary = hookOut || (result.text ?? '').trim().slice(-280) || null
  } catch (err) {
    outcome = 'error'
    outputSummary = `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 280)
  }

  // Always finish the run row, even if finishRoutineRun itself throws —
  // we never want a row stuck at 'started'. If the DB write fails we
  // log loudly but don't propagate; the worker-kill case below is the
  // primary failure mode this guards.
  try {
    await finishRoutineRun(env, {
      runId: run.id,
      outcome,
      ...(outputSummary !== null ? { outputSummary } : {}),
    })
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'routine_finish_failed',
        runId: run.id,
        routineId: routine.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}

// ─── Stale-run watchdog (P2-005) ───────────────────────────────────

/**
 * Sweep routine_runs that are stuck at outcome='started' beyond a grace
 * window and flip them to 'error' with a descriptive summary. Covers
 * the case where the worker isolate was killed mid-fire (waitUntil cap,
 * CPU limit) before fireRoutine reached its watchdog timeout. Without
 * this, the run row stays at 'started' forever and the UI shows
 * "Running" indefinitely — a power-user trust killer (P2-005).
 *
 * Default grace: 5 minutes. fireRoutine has its own 2-minute internal
 * watchdog, so anything older than 5 minutes at 'started' is genuinely
 * abandoned.
 */
export async function sweepStaleRoutineRuns(
  env: SchedulerEnv,
  options: { graceSeconds?: number; maxPerTick?: number } = {},
): Promise<{ swept: number }> {
  const grace = options.graceSeconds ?? 300
  const max = options.maxPerTick ?? 50
  const db = drizzle(env.DB)
  const cutoff = Math.floor(Date.now() / 1000) - grace
  // Find stuck runs.
  const stuck = await db
    .select({ id: routineRuns.id, routineId: routineRuns.routineId })
    .from(routineRuns)
    .where(and(eq(routineRuns.outcome, 'started'), lt(routineRuns.startedAt, cutoff)))
    .limit(max)
  if (stuck.length === 0) return { swept: 0 }
  const now = Math.floor(Date.now() / 1000)
  for (const row of stuck) {
    await db
      .update(routineRuns)
      .set({
        outcome: 'error',
        finishedAt: now,
        outputSummary: `error: run abandoned (>${grace}s at outcome='started' — likely worker isolate killed before completion)`.slice(0, 280),
      })
      .where(eq(routineRuns.id, row.id))
    // Mirror on the routine row so list pages show the right last
    // outcome.
    await db
      .update(routines)
      .set({ lastOutcome: 'error', updatedAt: now })
      .where(eq(routines.id, row.routineId))
  }
  return { swept: stuck.length }
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

function composeInput(
  template: InputTemplate,
  tail: string,
  routineName: string,
  routineDescription: string | null,
): string {
  // Fallback hierarchy when the user hasn't written explicit instructions:
  //   1. Use the routine's name + description — that's what they typed
  //      to describe what they want. "Daily summary of my emails" tells
  //      the agent more than "Run the routine and emit a 1-line summary".
  //   2. Last resort: the generic prompt (kept for routines created
  //      before names were treated as semantic instructions).
  const userInput = template.input?.trim()
  let base: string
  if (userInput) {
    base = userInput
  } else if (routineName) {
    const desc = routineDescription?.trim()
    base = desc
      ? `This routine is called "${routineName}". ${desc}\n\nDo what the name + description ask. If you need a tool or connection that isn't available, surface what's missing — don't guess.`
      : `This routine is called "${routineName}". Do what the name asks. If you need a tool or connection that isn't available, surface what's missing — don't guess.`
  } else {
    base = 'Run the routine and emit a 1-line summary at the end.'
  }
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

function parseHooksMap(json: string | null): Record<string, string> | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    const out: Record<string, string> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'string' && val.length > 0) out[k] = val
    }
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return null
  }
}

/**
 * Run a config-setter and swallow + log failures. Each routine fire
 * applies tools allowlist / skills / hooks from its row; if any of
 * those fail (older agent class missing a setter, transient DO error)
 * we log and continue rather than aborting the whole fire.
 */
async function applyConfig(
  routineId: string,
  fn: () => Promise<unknown> | void,
): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: 'routine_config_apply_warn',
        routineId,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}
