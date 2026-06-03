/**
 * P2-005 — sweepStaleRoutineRuns flips abandoned 'started' runs to 'error'.
 *
 * The manual-fire path uses `c.executionCtx.waitUntil(fireRoutine(...))`.
 * If the worker isolate is killed before fireRoutine completes (CPU
 * limit, waitUntil cap), the run row stays at outcome='started' forever
 * and the UI spins "Running" indefinitely. The sweeper closes that gap.
 *
 * What this test pins:
 *   1. A 'started' run older than the grace window is flipped to 'error'
 *      with a descriptive summary and a finished_at timestamp.
 *   2. A 'started' run NEWER than the grace window is left alone (the
 *      run might still be in-flight).
 *   3. Already-finished runs (ok / error / budget_exceeded) are untouched.
 *   4. The parent routines.last_outcome mirror also flips to 'error'.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { sweepStaleRoutineRuns } from '@/server/modules/routines/scheduler'

const ROUTINE_ID = 'r-test-stale-sweep'

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const stmt = env.DB.prepare(sql)
  await (params.length > 0 ? stmt.bind(...params).run() : stmt.run())
}

async function ensureSchema(): Promise<void> {
  await runSql(`CREATE TABLE IF NOT EXISTS routines (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    organization_id TEXT,
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
}

async function reset(): Promise<void> {
  await runSql('DELETE FROM routine_runs')
  await runSql('DELETE FROM routines')
  const now = Math.floor(Date.now() / 1000)
  await runSql(
    `INSERT INTO routines (id, user_id, name, agent_class, agent_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ROUTINE_ID, 'u-test', 'Test', 'AssistantAgent', 'a', now, now]
  )
}

async function insertRun(opts: {
  id: string
  startedAgo: number
  outcome: 'started' | 'ok' | 'error' | 'budget_exceeded'
}): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await runSql(
    `INSERT INTO routine_runs (id, routine_id, run_number, started_at, outcome) VALUES (?, ?, ?, ?, ?)`,
    [opts.id, ROUTINE_ID, 1, now - opts.startedAgo, opts.outcome]
  )
}

async function getRun(id: string) {
  return env.DB.prepare(
    `SELECT outcome, finished_at, output_summary FROM routine_runs WHERE id = ?`
  )
    .bind(id)
    .first<{ outcome: string; finished_at: number | null; output_summary: string | null }>()
}

const baseEnv = () => env as unknown as { DB: D1Database; [k: string]: unknown }

describe('sweepStaleRoutineRuns (P2-005)', () => {
  beforeAll(async () => {
    await ensureSchema()
  })

  beforeEach(async () => {
    await reset()
  })

  it('flips an abandoned started run older than grace to error', async () => {
    await insertRun({ id: 'old-stuck', startedAgo: 600, outcome: 'started' }) // 10 min old
    const result = await sweepStaleRoutineRuns(baseEnv(), { graceSeconds: 300 })
    expect(result.swept).toBe(1)
    const run = await getRun('old-stuck')
    expect(run?.outcome).toBe('error')
    expect(run?.finished_at).not.toBeNull()
    expect(run?.output_summary).toMatch(/abandoned/)
  })

  it('leaves a recent started run alone (might still be in-flight)', async () => {
    await insertRun({ id: 'recent', startedAgo: 60, outcome: 'started' })
    const result = await sweepStaleRoutineRuns(baseEnv(), { graceSeconds: 300 })
    expect(result.swept).toBe(0)
    const run = await getRun('recent')
    expect(run?.outcome).toBe('started')
  })

  it('does not touch already-finished runs', async () => {
    await insertRun({ id: 'done-ok', startedAgo: 600, outcome: 'ok' })
    await insertRun({ id: 'done-error', startedAgo: 600, outcome: 'error' })
    const result = await sweepStaleRoutineRuns(baseEnv(), { graceSeconds: 300 })
    expect(result.swept).toBe(0)
    expect((await getRun('done-ok'))?.outcome).toBe('ok')
    expect((await getRun('done-error'))?.outcome).toBe('error')
  })

  it('mirrors the error outcome onto the parent routine row', async () => {
    await insertRun({ id: 'old-stuck-2', startedAgo: 600, outcome: 'started' })
    await sweepStaleRoutineRuns(baseEnv(), { graceSeconds: 300 })
    const routine = await env.DB.prepare(`SELECT last_outcome FROM routines WHERE id = ?`)
      .bind(ROUTINE_ID)
      .first<{ last_outcome: string | null }>()
    expect(routine?.last_outcome).toBe('error')
  })
})
