/**
 * Conversations API Routes
 *
 * CRUD for conversation history. Used by the chat sidebar
 * to list, load, rename, and delete conversations.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { createD1ChatStorage } from './storage'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

/** GET /api/conversations — list user's conversations */
app.get('/', async (c) => {
  const userId = c.get('userId')
  const limit = Number(c.req.query('limit') || '50')
  const offset = Number(c.req.query('offset') || '0')

  const storage = createD1ChatStorage(c.env.DB)
  const items = await storage.listConversations(userId, { limit, offset })

  return c.json({ conversations: items })
})

/** GET /api/conversations/:id — load a conversation's messages */
app.get('/:id', async (c) => {
  const conversationId = c.req.param('id')
  const storage = createD1ChatStorage(c.env.DB)

  const messages = await storage.loadChat(conversationId)
  return c.json({ messages })
})

/** DELETE /api/conversations/:id — delete a conversation */
app.delete('/:id', async (c) => {
  const conversationId = c.req.param('id')
  const userId = c.get('userId')
  const storage = createD1ChatStorage(c.env.DB)

  await storage.deleteConversation(conversationId, userId)
  return c.json({ success: true })
})

/** PATCH /api/conversations/:id — update title */
app.patch(
  '/:id',
  zValidator('json', z.object({ title: z.string().max(200) })),
  async (c) => {
    const conversationId = c.req.param('id')
    const { title } = c.req.valid('json')
    const storage = createD1ChatStorage(c.env.DB)

    await storage.updateTitle(conversationId, title)
    return c.json({ success: true })
  }
)

export default app
