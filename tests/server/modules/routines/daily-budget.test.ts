/**
 * #12 — per-routine dailyBudgetUsd enforcement in the scheduler.
 *
 * dailyBudgetUsd is stored on the routine but used to be ignored by the
 * cron sweeper, so a runaway routine could spend without bound. The gate
 * sums the routine agent's spend from agent_runs since UTC midnight and
 * skips the fire once it reaches the cap.
 *
 * This verifies the security-relevant path: a due routine whose agent has
 * already spent past its cap today is CONSIDERED but NOT FIRED, with no
 * error. (We don't exercise the under-budget path here because that would
 * actually invoke the target Durable Object.)
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { processDueRoutines } from '@/server/modules/routines/scheduler'

const USER_ID = 'test-user-budget'
const AGENT_CLASS = 'AssistantAgent'
const AGENT_NAME = 'budget-test-instance'

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
  // Minimal agent_runs — only the columns the budget SUM query reads.
  await runSql(`CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    agent_class TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    cost_usd REAL,
    started_at INTEGER NOT NULL
  )`)
}

async function insertDueRoutine(dailyBudgetUsd: number | null): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await runSql(
    `INSERT INTO routines (id, user_id, name, agent_class, agent_name, trigger_kind,
       enabled, base_interval, effective_interval, daily_budget_usd, created_at, updated_at, last_run_at)
     VALUES (?, ?, ?, ?, ?, 'schedule', 1, 900, 900, ?, ?, ?, NULL)`,
    ['r-budget', USER_ID, 'Budget routine', AGENT_CLASS, AGENT_NAME, dailyBudgetUsd, now, now]
  )
}

async function insertSpend(costUsd: number, startedAt: number): Promise<void> {
  await runSql(
    `INSERT INTO agent_runs (id, agent_class, agent_name, user_id, cost_usd, started_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [`run-${costUsd}-${startedAt}`, AGENT_CLASS, AGENT_NAME, USER_ID, costUsd, startedAt]
  )
}

const baseEnv = () => env as unknown as { DB: D1Database }

describe('routines scheduler — dailyBudgetUsd enforcement (#12)', () => {
  beforeAll(async () => {
    await ensureSchema()
  })

  beforeEach(async () => {
    await runSql('DELETE FROM routines WHERE user_id = ?', [USER_ID])
    await runSql('DELETE FROM agent_runs WHERE user_id = ?', [USER_ID])
  })

  it('skips a due routine whose agent is over its daily budget', async () => {
    await insertDueRoutine(1.0)
    const now = Math.floor(Date.now() / 1000)
    // Two runs today summing to $1.20 — over the $1.00 cap.
    await insertSpend(0.7, now - 60)
    await insertSpend(0.5, now - 30)

    const result = await processDueRoutines(baseEnv())
    expect(result.considered).toBe(1)
    expect(result.fired).toBe(0)
    expect(result.errors).toBe(0)
  })

  it('does not count spend from before UTC midnight against today', async () => {
    await insertDueRoutine(1.0)
    const now = Math.floor(Date.now() / 1000)
    const startOfDay = now - (now % 86400)
    // $5 spent yesterday (just before midnight) must NOT block today.
    await insertSpend(5.0, startOfDay - 120)
    // Today's spend is $0, so the routine is under budget and the gate
    // does NOT skip it — it proceeds to fire. We only assert the budget
    // gate let it through (it was considered and not budget-skipped); the
    // actual DO fire is environment-dependent, so we just check it wasn't
    // blocked on budget grounds by confirming it was attempted.
    const result = await processDueRoutines(baseEnv())
    expect(result.considered).toBe(1)
    // fired + errors === 1 means it got past the budget gate to the fire
    // attempt (success or DO error), rather than being silently skipped.
    expect(result.fired + result.errors).toBe(1)
  })
})
