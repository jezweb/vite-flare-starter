/**
 * Conversations API Routes
 *
 * CRUD for conversation history. Used by the chat sidebar
 * to list, load, rename, and delete conversations.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateObject } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
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

/**
 * POST /api/conversations/:id/summarise
 *
 * Generate a short title + one-line sidebar summary from the first user +
 * first assistant messages. Runs against Workers AI (Kimi K2.5, free) so we
 * don't burn paid credits every new conversation. Idempotent — safe to call
 * multiple times but callers should skip when a title is already set.
 *
 * The client fires this once, after the first assistant response lands.
 * Fire-and-forget: the sidebar re-queries on navigation or focus.
 */
app.post('/:id/summarise', async (c) => {
  const conversationId = c.req.param('id')
  const userId = c.get('userId')
  const storage = createD1ChatStorage(c.env.DB)

  if (!(await storage.isOwner(conversationId, userId))) {
    return c.json({ error: 'Not found' }, 404)
  }

  const messages = await storage.loadChat(conversationId)
  // Need at least one user + one assistant to summarise. Bail quietly so the
  // client can call this without checking first.
  const firstUser = messages.find((m) => m.role === 'user')
  const firstAssistant = messages.find((m) => m.role === 'assistant')
  if (!firstUser || !firstAssistant) {
    return c.json({ skipped: true, reason: 'not-enough-messages' })
  }

  const textOf = (m: typeof firstUser) =>
    (m.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => (p as { type: string }).type === 'text')
      .map((p) => p.text)
      .join('\n')
      .slice(0, 1500)

  try {
    const workersai = createWorkersAI({ binding: c.env.AI })
    const { object } = await generateObject({
      model: workersai('@cf/moonshotai/kimi-k2.5'),
      schema: z.object({
        title: z.string().min(1).max(80).describe('3-6 word title naming the topic'),
        summary: z.string().min(1).max(120).describe('One-line summary of what was asked and what was discussed'),
      }),
      prompt: `Write a short title and one-line summary for this chat.

USER (first message):
${textOf(firstUser)}

ASSISTANT (first reply):
${textOf(firstAssistant)}

Rules:
- Title: 3 to 6 words, naming the topic. Not a full sentence. No quotes.
- Summary: one line, <= 120 characters, naming the question and the answer. Present tense.
- Don't repeat the title in the summary.`,
      maxRetries: 1,
    })

    await storage.updateSummary(conversationId, userId, {
      title: object.title,
      summary: object.summary,
    })

    return c.json({ title: object.title, summary: object.summary })
  } catch (err) {
    console.error(JSON.stringify({ event: 'summarise_failed', conversationId, error: String(err) }))
    return c.json({ error: 'summarise failed' }, 500)
  }
})

/**
 * POST   /api/conversations/:id/star  — pin to the top of the sidebar
 * DELETE /api/conversations/:id/star  — unpin
 */
app.post('/:id/star', async (c) => {
  const conversationId = c.req.param('id')
  const userId = c.get('userId')
  const storage = createD1ChatStorage(c.env.DB)
  await storage.setStarred(conversationId, userId, true)
  return c.json({ success: true, starred: true })
})

app.delete('/:id/star', async (c) => {
  const conversationId = c.req.param('id')
  const userId = c.get('userId')
  const storage = createD1ChatStorage(c.env.DB)
  await storage.setStarred(conversationId, userId, false)
  return c.json({ success: true, starred: false })
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
