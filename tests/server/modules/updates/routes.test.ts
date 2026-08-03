/**
 * What's New routes — behaviours that would silently rot if they broke.
 *
 * Runs through the REAL middleware chain (authMiddleware →
 * adminMiddleware) using bearer tokens, so the deny-by-default API-token
 * route table and the admin gate are exercised rather than mocked.
 *
 * Pinned here:
 *   - posting the same releaseKey twice yields ONE row (a re-run deploy
 *     must not double-post)
 *   - non-admins get 403 on every write
 *   - an empty table reports zero, which is what lets the nav item hide
 *     itself on a fresh fork
 *   - the seen marker stores the newest RENDERED publishedAt, never
 *     "now" — otherwise an entry published while the page is open is
 *     marked seen without ever being shown
 *   - drafts (publishedAt NULL) are invisible to non-admins
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { Hono } from 'hono'
import updatesRoutes, { entryPatchSchema } from '@/server/modules/updates/routes'

const app = new Hono().route('/api/updates', updatesRoutes)

const ADMIN_ID = 'updates-admin'
const USER_ID = 'updates-user'
const ADMIN_TOKEN = 'a'.repeat(48)
const USER_TOKEN = 'u'.repeat(48)

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

function call(path: string, token: string, init: RequestInit = {}) {
  return app.request(
    `/api/updates${path}`,
    {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    },
    env as unknown as Record<string, unknown>
  )
}

const post = (path: string, token: string, body: unknown) =>
  call(path, token, { method: 'POST', body: JSON.stringify(body) })

beforeAll(async () => {
  // Mirrors src/server/modules/auth/db/schema.ts. The ban* columns and
  // the ISO-TEXT createdAt/updatedAt are load-bearing: authMiddleware
  // selects every column, and drizzle's isoTimestamp custom type throws
  // on a missing/integer value rather than returning null.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS user (
       id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL UNIQUE,
       emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT,
       role TEXT NOT NULL DEFAULT 'user', preferences TEXT,
       memoryUpdateMode TEXT NOT NULL DEFAULT 'auto',
       lastLoginMethod TEXT, banned INTEGER DEFAULT 0, banReason TEXT, banExpires TEXT,
       createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
     )`
  ).run()
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS apiTokens (
       id TEXT PRIMARY KEY, userId TEXT NOT NULL, name TEXT NOT NULL,
       token TEXT NOT NULL UNIQUE, tokenPrefix TEXT NOT NULL,
       scopes TEXT NOT NULL DEFAULT '', lastUsedAt INTEGER, expiresAt INTEGER,
       createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
     )`
  ).run()
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS changelog_entries (
       id TEXT PRIMARY KEY, release_key TEXT, title TEXT NOT NULL, body TEXT NOT NULL,
       category TEXT NOT NULL DEFAULT 'feature', version TEXT,
       highlight INTEGER NOT NULL DEFAULT 0, published_at INTEGER,
       created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
     )`
  ).run()
  await env.DB.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS changelog_entries_release_key_idx
       ON changelog_entries (release_key)`
  ).run()
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS user_meta (
       id TEXT PRIMARY KEY, user_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
       created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
     )`
  ).run()
  // Load-bearing, not decoration: PUT /seen upserts with
  // ON CONFLICT (user_id, key), which SQLite rejects outright unless a
  // matching unique index exists. Mirrors user-meta's own schema.
  await env.DB.prepare(
    'CREATE UNIQUE INDEX IF NOT EXISTS user_meta_user_key_idx ON user_meta (user_id, key)'
  ).run()

  const now = Math.floor(Date.now() / 1000)
  const nowIso = new Date().toISOString()
  const seedUser = (id: string, email: string, role: string) =>
    env.DB.prepare(
      `INSERT OR REPLACE INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, ?, ?, ?)`
    )
      .bind(id, id, email, role, nowIso, nowIso)
      .run()

  await seedUser(ADMIN_ID, 'admin@updates.test', 'admin')
  await seedUser(USER_ID, 'user@updates.test', 'user')

  const seedToken = async (userId: string, raw: string) =>
    env.DB.prepare(
      `INSERT OR REPLACE INTO apiTokens (id, userId, name, token, tokenPrefix, scopes, createdAt, updatedAt)
       VALUES (?, ?, 'test', ?, 'vfs_test', 'updates:read,updates:write', ?, ?)`
    )
      .bind(`${userId}-token`, userId, await sha256Hex(raw), now, now)
      .run()

  await seedToken(ADMIN_ID, ADMIN_TOKEN)
  await seedToken(USER_ID, USER_TOKEN)
})

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM changelog_entries').run()
  await env.DB.prepare(`DELETE FROM user_meta WHERE key = 'updates:last-seen'`).run()
})

describe('POST /entries idempotency', () => {
  it('posting the same releaseKey twice updates one row instead of adding a second', async () => {
    const body = {
      title: 'Faster search',
      body: 'Search now returns in under 100ms.',
      releaseKey: 'v2.2.0',
    }

    const first = await post('/entries', ADMIN_TOKEN, body)
    expect(first.status).toBe(201)
    const firstJson = (await first.json()) as { id: string; created: boolean }
    expect(firstJson.created).toBe(true)

    const second = await post('/entries', ADMIN_TOKEN, { ...body, title: 'Faster search (v2)' })
    expect(second.status).toBe(200)
    const secondJson = (await second.json()) as { id: string; created: boolean }
    expect(secondJson.created).toBe(false)
    expect(secondJson.id).toBe(firstJson.id)

    const rows = await env.DB.prepare(
      `SELECT id, title FROM changelog_entries WHERE release_key = 'v2.2.0'`
    ).all()
    expect(rows.results).toHaveLength(1)
    expect(rows.results[0]?.['title']).toBe('Faster search (v2)')
  })

  it('will not unpublish a live entry when a re-run deploy passes --draft', async () => {
    // Publication is sticky across re-posts: a deploy script rerun with a
    // stray --draft must not yank a live entry out of users' sight.
    const body = { title: 'Live thing', body: 'x', releaseKey: 'v9.9.9' }
    await post('/entries', ADMIN_TOKEN, body)
    await post('/entries', ADMIN_TOKEN, { ...body, publish: false })

    const row = await env.DB.prepare(
      `SELECT published_at FROM changelog_entries WHERE release_key = 'v9.9.9'`
    ).first<{ published_at: number | null }>()
    expect(row?.published_at).not.toBeNull()
  })

  it('keeps the original publish time when an already-live entry is re-posted', async () => {
    const body = { title: 'A', body: 'B', releaseKey: 'v2.3.0' }
    await post('/entries', ADMIN_TOKEN, body)
    const before = await env.DB.prepare(
      `SELECT published_at FROM changelog_entries WHERE release_key = 'v2.3.0'`
    ).first<{ published_at: number }>()

    await new Promise((r) => setTimeout(r, 1100))
    await post('/entries', ADMIN_TOKEN, { ...body, title: 'A revised' })

    const after = await env.DB.prepare(
      `SELECT published_at FROM changelog_entries WHERE release_key = 'v2.3.0'`
    ).first<{ published_at: number }>()
    expect(after?.published_at).toBe(before?.published_at)
  })
})

describe('admin gate', () => {
  it('rejects a non-admin trying to post an entry', async () => {
    await post('/entries', ADMIN_TOKEN, { title: 'T', body: 'B', releaseKey: 'v1' })

    // adminMiddleware is what rejects this: the token carries
    // updates:write and the route IS allow-listed, but its owner is not
    // an admin. (PATCH/DELETE are covered separately — they are refused
    // one layer earlier, for every token regardless of role.)
    const write = await post('/entries', USER_TOKEN, { title: 'X', body: 'Y' })
    expect(write.status).toBe(403)

    const rows = await env.DB.prepare('SELECT title FROM changelog_entries').all()
    expect(rows.results).toHaveLength(1)
    expect(rows.results[0]?.['title']).toBe('T')
  })

  it('lets a non-admin read the feed', async () => {
    await post('/entries', ADMIN_TOKEN, { title: 'Public', body: 'Visible' })
    const res = await call('/entries', USER_TOKEN)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { entries: Array<{ title: string }> }
    expect(json.entries.map((e) => e.title)).toEqual(['Public'])
  })

  it('hides drafts from non-admins but shows them to admins', async () => {
    await post('/entries', ADMIN_TOKEN, { title: 'Draft', body: 'Not yet', publish: false })

    const asUser = (await (await call('/entries', USER_TOKEN)).json()) as { entries: unknown[] }
    expect(asUser.entries).toHaveLength(0)

    const asAdmin = (await (await call('/entries', ADMIN_TOKEN)).json()) as { entries: unknown[] }
    expect(asAdmin.entries).toHaveLength(1)
  })
})

describe('PATCH schema', () => {
  it('omits absent fields entirely — no zod defaults leak in', () => {
    // The trap this guards: `entryInputSchema.partial()` does NOT strip
    // `.default()`. Verified against the installed zod — it returns
    // { title, category: 'feature', highlight: false, publish: true }.
    // Reusing it here made every field "present", so a title-only edit
    // republished a draft and wiped its category and highlight.
    const parsed = entryPatchSchema.parse({ title: 'Just the title' })
    expect(parsed).toEqual({ title: 'Just the title' })
    expect(parsed.publish).toBeUndefined()
    expect(parsed.category).toBeUndefined()
    expect(parsed.highlight).toBeUndefined()
  })

  it('accepts an explicit null so a nullable field can be cleared', () => {
    expect(entryPatchSchema.parse({ version: null })).toEqual({ version: null })
  })
})

describe('PATCH and DELETE are session-only', () => {
  it('refuses an API token even when it carries updates:write', async () => {
    // A deploy amends by re-POSTing the same releaseKey, so automation
    // never needs to reach an arbitrary entry id. Keeping PATCH/DELETE
    // out of the token allowlist means a leaked deploy token cannot
    // rewrite or erase published history.
    const created = await post('/entries', ADMIN_TOKEN, { title: 'T', body: 'B' })
    const { id } = (await created.json()) as { id: string }

    const patch = await call(`/entries/${id}`, ADMIN_TOKEN, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'rewritten' }),
    })
    expect(patch.status).toBe(403)

    const del = await call(`/entries/${id}`, ADMIN_TOKEN, { method: 'DELETE' })
    expect(del.status).toBe(403)

    const row = await env.DB.prepare('SELECT title FROM changelog_entries WHERE id = ?')
      .bind(id)
      .first<{ title: string }>()
    expect(row?.title).toBe('T')
  })
})

describe('GET /summary', () => {
  it('reports zero on an empty table, which is what hides the nav item', async () => {
    const res = await call('/summary', USER_TOKEN)
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      total: number
      unseenCount: number
      latestPublishedAt: string | null
      highlight: unknown
    }
    expect(json.total).toBe(0)
    expect(json.unseenCount).toBe(0)
    expect(json.latestPublishedAt).toBeNull()
    expect(json.highlight).toBeNull()
  })

  it('does not count drafts toward the total', async () => {
    await post('/entries', ADMIN_TOKEN, { title: 'Live', body: 'x' })
    await post('/entries', ADMIN_TOKEN, { title: 'Draft', body: 'y', publish: false })

    const json = (await (await call('/summary', USER_TOKEN)).json()) as { total: number }
    expect(json.total).toBe(1)
  })

  it('surfaces only a highlighted entry as the banner candidate', async () => {
    await post('/entries', ADMIN_TOKEN, { title: 'Routine fix', body: 'x', category: 'fix' })
    const plain = (await (await call('/summary', USER_TOKEN)).json()) as { highlight: unknown }
    expect(plain.highlight).toBeNull()

    await post('/entries', ADMIN_TOKEN, { title: 'Big release', body: 'y', highlight: true })
    const flagged = (await (await call('/summary', USER_TOKEN)).json()) as {
      highlight: { title: string } | null
    }
    expect(flagged.highlight?.title).toBe('Big release')
  })
})

describe('PUT /seen', () => {
  it('stores the newest RENDERED publishedAt, not "now"', async () => {
    await post('/entries', ADMIN_TOKEN, { title: 'Seen one', body: 'x' })

    const summary = (await (await call('/summary', USER_TOKEN)).json()) as {
      latestPublishedAt: string
    }

    // The client marks seen with the entry it rendered. If the server
    // stamped "now" instead, an entry published a moment later would be
    // swallowed — this asserts the stored marker equals the entry time.
    const res = await call('/seen', USER_TOKEN, {
      method: 'PUT',
      body: JSON.stringify({ seenAt: summary.latestPublishedAt }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { lastSeenAt: string }
    expect(json.lastSeenAt).toBe(summary.latestPublishedAt)

    const after = (await (await call('/summary', USER_TOKEN)).json()) as { unseenCount: number }
    expect(after.unseenCount).toBe(0)
  })

  it('clamps a future seenAt to the newest published entry', async () => {
    await post('/entries', ADMIN_TOKEN, { title: 'Only entry', body: 'x' })
    const summary = (await (await call('/summary', USER_TOKEN)).json()) as {
      latestPublishedAt: string
    }

    const far = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
    const res = await call('/seen', USER_TOKEN, {
      method: 'PUT',
      body: JSON.stringify({ seenAt: far }),
    })
    const json = (await res.json()) as { lastSeenAt: string }
    expect(json.lastSeenAt).toBe(summary.latestPublishedAt)
  })

  it('never moves the marker backwards', async () => {
    await post('/entries', ADMIN_TOKEN, { title: 'Entry', body: 'x' })
    const summary = (await (await call('/summary', USER_TOKEN)).json()) as {
      latestPublishedAt: string
    }

    await call('/seen', USER_TOKEN, {
      method: 'PUT',
      body: JSON.stringify({ seenAt: summary.latestPublishedAt }),
    })

    const old = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    const res = await call('/seen', USER_TOKEN, {
      method: 'PUT',
      body: JSON.stringify({ seenAt: old }),
    })
    const json = (await res.json()) as { lastSeenAt: string }
    expect(json.lastSeenAt).toBe(summary.latestPublishedAt)
  })

  it('counts every published entry as unseen for a user who has never looked', async () => {
    await post('/entries', ADMIN_TOKEN, { title: 'One', body: 'x' })
    await post('/entries', ADMIN_TOKEN, { title: 'Two', body: 'y' })

    const json = (await (await call('/summary', USER_TOKEN)).json()) as { unseenCount: number }
    expect(json.unseenCount).toBe(2)
  })
})
