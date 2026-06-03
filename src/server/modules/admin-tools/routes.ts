/**
 * AdminAgent ensure-space endpoint.
 *
 *   POST /api/admin-agent/ensure-space
 *     Find-or-create the user's `admin` Space with AdminAgent as a
 *     member in `always` reply mode. Idempotent — repeat calls return
 *     the same id. Used by /dashboard/admin (client landing route)
 *     to lazy-provision the space on first visit instead of running
 *     auto-creation logic on every dashboard load.
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'

import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { conversations, conversationMembers } from '@/server/modules/conversations/db/schema'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const ADMIN_TITLE = 'admin'
const ADMIN_AGENT_NAME = 'admin'

app.post('/ensure-space', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)

  // Find — does this user already own an `admin` space?
  const existing = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.kind, 'space'),
        eq(conversations.title, ADMIN_TITLE)
      )
    )
    .limit(1)
  if (existing.length > 0 && existing[0]) {
    return c.json({ id: existing[0].id, created: false })
  }

  // Create — admin space with AdminAgent as a member.
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)

  await db.insert(conversations).values({
    id,
    userId,
    title: ADMIN_TITLE,
    summary:
      'Talk to the Platform Admin agent. Describe what you want set up; the agent proposes routines / agents / connections, you review + approve.',
    kind: 'space',
    spaceMode: 'invite',
    defaultReplyMode: 'always',
    historyEnabled: 1,
  })

  // Owner-member.
  await db.insert(conversationMembers).values({
    conversationId: id,
    kind: 'user',
    userId,
    role: 'owner',
    joinedAt: now,
    notificationLevel: 'all',
    pinnedToSidebar: 1, // Pin admin to sidebar — discoverable.
  })

  // AdminAgent member in `always` reply mode.
  await db.insert(conversationMembers).values({
    conversationId: id,
    kind: 'agent',
    agentClass: 'AdminAgent',
    agentName: ADMIN_AGENT_NAME,
    role: 'member',
    joinedAt: now,
    notificationLevel: 'all',
    pinnedToSidebar: 0,
    replyMode: 'always',
  })

  return c.json({ id, created: true })
})

export default app
