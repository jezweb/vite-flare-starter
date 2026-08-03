/**
 * What's New API
 *
 *   GET    /api/updates/entries      published entries (admins also see drafts)
 *   GET    /api/updates/summary      counts + newest unseen highlight
 *   POST   /api/updates/entries      admin — upsert, idempotent on releaseKey
 *   PATCH  /api/updates/entries/:id  admin, browser session only
 *   DELETE /api/updates/entries/:id  admin, browser session only
 *   PUT    /api/updates/seen         mark the feed seen for the current user
 *
 * The deploy path posts to POST /entries with an API token (scope
 * `updates:write`, and the token's user must be an admin). See
 * scripts/changelog-post.mjs.
 *
 * PATCH and DELETE are absent from `API_TOKEN_ROUTE_SCOPES`, so no bearer
 * token can reach them: automation amends by re-POSTing the same
 * releaseKey and never needs an arbitrary entry id, which keeps a leaked
 * deploy token from rewriting or erasing published history.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, gt, isNotNull, sql } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { adminMiddleware } from '@/server/middleware/admin'
import * as schema from '@/server/db/schema'
import { CHANGELOG_CATEGORIES, UPDATES_LAST_SEEN_KEY } from './db/schema'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)

const entryInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1),
  category: z.enum(CHANGELOG_CATEGORIES).default('feature'),
  version: z.string().trim().max(50).optional(),
  highlight: z.boolean().default(false),
  releaseKey: z.string().trim().min(1).max(200).optional(),
  /** Omit or pass true to publish immediately; false leaves it a draft. */
  publish: z.boolean().default(true),
})

/**
 * PATCH takes its own schema rather than `entryInputSchema.partial()`.
 *
 * `.partial()` does NOT strip `.default()` — verified against the installed
 * zod: `base.partial().parse({ title: 'x' })` returns
 * `{ title, category: 'feature', highlight: false, publish: true }`. Reusing
 * it would make every field "present", so a title-only edit would silently
 * republish a draft and wipe its category and highlight flag.
 *
 * Nullable fields accept an explicit null so a value can be cleared.
 */
export const entryPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).optional(),
  category: z.enum(CHANGELOG_CATEGORIES).optional(),
  version: z.string().trim().max(50).nullable().optional(),
  highlight: z.boolean().optional(),
  publish: z.boolean().optional(),
})

/**
 * Read the current user's last-seen marker out of user_meta.
 * Returns null when never set (every published entry is then unseen).
 */
async function readLastSeen(
  db: ReturnType<typeof drizzle<typeof schema>>,
  userId: string
): Promise<Date | null> {
  const row = await db.query.userMeta.findFirst({
    where: and(eq(schema.userMeta.userId, userId), eq(schema.userMeta.key, UPDATES_LAST_SEEN_KEY)),
    columns: { value: true },
  })
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value) as { lastSeenAt?: string }
    if (!parsed.lastSeenAt) return null
    const date = new Date(parsed.lastSeenAt)
    return Number.isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

function isAdmin(c: { get: (key: 'user') => { role?: string } | undefined }): boolean {
  return c.get('user')?.role === 'admin'
}

/**
 * GET /api/updates/entries
 *
 * Non-admins get published entries only. Admins additionally see drafts
 * (publishedAt IS NULL) so they can review before publishing.
 */
app.get(
  '/entries',
  zValidator('query', z.object({ limit: z.coerce.number().min(1).max(100).default(50) })),
  async (c) => {
    const { limit } = c.req.valid('query')
    const db = drizzle(c.env.DB, { schema })

    const entries = await db.query.changelogEntries.findMany({
      where: isAdmin(c) ? undefined : isNotNull(schema.changelogEntries.publishedAt),
      orderBy: [desc(schema.changelogEntries.publishedAt), desc(schema.changelogEntries.createdAt)],
      limit,
    })

    // `count` is this page's length, not a table total — named so a fork
    // does not wire it to a "N updates" label and get a number capped at
    // `limit`. Add real pagination here if a fork needs it.
    return c.json({ entries, count: entries.length })
  }
)

