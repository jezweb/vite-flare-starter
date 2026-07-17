/**
 * Share tokens (#62(4)) — public endpoint lifecycle against real D1.
 *
 * The security-relevant behaviours pinned here: only the SHA-256 hash
 * is stored, the public endpoint 404s uniformly for unknown / revoked /
 * expired tokens, and the resolver payload excludes owner identity and
 * internal references.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import { Hono } from 'hono'
import { publicShareRoutes } from '@/server/modules/share-tokens/routes'

const NOW = Math.floor(Date.now() / 1000)

const app = new Hono<{ Bindings: { DB: D1Database } }>().route('/api/share', publicShareRoutes)
const get = (token: string) =>
  app.request(`/api/share/${token}`, {}, { DB: env.DB })

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

const RAW_LIVE = 'a'.repeat(64)
const RAW_REVOKED = 'b'.repeat(64)
const RAW_EXPIRED = 'c'.repeat(64)

beforeAll(async () => {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS share_tokens (
       id TEXT PRIMARY KEY, user_id TEXT NOT NULL, entity_type TEXT NOT NULL,
       entity_id TEXT NOT NULL, token_hash TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT 'view',
       expires_at INTEGER, revoked_at INTEGER, access_count INTEGER NOT NULL DEFAULT 0,
       last_accessed_at INTEGER, created_at INTEGER NOT NULL
     )`
  ).run()
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS entities (
       id TEXT PRIMARY KEY, user_id TEXT NOT NULL, organization_id TEXT, type TEXT NOT NULL,
       external_id TEXT, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
       assignee_id TEXT, fields TEXT NOT NULL DEFAULT '{}',
       created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
     )`
  ).run()
  await env.DB.prepare(`DELETE FROM share_tokens`).run()
  await env.DB.prepare(`DELETE FROM entities WHERE id LIKE 'share-e%'`).run()

  await env.DB.prepare(
    `INSERT INTO entities (id, user_id, type, external_id, title, status, fields, created_at, updated_at)
     VALUES ('share-e1', 'owner-1', 'note', 'JIRA-99', 'Shared note', 'open', '{"body":"public text"}', ?, ?)`
  )
    .bind(NOW, NOW)
    .run()

  const insert = async (raw: string, extra: { revoked?: number; expires?: number | null }) =>
    env.DB.prepare(
      `INSERT INTO share_tokens (id, user_id, entity_type, entity_id, token_hash, expires_at, revoked_at, created_at)
       VALUES (?, 'owner-1', 'entity', 'share-e1', ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        await sha256Hex(raw),
        extra.expires === undefined ? null : extra.expires,
        extra.revoked ?? null,
        NOW
      )
      .run()

  await insert(RAW_LIVE, { expires: NOW + 3600 })
  await insert(RAW_REVOKED, { revoked: NOW - 10, expires: NOW + 3600 })
  await insert(RAW_EXPIRED, { expires: NOW - 10 })
})

describe('public share endpoint', () => {
  it('resolves a live token to the resolver payload only', async () => {
    const res = await get(RAW_LIVE)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { payload: Record<string, unknown> }
    expect(body.payload['title']).toBe('Shared note')
    expect(body.payload['fields']).toEqual({ body: 'public text' })
    // Owner identity and internal references must not leak.
    expect(body.payload['userId']).toBeUndefined()
    expect(body.payload['user_id']).toBeUndefined()
    expect(body.payload['externalId']).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('owner-1')
    expect(JSON.stringify(body)).not.toContain('JIRA-99')
  })

  it('bumps accessCount on resolve', async () => {
    await get(RAW_LIVE)
    const [row] = (
      await env.DB.prepare(
        `SELECT access_count FROM share_tokens WHERE token_hash = ?`
      )
        .bind(await sha256Hex(RAW_LIVE))
        .all()
    ).results
    expect(Number(row!['access_count'])).toBeGreaterThanOrEqual(2)
  })

  it('404s uniformly: unknown, revoked, expired, malformed', async () => {
    for (const t of ['f'.repeat(64), RAW_REVOKED, RAW_EXPIRED, 'not-a-token', '']) {
      const res = await get(t)
      expect(res.status, `token=${t.slice(0, 8)}…`).toBe(404)
      if (t !== '') {
        expect(await res.text()).toContain('Not found')
      }
    }
  })

  it('never stores the raw token', async () => {
    const rows = (await env.DB.prepare(`SELECT token_hash FROM share_tokens`).all()).results
    for (const r of rows) {
      expect(r['token_hash']).not.toBe(RAW_LIVE)
      expect(r['token_hash']).not.toBe(RAW_REVOKED)
      expect(r['token_hash']).not.toBe(RAW_EXPIRED)
    }
  })
})
