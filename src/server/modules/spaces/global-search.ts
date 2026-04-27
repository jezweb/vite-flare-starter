/**
 * Cross-space search — Phase 3.
 *
 * Mounted at /api/search/messages. Scans every conversation the
 * requesting user is a member of, returns up to 30 hits with snippet
 * + space name. Phase 1 in-space search uses LIKE; this one does too
 * for parity but adds an explicit space-name join so the result UI
 * can show "in #marketing-pod".
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, inArray, like } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import {
  conversationMembers,
  conversationMessages,
  conversations,
} from '@/server/modules/conversations/db/schema'
import { shapeMessage } from './storage'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

app.get('/messages', async (c) => {
  const userId = c.get('userId')
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json({ results: [] })
  const escaped = q.replace(/[\\_%]/g, (m) => `\\${m}`)
  const d = drizzle(c.env.DB)
  // Step 1: collect every conversation the user is a member of.
  const memberships = await d
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.userId, userId),
        eq(conversationMembers.kind, 'user'),
      ),
    )
  const conversationIds = memberships.map((m) => m.conversationId)
  if (conversationIds.length === 0) return c.json({ results: [] })
  // Step 2: search messages within those conversations. Bounded to 30.
  const rows = await d
    .select({
      message: conversationMessages,
      conversationTitle: conversations.title,
      conversationKind: conversations.kind,
    })
    .from(conversationMessages)
    .innerJoin(conversations, eq(conversationMessages.conversationId, conversations.id))
    .where(
      and(
        inArray(conversationMessages.conversationId, conversationIds),
        like(conversationMessages.parts, `%${escaped}%`),
      ),
    )
    .orderBy(desc(conversationMessages.createdAt))
    .limit(30)
  const results = rows.map((r) => ({
    ...shapeMessage(r.message),
    conversationTitle: r.conversationTitle,
    conversationKind: r.conversationKind,
  }))
  return c.json({ results })
})

export default app
