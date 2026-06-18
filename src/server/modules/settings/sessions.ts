import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, ne, and, desc, isNull } from 'drizzle-orm'
import { UAParser } from 'ua-parser-js'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { createAuthFromEnv } from '@/server/modules/auth'
import * as schema from '@/server/db/schema'

const app = new Hono<AuthContext>()

app.use('/*', authMiddleware)

/**
 * Resolve the current session token via better-auth's server API.
 *
 * Parsing the Cookie header directly doesn't work in production because
 * better-auth uses the `__Secure-` prefix over HTTPS, and cookie values
 * are signed (`{token}.{signature}`). Ask better-auth for the session
 * object and use its session id instead — reliable on any deployment.
 */
async function getCurrentSessionId(c: any): Promise<string | null> {
  const auth = createAuthFromEnv(c.env.DB, c.env as unknown as Record<string, unknown>)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  return session?.session?.id ?? null
}

interface SessionInfo {
  id: string
  device: string
  browser: string
  os: string
  ipAddress: string | null
  lastActive: number
  createdAt: number
  isCurrent: boolean
}

/**
 * Parse user agent string into device/browser/os info
 */
function parseUserAgent(userAgent: string | null): { device: string; browser: string; os: string } {
  if (!userAgent) {
    return { device: 'Unknown', browser: 'Unknown', os: 'Unknown' }
  }

  const parser = new UAParser(userAgent)
  const result = parser.getResult()

  const device = result.device.type
    ? `${result.device.vendor || ''} ${result.device.model || result.device.type}`.trim()
    : 'Desktop'

  const browser = result.browser.name
    ? `${result.browser.name} ${result.browser.version?.split('.')[0] || ''}`
    : 'Unknown Browser'

  const os = result.os.name ? `${result.os.name} ${result.os.version || ''}` : 'Unknown OS'

  return { device, browser, os }
}

/**
 * GET /api/settings/sessions
 * List all active sessions for the current user
 */
app.get('/', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  const currentSessionId = await getCurrentSessionId(c)

  // Lazy IP backfill: if the current session has no ipAddress captured
  // (e.g. it was created before the `ipAddressHeaders` config landed, or
  // a better-auth internal path bypassed the capture), fill it in from
  // this request's headers. One-time DB write per session, gated by the
  // `IS NULL` WHERE clause so we don't thrash re-visits.
  const currentIp =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  if (currentSessionId && currentIp) {
    await db
      .update(schema.session)
      .set({ ipAddress: currentIp })
      .where(
        and(
          eq(schema.session.id, currentSessionId),
          // Only backfill when the column is empty — otherwise preserve
          // whatever the original session-create path captured.
          isNull(schema.session.ipAddress)
        )
      )
      .catch(() => {
        // Non-critical — swallow. Sessions list still works without the backfill.
      })
  }

  // Fetch all sessions for user
  const sessions = await db
    .select()
    .from(schema.session)
    .where(eq(schema.session.userId, userId))
    .orderBy(desc(schema.session.updatedAt))

  // Filter active sessions and transform to response format
  const now = new Date()
  const activeSessions: SessionInfo[] = sessions
    .filter((session) => session.expiresAt > now)
    .map((session) => {
      const { device, browser, os } = parseUserAgent(session.userAgent)
      return {
        id: session.id,
        device,
        browser,
        os,
        ipAddress: session.ipAddress,
        lastActive: session.updatedAt.getTime(),
        createdAt: session.createdAt.getTime(),
        isCurrent: session.id === currentSessionId,
      }
    })

  return c.json({ sessions: activeSessions })
})

/**
 * DELETE /api/settings/sessions/:id
 * Revoke a specific session
 */
app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const sessionId = c.req.param('id')
  const db = drizzle(c.env.DB, { schema })

  const currentSessionId = await getCurrentSessionId(c)

  // Find the session to delete
  const targetSession = await db
    .select()
    .from(schema.session)
    .where(and(eq(schema.session.id, sessionId), eq(schema.session.userId, userId)))
    .get()

  if (!targetSession) {
    return c.json({ error: 'Session not found' }, 404)
  }

  // Prevent revoking current session via this endpoint
  if (targetSession.id === currentSessionId) {
    return c.json({ error: 'Cannot revoke current session. Use sign out instead.' }, 400)
  }

  // Delete the session
  await db.delete(schema.session).where(eq(schema.session.id, sessionId))

  return c.json({ success: true, message: 'Session revoked' })
})

/**
 * DELETE /api/settings/sessions
 * Revoke all sessions except current (logout everywhere)
 */
app.delete('/', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  const currentSessionId = await getCurrentSessionId(c)

  if (!currentSessionId) {
    return c.json({ error: 'Current session not found' }, 400)
  }

  // Delete all sessions except current
  await db
    .delete(schema.session)
    .where(and(eq(schema.session.userId, userId), ne(schema.session.id, currentSessionId)))

  return c.json({
    success: true,
    message: 'All other sessions have been logged out',
  })
})

export default app
