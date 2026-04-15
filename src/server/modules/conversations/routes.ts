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
import { searchFTS } from '@/server/lib/search'
import { logActivityFromContext } from '@/server/modules/activity/log'

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

/** GET /api/conversations/search — full-text search across conversations */
app.get('/search', async (c) => {
  const userId = c.get('userId')
  const query = c.req.query('q')?.trim()
  if (!query) return c.json({ results: [] })

  try {
    // Search message text via FTS5 (requires conversations_fts virtual table)
    const { results } = await searchFTS<{ conversation_id: string; parts: string; role: string }>(
      c.env.DB,
      {
        ftsTable: 'conversation_messages_fts',
        sourceTable: 'conversation_messages',
        query,
        limit: 20,
        select: '"conversation_messages".conversation_id, "conversation_messages".parts, "conversation_messages".role',
        // Scope to current user's conversations only
        where: '"conversation_messages".conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)',
        whereParams: [userId],
      },
    )

    // Dedupe by conversation and return with snippet
    const seen = new Set<string>()
    const hits = results
      .filter((r) => {
        if (seen.has(r.conversation_id)) return false
        seen.add(r.conversation_id)
        return true
      })
      .map((r) => {
        const parts = JSON.parse(r.parts) as { type: string; text?: string }[]
        const text = parts.find((p) => p.type === 'text')?.text || ''
        return {
          conversationId: r.conversation_id,
          snippet: text.slice(0, 150),
          role: r.role,
        }
      })

    return c.json({ results: hits })
  } catch {
    // FTS table may not exist yet — fall back to LIKE search on conversation titles
    const storage = createD1ChatStorage(c.env.DB)
    const all = await storage.listConversations(userId, { limit: 100 })
    const filtered = all.filter((conv) =>
      conv.title?.toLowerCase().includes(query.toLowerCase()),
    )
    return c.json({ results: filtered.map((conv) => ({ conversationId: conv.id, snippet: conv.title || '', role: 'title' })) })
  }
})

/** GET /api/conversations/:id — load a conversation's messages */
app.get('/:id', async (c) => {
  const conversationId = c.req.param('id')
  const userId = c.get('userId')
  const storage = createD1ChatStorage(c.env.DB)

  if (!(await storage.isOwner(conversationId, userId))) {
    return c.json({ error: 'Not found' }, 404)
  }

  const messages = await storage.loadChat(conversationId)
  return c.json({ messages })
})

/** DELETE /api/conversations/:id — delete a conversation */
app.delete('/:id', async (c) => {
  const conversationId = c.req.param('id')
  const userId = c.get('userId')
  const storage = createD1ChatStorage(c.env.DB)

  await storage.deleteConversation(conversationId, userId)
  await logActivityFromContext(c, {
    action: 'delete',
    entityType: 'conversation',
    entityId: conversationId,
  })
  return c.json({ success: true })
})

/** GET /api/conversations/:id/export — export as JSON or Markdown */
app.get('/:id/export', async (c) => {
  const conversationId = c.req.param('id')
  const userId = c.get('userId')
  const format = (c.req.query('format') || 'json') as 'json' | 'md'
  const storage = createD1ChatStorage(c.env.DB)

  if (!(await storage.isOwner(conversationId, userId))) {
    return c.json({ error: 'Not found' }, 404)
  }

  const messages = await storage.loadChat(conversationId)

  if (format === 'md') {
    const lines: string[] = []
    for (const msg of messages) {
      const role = msg.role === 'user' ? '**You**' : '**AI**'
      const textParts = (msg.parts ?? [])
        .filter((p): p is { type: 'text'; text: string } => (p as { type: string }).type === 'text')
        .map((p) => p.text)
      if (textParts.length > 0) {
        lines.push(`### ${role}\n\n${textParts.join('\n\n')}`)
      }
    }
    return new Response(lines.join('\n\n---\n\n'), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="conversation-${conversationId.slice(0, 8)}.md"`,
      },
    })
  }

  return new Response(JSON.stringify({ conversationId, messages, exportedAt: new Date().toISOString() }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="conversation-${conversationId.slice(0, 8)}.json"`,
    },
  })
})

/** PATCH /api/conversations/:id — update title */
app.patch(
  '/:id',
  zValidator('json', z.object({ title: z.string().max(200) })),
  async (c) => {
    const conversationId = c.req.param('id')
    const userId = c.get('userId')
    const { title } = c.req.valid('json')
    const storage = createD1ChatStorage(c.env.DB)

    await storage.updateTitle(conversationId, userId, title)
    return c.json({ success: true })
  }
)

export default app
