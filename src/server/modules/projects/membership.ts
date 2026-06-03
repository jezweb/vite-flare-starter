/**
 * Project membership routes — multi-user Projects (Task #10 / Phase 5).
 *
 * Mounted at /api/projects/:id/members. Adds a project_members layer
 * over the existing solo-owner model.
 *
 * Dual-read semantics:
 *   - The creator (projects.user_id) is always treated as owner — no
 *     row in project_members needed for legacy projects.
 *   - Anyone with a project_members row has access at their role
 *     level (owner | editor | viewer).
 *
 * Roles:
 *   owner   — only the creator. Can manage members + delete project.
 *   editor  — full read + write (chat, files, memory, instructions)
 *   viewer  — read-only (no new conversations / memory updates)
 *
 * Phase 5 MVP: invite by userId only (backed by the user list). Email
 * invites for off-platform users land in Phase 6.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { projects, projectMembers } from './db/schema'
import { user as userTable } from '@/server/modules/auth/db/schema'
import type { ProjectMemberRole } from './db/schema'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

/** GET /api/projects/:id/members — list members + invited-by info. */
app.get('/:id/members', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isProjectMember(c.env.DB, id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const d = drizzle(c.env.DB)
  // Pull project_members rows + the implicit owner (creator).
  const [proj] = await d
    .select({ id: projects.id, ownerId: projects.userId })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1)
  if (!proj) return c.json({ error: 'Not found' }, 404)
  const memberRows = await d
    .select({
      id: projectMembers.id,
      userId: projectMembers.userId,
      role: projectMembers.role,
      invitedByUserId: projectMembers.invitedByUserId,
      joinedAt: projectMembers.joinedAt,
    })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, id))
  // Join member user info in a single follow-up query.
  const userIds = Array.from(
    new Set([proj.ownerId, ...memberRows.map((m) => m.userId).filter(Boolean)])
  )
  const userInfo = await d
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
    })
    .from(userTable)
    .where(buildInArray(userTable.id, userIds))
  const userMap = new Map(userInfo.map((u) => [u.id, u]))
  // The creator is shown first as 'owner' even when no row in project_members exists.
  const ownerEntry = {
    id: 'owner-implicit',
    userId: proj.ownerId,
    role: 'owner' as ProjectMemberRole,
    invitedByUserId: null,
    joinedAt: 0,
    user: userMap.get(proj.ownerId) ?? null,
  }
  const members = memberRows.map((m) => ({
    ...m,
    user: m.userId ? (userMap.get(m.userId) ?? null) : null,
  }))
  return c.json({ members: [ownerEntry, ...members] })
})

const InviteSchema = z.object({
  userId: z.string(),
  role: z.enum(['editor', 'viewer']).default('editor'),
})
app.post('/:id/members', zValidator('json', InviteSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await isProjectOwner(c.env.DB, id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const body = c.req.valid('json')
  if (body.userId === userId) {
    return c.json({ error: 'You are already the owner' }, 400)
  }
  const d = drizzle(c.env.DB)
  await d
    .insert(projectMembers)
    .values({
      projectId: id,
      userId: body.userId,
      role: body.role,
      invitedByUserId: userId,
    })
    .onConflictDoNothing()
  return c.json({ ok: true }, 201)
})

const UpdateRoleSchema = z.object({
  role: z.enum(['editor', 'viewer']),
})
app.patch('/:id/members/:memberId', zValidator('json', UpdateRoleSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const memberId = c.req.param('memberId')
  if (!(await isProjectOwner(c.env.DB, id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const body = c.req.valid('json')
  await drizzle(c.env.DB)
    .update(projectMembers)
    .set({ role: body.role })
    .where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, id)))
  return c.json({ ok: true })
})

app.delete('/:id/members/:memberId', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const memberId = c.req.param('memberId')
  const d = drizzle(c.env.DB)
  // Self-leave OR owner removing.
  const [target] = await d
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, id)))
    .limit(1)
  if (!target) return c.json({ error: 'Not found' }, 404)
  const isSelf = target.userId === userId
  const isOwner = await isProjectOwner(c.env.DB, id, userId)
  if (!isSelf && !isOwner) return c.json({ error: 'Forbidden' }, 403)
  await d.delete(projectMembers).where(eq(projectMembers.id, memberId))
  return c.json({ ok: true })
})

// ─── Helpers ──────────────────────────────────────────────────────

export async function isProjectOwner(
  db: D1Database,
  projectId: string,
  userId: string
): Promise<boolean> {
  const [row] = await drizzle(db)
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)
  return !!row
}

export async function isProjectMember(
  db: D1Database,
  projectId: string,
  userId: string
): Promise<boolean> {
  if (await isProjectOwner(db, projectId, userId)) return true
  const [row] = await drizzle(db)
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1)
  return !!row
}

// drizzle-orm has inArray — but the SQLite typing for an empty array
// is finicky. This wrapper falls back to an always-false predicate
// when the input list is empty.
import { inArray, sql } from 'drizzle-orm'
function buildInArray<T>(col: T, ids: string[]) {
  if (ids.length === 0) return sql`1 = 0`
  return inArray(col as never, ids)
}

export default app