/**
 * GET /api/updates/summary
 *
 * Fetched by the sidebar, so it runs on every page in the app. Keep it
 * to these three cheap queries, and keep a multi-minute staleTime on the
 * client — /api/* is rate limited and release notes do not need to be
 * fresh to the second.
 *
 * `total` is what lets the nav item hide itself entirely on a fresh
 * fork, so a client never sees an empty "no updates yet" room.
 */
app.get('/summary', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  const lastSeen = await readLastSeen(db, userId)
  const publishedOnly = isNotNull(schema.changelogEntries.publishedAt)
  const unseenWhere = lastSeen
    ? and(publishedOnly, gt(schema.changelogEntries.publishedAt, lastSeen))
    : publishedOnly

  const [totals, unseen, highlight] = await Promise.all([
    db
      .select({
        total: sql<number>`COUNT(*)`,
        latestPublishedAt: sql<number | null>`MAX(${schema.changelogEntries.publishedAt})`,
      })
      .from(schema.changelogEntries)
      .where(publishedOnly),

    db.select({ count: sql<number>`COUNT(*)` }).from(schema.changelogEntries).where(unseenWhere),

    // Newest unseen entry flagged as a highlight — this is what earns
    // the banner. Everything else stays a quiet dot.
    db.query.changelogEntries.findFirst({
      where: and(unseenWhere, eq(schema.changelogEntries.highlight, true)),
      orderBy: [desc(schema.changelogEntries.publishedAt)],
      columns: { id: true, title: true, publishedAt: true },
    }),
  ])

  const latestRaw = totals[0]?.latestPublishedAt ?? null

  return c.json({
    total: Number(totals[0]?.total ?? 0),
    unseenCount: Number(unseen[0]?.count ?? 0),
    // Drizzle's timestamp mode stores seconds; MAX() comes back raw.
    latestPublishedAt: latestRaw === null ? null : new Date(Number(latestRaw) * 1000).toISOString(),
    highlight: highlight
      ? {
          id: highlight.id,
          title: highlight.title,
          publishedAt: highlight.publishedAt?.toISOString() ?? null,
        }
      : null,
  })
})

/**
 * POST /api/updates/entries — admin only.
 *
 * Idempotent on releaseKey: posting the same key twice updates the
 * existing entry instead of creating a duplicate, so re-running a deploy
 * is safe.
 */
