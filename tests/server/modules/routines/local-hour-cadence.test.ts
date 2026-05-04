/**
 * Goanna slice 6 — local-hour cadence gate on routines.
 *
 * Tests `processDueRoutines` skips a fire when the routine's
 * `localFireHour` is set and the user's current local hour doesn't
 * match. Fires when it does match. Fires regardless when the column
 * is null (existing behaviour preserved).
 *
 * We create the minimum tables via raw SQL in `beforeAll` (no D1
 * migration runner is wired into vitest in this project yet — the
 * `cloudflareTest` config doesn't auto-apply migrations). This keeps
 * the test self-contained and fast.
 *
 * The trick for the "fires" cases: we don't actually need the agent
 * DO to be wired. `fireRoutine` looks up the DO binding by class
 * name; if it's missing, it records `outcome: error` on the run row
 * but still creates the run row. So we use the existence of a
 * `routine_runs` row (any outcome) as the signal "it tried to fire",
 * and the absence as "it skipped".
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { localHourFor } from '@/server/lib/users/timezone'
import { processDueRoutines } from '@/server/modules/routines/scheduler'

const USER_ID = 'test-user-local-hour'
const TIMEZONE = 'Australia/Sydney'

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const stmt = env.DB.prepare(sql)
  await (params.length > 0 ? stmt.bind(...params).run() : stmt.run())
}

async function ensureSchema(): Promise<void> {
  // user — minimal columns we need (id + preferences). The scheduler's
  // tz lookup goes through getUserTimezone which queries
  // user.preferences.timezone. We keep the rest of better-auth's user
  // schema out of the test harness; this column set is a subset that
  // satisfies the timezone helper.
  await runSql(`CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    preferences TEXT,
    memoryUpdateMode TEXT NOT NULL DEFAULT 'auto',
    createdAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
    updatedAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z'
  )`)

  // routines — full column list per the schema (slice 6 added local_fire_hour).
  await runSql(`CREATE TABLE IF NOT EXISTS routines (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    agent_class TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    trigger_kind TEXT NOT NULL DEFAULT 'schedule',
    trigger_config_json TEXT,
    input_template_json TEXT,
    tools_allowed_json TEXT,
    skills_loaded_json TEXT,
    hooks_json TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    base_interval INTEGER,
    min_interval INTEGER,
    max_interval INTEGER,
    effective_interval INTEGER,
    adjust_mode TEXT NOT NULL DEFAULT 'suggested',
    daily_budget_usd REAL,
    local_fire_hour INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_run_at INTEGER,
    last_outcome TEXT
  )`)

  await runSql(`CREATE TABLE IF NOT EXISTS routine_runs (
    id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL,
    agent_run_id TEXT,
    run_number INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    input_context_summary TEXT,
    output_summary TEXT,
    outcome TEXT NOT NULL DEFAULT 'started',
    cost_usd REAL
  )`)

  await runSql(`CREATE TABLE IF NOT EXISTS routine_cadence_changes (
    id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL,
    from_interval INTEGER NOT NULL,
    to_interval INTEGER NOT NULL,
    reason TEXT,
    applied INTEGER NOT NULL DEFAULT 0,
    changed_at INTEGER NOT NULL
  )`)
}

async function clearTables(): Promise<void> {
  await runSql('DELETE FROM routine_runs')
  await runSql('DELETE FROM routines')
  await runSql('DELETE FROM user')
}

async function insertUser(timezone: string | null): Promise<void> {
  const prefs = JSON.stringify({ theme: 'default', mode: 'system', timezone })
  await runSql(
    `INSERT INTO user (id, name, email, preferences) VALUES (?, ?, ?, ?)`,
    [USER_ID, 'Test User', `${USER_ID}@test.local`, prefs],
  )
}

async function insertRoutine(opts: {
  id: string
  localFireHour: number | null
  baseInterval?: number
}): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  // Set last_run_at so far in the past that the routine is always "due"
  // by the interval check, isolating the local-hour gate as the sole
  // remaining decision point.
  const lastRunAt = now - 24 * 60 * 60
  await runSql(
    `INSERT INTO routines (
      id, user_id, name, agent_class, agent_name, trigger_kind, enabled,
      base_interval, effective_interval, adjust_mode, local_fire_hour,
      created_at, updated_at, last_run_at
    ) VALUES (?, ?, 'Test routine', 'AgentClassMissingForTest', 'test-agent',
      'schedule', 1, ?, ?, 'suggested', ?, ?, ?, ?)`,
    [
      opts.id,
      USER_ID,
      opts.baseInterval ?? 60,
      opts.baseInterval ?? 60,
      opts.localFireHour,
      now,
      now,
      lastRunAt,
    ],
  )
}

async function countRuns(routineId: string): Promise<number> {
  const result = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM routine_runs WHERE routine_id = ?`,
  )
    .bind(routineId)
    .first<{ c: number }>()
  return result?.c ?? 0
}

async function getLastRunAt(routineId: string): Promise<number | null> {
  const result = await env.DB.prepare(
    `SELECT last_run_at FROM routines WHERE id = ?`,
  )
    .bind(routineId)
    .first<{ last_run_at: number | null }>()
  return result?.last_run_at ?? null
}

describe('processDueRoutines — local-hour cadence gate (goanna slice 6)', () => {
  beforeAll(async () => {
    await ensureSchema()
  })

  beforeEach(async () => {
    await clearTables()
  })

  it('skips a fire when localFireHour does NOT match the user current local hour', async () => {
    await insertUser(TIMEZONE)
    const currentHour = localHourFor(TIMEZONE)
    // Pick a wanted hour that is definitely different (wrap mod 24).
    const wantedHour = (currentHour + 6) % 24
    const routineId = 'routine-skip'
    await insertRoutine({ id: routineId, localFireHour: wantedHour })

    const lastRunAtBefore = await getLastRunAt(routineId)

    const result = await processDueRoutines(
      env as unknown as { DB: D1Database; [k: string]: unknown },
    )

    expect(result.considered).toBe(1)
    expect(result.fired).toBe(0)
    expect(result.errors).toBe(0)
    // No run row inserted → routine was skipped, not fired.
    expect(await countRuns(routineId)).toBe(0)
    // lastRunAt unchanged → routine stays due for the next tick.
    expect(await getLastRunAt(routineId)).toBe(lastRunAtBefore)
  })

  it('fires when localFireHour matches the user current local hour', async () => {
    await insertUser(TIMEZONE)
    const currentHour = localHourFor(TIMEZONE)
    const routineId = 'routine-fire-match'
    await insertRoutine({ id: routineId, localFireHour: currentHour })

    await processDueRoutines(
      env as unknown as { DB: D1Database; [k: string]: unknown },
    )

    // The routine "fires" — fireRoutine creates a run row even when the
    // DO binding is missing (it records outcome=error and returns).
    // What we're asserting: the local-hour gate did NOT skip it. The
    // existence of a run row proves the gate let it through.
    expect(await countRuns(routineId)).toBe(1)
  })

  it('fires regardless of hour when localFireHour is null (existing behaviour)', async () => {
    await insertUser(TIMEZONE)
    const routineId = 'routine-no-gate'
    await insertRoutine({ id: routineId, localFireHour: null })

    await processDueRoutines(
      env as unknown as { DB: D1Database; [k: string]: unknown },
    )

    // Same reasoning as above — what matters is "did NOT skip due to gate".
    expect(await countRuns(routineId)).toBe(1)
  })
})
