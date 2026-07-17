/**
 * Artifacts API — table-backed index (mounted at /api/chat/artifacts,
 * the path the original message-scan endpoint used).
 *
 *   GET    /            — the user's artifacts, newest first (?type=&q=)
 *   GET    /:id         — meta + full version list (owner only)
 *   DELETE /:id         — delete artifact + versions (owner only)
 *
 * v1 of this endpoint derived artifacts by scanning message JSON; the
 * tools now index every create/edit into the artifacts tables, so the
 * list is a straight query. Artifacts created before the table existed
 * aren't listed here — they still render inline in their transcripts.
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, sql } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { scopeUser, isCondition } from '@/server/lib/tenancy'
import { conversations } from '@/server/modules/conversations/db/schema'
import { artifacts, artifactVersions } from './db/schema'
import { getVersion, listVersions } from './store'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

app.get('/', async (c) => {
  const userId = c.get('userId')
  const typeFilter = c.req.query('type') ?? null
  const search = c.req.query('q') ?? null
  const db = drizzle(c.env.DB)

  const conditions = [scopeUser(artifacts.userId, userId)].filter(isCondition)
  if (typeFilter) conditions.push(eq(artifacts.type, typeFilter as (typeof artifacts.type.enumValues)[number]))
  if (search) {
    // SQLite LIKE has NO default escape character — backslash-escaping
    // without an explicit ESCAPE clause matches literal backslashes
    // instead of neutralising wildcards.
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
    conditions.push(sql`${artifacts.title} LIKE ${pattern} ESCAPE '\\'`)
  }

  // The conversations join is tenancy-scoped too — an artifact row
  // referencing an out-of-scope conversation must not leak its title.
  const joinConditions = [
    eq(conversations.id, artifacts.conversationId),
    scopeUser(conversations.userId, userId),
  ].filter(isCondition)

  const rows = await db
    .select({
      artifactId: artifacts.id,
      type: artifacts.type,
      title: artifacts.title,
      latestVersion: artifacts.latestVersion,
      conversationId: artifacts.conversationId,
      conversationTitle: conversations.title,
      createdAt: artifacts.createdAt,
      updatedAt: artifacts.updatedAt,
    })
    .from(artifacts)
    .leftJoin(conversations, and(...joinConditions))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(artifacts.updatedAt))
    .limit(200)

  return c.json({
    artifacts: rows.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt * 1000).toISOString(),
      updatedAt: new Date(r.updatedAt * 1000).toISOString(),
    })),
  })
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const conditions = [eq(artifacts.id, id), scopeUser(artifacts.userId, userId)].filter(isCondition)
  const [artifact] = await db.select().from(artifacts).where(and(...conditions)).limit(1)
  if (!artifact) return c.json({ error: 'Not found' }, 404)
  // Version METADATA only — full code per version via /:id/versions/:v.
  const versions = await listVersions(c.env, id)
  return c.json({ artifact, versions })
})

app.get('/:id/versions/:version', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const versionNum = Number(c.req.param('version'))
  if (!Number.isInteger(versionNum) || versionNum < 1) return c.json({ error: 'Not found' }, 404)
  const db = drizzle(c.env.DB)
  const conditions = [eq(artifacts.id, id), scopeUser(artifacts.userId, userId)].filter(isCondition)
  const [artifact] = await db
    .select({ id: artifacts.id, type: artifacts.type })
    .from(artifacts)
    .where(and(...conditions))
    .limit(1)
  if (!artifact) return c.json({ error: 'Not found' }, 404)
  const version = await getVersion(c.env, id, versionNum)
  if (!version) return c.json({ error: 'Not found' }, 404)
  return c.json({ type: artifact.type, ...version })
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const conditions = [eq(artifacts.id, id), scopeUser(artifacts.userId, userId)].filter(isCondition)
  const [existing] = await db
    .select({ id: artifacts.id })
    .from(artifacts)
    .where(and(...conditions))
    .limit(1)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  // Atomic batch — no zombie artifact if the second delete fails.
  await db.batch([
    db.delete(artifactVersions).where(eq(artifactVersions.artifactId, id)),
    db.delete(artifacts).where(eq(artifacts.id, id)),
  ])
  return c.json({ deleted: true })
})

export default app