app.post('/entries', adminMiddleware, zValidator('json', entryInputSchema), async (c) => {
  const input = c.req.valid('json')
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()

  // Advisory only — it decides the reported `created` flag and the status
  // code, never whether a duplicate row can exist. That guarantee lives in
  // the ON CONFLICT below, because a check-then-insert loses the race
  // between two concurrent deploys and one of them 500s on the unique index.
  const preExisting = input.releaseKey
    ? await db.query.changelogEntries.findFirst({
        where: eq(schema.changelogEntries.releaseKey, input.releaseKey),
        columns: { id: true },
      })
    : undefined

  const [row] = await db
    .insert(schema.changelogEntries)
    .values({
      title: input.title,
      body: input.body,
      category: input.category,
      version: input.version ?? null,
      highlight: input.highlight,
      releaseKey: input.releaseKey ?? null,
      publishedAt: input.publish ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    // A NULL release_key never conflicts (SQLite allows many NULLs in a
    // unique index), so hand-written entries always insert — which is what
    // we want. Only keyed re-posts take the update branch.
    .onConflictDoUpdate({
      target: schema.changelogEntries.releaseKey,
      set: {
        title: input.title,
        body: input.body,
        category: input.category,
        version: input.version ?? null,
        highlight: input.highlight,
        updatedAt: now,
        // Publication state is STICKY across re-posts. Once live, an entry
        // keeps the date users first saw it, and a re-run deploy that
        // happens to pass --draft must not yank it back out of sight.
        publishedAt: input.publish
          ? sql`COALESCE(${schema.changelogEntries.publishedAt}, excluded.published_at)`
          : sql`${schema.changelogEntries.publishedAt}`,
      },
    })
    .returning({ id: schema.changelogEntries.id })

  const created = !preExisting
  return c.json({ id: row?.id ?? null, created }, created ? 201 : 200)
})

/** PATCH /api/updates/entries/:id — admin only. */
app.patch('/entries/:id', adminMiddleware, zValidator('json', entryPatchSchema), async (c) => {
  const id = c.req.param('id')
  const input = c.req.valid('json')
  const db = drizzle(c.env.DB, { schema })

  const existing = await db.query.changelogEntries.findFirst({
    where: eq(schema.changelogEntries.id, id),
    columns: { id: true, publishedAt: true },
  })
  if (!existing) return c.json({ error: 'Entry not found' }, 404)

  const patch: Partial<typeof schema.changelogEntries.$inferInsert> = { updatedAt: new Date() }
  if (input.title !== undefined) patch.title = input.title
  if (input.body !== undefined) patch.body = input.body
  if (input.category !== undefined) patch.category = input.category
  if (input.version !== undefined) patch.version = input.version
  if (input.highlight !== undefined) patch.highlight = input.highlight
  if (input.publish !== undefined) {
    patch.publishedAt = input.publish ? (existing.publishedAt ?? new Date()) : null
  }

  await db.update(schema.changelogEntries).set(patch).where(eq(schema.changelogEntries.id, id))

  return c.json({ ok: true })
})

/** DELETE /api/updates/entries/:id — admin only. */
app.delete('/entries/:id', adminMiddleware, async (c) => {
  const id = c.req.param('id')
  const db = drizzle(c.env.DB, { schema })

  const existing = await db.query.changelogEntries.findFirst({
    where: eq(schema.changelogEntries.id, id),
    columns: { id: true },
  })
  if (!existing) return c.json({ error: 'Entry not found' }, 404)

  await db.delete(schema.changelogEntries).where(eq(schema.changelogEntries.id, id))
  return c.json({ ok: true })
})

/**
 * PUT /api/updates/seen
 *
 * The client sends the publishedAt of the newest entry it actually
 * RENDERED, not "now". If it sent now, an entry published while the page
 * was open would be marked seen without ever having been shown. The
 * server clamps: never move the marker backwards, never past the newest
 * published entry.
 */
app.put('/seen', zValidator('json', z.object({ seenAt: z.string().datetime() })), async (c) => {
  const userId = c.get('userId')
  const { seenAt } = c.req.valid('json')
  const db = drizzle(c.env.DB, { schema })

  const now = new Date()
  const requested = new Date(seenAt)

  const [newest] = await db
    .select({ latest: sql<number | null>`MAX(${schema.changelogEntries.publishedAt})` })
    .from(schema.changelogEntries)
    .where(isNotNull(schema.changelogEntries.publishedAt))

  // Upper bound: the newest published entry, or `now` when nothing is
  // published yet. Without the `now` fallback an empty feed would accept
  // an arbitrary future date and silence every entry published after it.
  const publishedCeiling = newest?.latest ? new Date(Number(newest.latest) * 1000) : null
  const ceiling = publishedCeiling ?? now

  let effective = requested > ceiling ? ceiling : requested

  // Monotonicity is enforced in SQL, not here: two concurrent requests can
  // both read the old marker and the later write would otherwise move it
  // backwards. ISO-8601 UTC strings of fixed width compare lexicographically
  // in the same order as chronologically, so a string MAX is correct.
  const value = JSON.stringify({ lastSeenAt: effective.toISOString() })

  await db
    .insert(schema.userMeta)
    .values({
      userId,
      key: UPDATES_LAST_SEEN_KEY,
      value,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.userMeta.userId, schema.userMeta.key],
      set: {
        value: sql`CASE WHEN json_extract(excluded.value, '$.lastSeenAt')
                             > json_extract(${schema.userMeta.value}, '$.lastSeenAt')
                        THEN excluded.value ELSE ${schema.userMeta.value} END`,
        updatedAt: now,
      },
    })

  // Report what is actually stored, which may be newer than this request
  // asked for if a concurrent call already moved the marker forward.
  const stored = await readLastSeen(db, userId)
  if (stored && stored > effective) effective = stored

  return c.json({ ok: true, lastSeenAt: effective.toISOString() })
})

export default app
