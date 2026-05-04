/**
 * P2-001 — multi-tenant org scoping for routines + entities.
 *
 * Verifies that:
 *   - listRoutines(env, userId, orgA) does NOT include orgB's routines
 *   - listRoutines(env, userId, orgA) DOES include orgA's routines
 *   - listRoutines(env, userId, null) shows only legacy (NULL) rows
 *   - getRoutine(env, id, userId, orgA) returns null for orgB's routine
 *   - The IS-NULL fallback keeps pre-multi-tenant rows visible to their
 *     owner in any org until a deliberate backfill.
 *
 * Same shape applies to entities (P2-001 target). Entities already had
 * `organizationId` on the schema; the route handler is what changed.
 * The routines schema gained `organization_id` in this PR.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import {
  createRoutine,
  getRoutine,
  listRoutines,
} from '@/server/modules/routines/storage'

const USER_ID = 'test-user-org-scoping'
const ORG_A = 'org-aaa'
const ORG_B = 'org-bbb'

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const stmt = env.DB.prepare(sql)
  await (params.length > 0 ? stmt.bind(...params).run() : stmt.run())
}

async function ensureSchema(): Promise<void> {
  // Routines table mirroring the Drizzle schema. Includes the new
  // organization_id column added in 20260504_org_id_on_routines_entities.
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
}

async function clearTable(): Promise<void> {
  await runSql('DELETE FROM routines WHERE user_id = ?', [USER_ID])
}

const baseEnv = () => env as unknown as { DB: D1Database }

describe('routines storage — org scoping (P2-001)', () => {
  beforeAll(async () => {
    await ensureSchema()
  })

  beforeEach(async () => {
    await clearTable()
  })

  it('listRoutines for orgA does not include orgB routines', async () => {
    await createRoutine(baseEnv(), {
      userId: USER_ID,
      organizationId: ORG_A,
      name: 'In Org A',
      agentClass: 'AssistantAgent',
      agentName: 'a',
      triggerKind: 'schedule',
    })
    await createRoutine(baseEnv(), {
      userId: USER_ID,
      organizationId: ORG_B,
      name: 'In Org B',
      agentClass: 'AssistantAgent',
      agentName: 'b',
      triggerKind: 'schedule',
    })

    const aRows = await listRoutines(baseEnv(), USER_ID, ORG_A)
    const aNames = aRows.map((r) => r.name)
    expect(aNames).toContain('In Org A')
    expect(aNames).not.toContain('In Org B')

    const bRows = await listRoutines(baseEnv(), USER_ID, ORG_B)
    const bNames = bRows.map((r) => r.name)
    expect(bNames).toContain('In Org B')
    expect(bNames).not.toContain('In Org A')
  })

  it('legacy (NULL organization_id) rows stay visible in any org', async () => {
    await createRoutine(baseEnv(), {
      userId: USER_ID,
      // No organizationId — pre-multi-tenant row.
      name: 'Legacy routine',
      agentClass: 'AssistantAgent',
      agentName: 'legacy',
      triggerKind: 'schedule',
    })

    const aRows = await listRoutines(baseEnv(), USER_ID, ORG_A)
    expect(aRows.map((r) => r.name)).toContain('Legacy routine')

    const bRows = await listRoutines(baseEnv(), USER_ID, ORG_B)
    expect(bRows.map((r) => r.name)).toContain('Legacy routine')

    const personalRows = await listRoutines(baseEnv(), USER_ID, null)
    expect(personalRows.map((r) => r.name)).toContain('Legacy routine')
  })

  it('listRoutines with null orgId only shows legacy rows', async () => {
    await createRoutine(baseEnv(), {
      userId: USER_ID,
      organizationId: ORG_A,
      name: 'Org A only',
      agentClass: 'AssistantAgent',
      agentName: 'a',
      triggerKind: 'schedule',
    })
    await createRoutine(baseEnv(), {
      userId: USER_ID,
      name: 'Personal only',
      agentClass: 'AssistantAgent',
      agentName: 'p',
      triggerKind: 'schedule',
    })

    const personalRows = await listRoutines(baseEnv(), USER_ID, null)
    const names = personalRows.map((r) => r.name)
    expect(names).toContain('Personal only')
    expect(names).not.toContain('Org A only')
  })

  it('getRoutine for orgA returns null for orgB routine', async () => {
    const created = await createRoutine(baseEnv(), {
      userId: USER_ID,
      organizationId: ORG_B,
      name: 'In Org B',
      agentClass: 'AssistantAgent',
      agentName: 'b',
      triggerKind: 'schedule',
    })
    const fromA = await getRoutine(baseEnv(), created.id, USER_ID, ORG_A)
    expect(fromA).toBeNull()
    const fromB = await getRoutine(baseEnv(), created.id, USER_ID, ORG_B)
    expect(fromB).not.toBeNull()
  })
})
