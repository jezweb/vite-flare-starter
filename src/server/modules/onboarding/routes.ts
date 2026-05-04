/**
 * Onboarding API — see gh #44.
 *
 * GET /api/onboarding/state
 *   Returns the 5-step Getting Started checklist completion state plus
 *   the dismissed/version flag from user.preferences. Each step is
 *   derived from existing tables — no separate "completed" flag stored.
 *
 *   This means: if the user removes their Google connection, the
 *   "Connect a workspace" step un-ticks. We treat the checklist as
 *   "current state of your account" rather than "history". Simpler.
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq, sql } from 'drizzle-orm'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import * as schema from '@/server/db/schema'
import { user as userTable } from '@/server/modules/auth/db/schema'
import { projects } from '@/server/modules/projects/db/schema'
import { memories } from '@/server/modules/memories/db/schema'
import { conversations } from '@/server/modules/conversations/db/schema'
import { userMcpConnections } from '@/server/modules/mcp-connections/db/schema'
import { routines } from '@/server/modules/routines/db/schema'
import { defaultPreferences } from '@/shared/schemas/preferences.schema'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

/** Bump when the catalogue of steps changes meaningfully — re-shows the
 *  shelf to users who'd previously dismissed it. */
const ONBOARDING_VERSION = 2

app.get('/state', requireScopes('settings:read'), async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  // Read prefs once for dismissed/version state.
  const userRow = await db
    .select({ preferences: userTable.preferences })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null)
    .catch(() => null)

  const prefs = (userRow?.preferences as Record<string, unknown> | null) ?? defaultPreferences
  const onboarding =
    (prefs as { onboarding?: { dismissed?: boolean; version?: number } }).onboarding ?? {}
  // Re-show shelf if version bumped past last-known dismissal version.
  const dismissed = Boolean(onboarding.dismissed) && (onboarding.version ?? 0) >= ONBOARDING_VERSION

  // Derive completion from existing tables in parallel.
  const [connectionsRow, projectsRow, memoriesRow, conversationsRow, routinesRow] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(userMcpConnections)
        .where(eq(userMcpConnections.userId, userId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(projects)
        .where(eq(projects.userId, userId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(memories)
        .where(and(eq(memories.scope, 'user'), eq(memories.scopeId, userId))),
      db
        .select({ count: sql<number>`count(*)` })
        .from(conversations)
        .where(eq(conversations.userId, userId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(routines)
        .where(eq(routines.userId, userId)),
    ])

  const connectionsCount = Number(connectionsRow[0]?.count ?? 0)
  const projectsCount = Number(projectsRow[0]?.count ?? 0)
  const memoriesCount = Number(memoriesRow[0]?.count ?? 0)
  const conversationsCount = Number(conversationsRow[0]?.count ?? 0)
  const routinesCount = Number(routinesRow[0]?.count ?? 0)

  return c.json({
    version: ONBOARDING_VERSION,
    dismissed,
    steps: {
      connect: connectionsCount > 0,
      project: projectsCount > 0,
      memory: memoriesCount > 0,
      chat: conversationsCount > 0,
      // "Try a skill" can't be derived cheaply (would need a JOIN to
      // messages), so we treat it as a soft-suggestion: the user clicks
      // through to /skills and we tick it after they've visited Skills
      // OR they have any chat (which means they saw the slash hint).
      // Pragmatic over precise; can tighten later if needed.
      skill: conversationsCount > 0,
      // Routines is the standout product surface — first-time users are
      // expected to schedule one, so it earns a checklist item (audit
      // P1-006). Ticks as soon as the user has any routine in the table.
      routine: routinesCount > 0,
    },
  })
})

export default app
