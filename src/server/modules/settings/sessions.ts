import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, ne, and, desc } from 'drizzle-orm'
import { UAParser } from 'ua-parser-js'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import * as schema from '@/server/db/schema'

const app = new Hono<AuthContext>()

app.use('/*', authMiddleware)

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

  // Get current session token from cookie
  const cookies = c.req.header('Cookie') || ''
  const sessionTokenMatch = cookies.match(/better-auth\.session_token=([^;]+)/)
  const currentSessionToken = sessionTokenMatch?.[1]

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
        isCurrent: session.token === currentSessionToken,
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

  // Get current session token
  const cookies = c.req.header('Cookie') || ''
  const sessionTokenMatch = cookies.match(/better-auth\.session_token=([^;]+)/)
  const currentSessionToken = sessionTokenMatch?.[1]

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
  if (targetSession.token === currentSessionToken) {
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

  // Get current session token
  const cookies = c.req.header('Cookie') || ''
  const sessionTokenMatch = cookies.match(/better-auth\.session_token=([^;]+)/)
  const currentSessionToken = sessionTokenMatch?.[1]

  if (!currentSessionToken) {
    return c.json({ error: 'Current session not found' }, 400)
  }

  // Delete all sessions except current
  await db
    .delete(schema.session)
    .where(and(eq(schema.session.userId, userId), ne(schema.session.token, currentSessionToken)))

  return c.json({
    success: true,
    message: 'All other sessions have been logged out',
  })
})

export default app
