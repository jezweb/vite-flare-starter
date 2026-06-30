/**
 * Entity-access oracle (#95 polymorphic-IDOR capstone).
 *
 * Verifies the contract that comments + watchers gate through:
 *   - owner can access their own entity (exact resolver + fallback paths)
 *   - a different user is denied
 *   - a missing entity is denied (fail closed)
 *   - an unregistered type with no fallback hit is denied
 *
 * Runs in the default per-user tenancy mode (VITE_TENANCY_MODE unset).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import { canAccessEntity } from '@/server/lib/entity-access'

const OWNER = 'user-owner'
const OTHER = 'user-other'

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const stmt = env.DB.prepare(sql)
  await (params.length > 0 ? stmt.bind(...params).run() : stmt.run())
}

async function ensureSchema(): Promise<void> {
  // Minimal shapes — only the columns the resolvers SELECT.
  await runSql(`CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, organization_id TEXT, type TEXT NOT NULL
  )`)
  await runSql(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL
  )`)
  await runSql(`CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY, userId TEXT NOT NULL
  )`)
}

const baseEnv = () => env as unknown as { DB: D1Database }

describe('entity-access oracle — canAccessEntity (#95)', () => {
  beforeAll(async () => {
    await ensureSchema()
    await runSql(`INSERT OR REPLACE INTO entities (id, user_id, type) VALUES ('ent-1', ?, 'issue')`, [
      OWNER,
    ])
    await runSql(`INSERT OR REPLACE INTO conversations (id, user_id) VALUES ('conv-1', ?)`, [OWNER])
  })

  it('allows the owner (entities fallback resolver, dynamic type)', async () => {
    expect(await canAccessEntity(baseEnv(), 'issue', 'ent-1', OWNER)).toBe(true)
  })

  it('denies a different user on the same entity (IDOR blocked)', async () => {
    expect(await canAccessEntity(baseEnv(), 'issue', 'ent-1', OTHER)).toBe(false)
  })

  it('allows the owner via the exact conversation resolver', async () => {
    expect(await canAccessEntity(baseEnv(), 'conversation', 'conv-1', OWNER)).toBe(true)
  })

  it('denies a different user on a conversation', async () => {
    expect(await canAccessEntity(baseEnv(), 'conversation', 'conv-1', OTHER)).toBe(false)
  })

  it('denies a missing entity (fail closed)', async () => {
    expect(await canAccessEntity(baseEnv(), 'issue', 'does-not-exist', OWNER)).toBe(false)
  })
})
