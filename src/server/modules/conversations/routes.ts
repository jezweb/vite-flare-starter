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
        title: z.string().min(1).max(60).describe('A short noun phrase naming the topic. 2-5 words. No verbs. No colons.'),
        summary: z.string().min(1).max(120).describe('A one-sentence description of the exchange, using different words from the title.'),
      }),
      prompt: `You write sidebar labels for a chat app.
For the conversation below, produce TWO DIFFERENT strings:

1. "title" — a short noun phrase naming the topic. 2-5 words. Like a bookmark.
2. "summary" — a single sentence describing what was asked and what the assistant did. Starts with a verb. Must use different words from the title.

Examples of good output:
- {"title":"Drizzle 0.45 migration","summary":"Walked through porting schema defs and flagged two deprecated APIs."}
- {"title":"Mermaid and SVG artifacts","summary":"Generated a build-loop flowchart and a blue circle SVG for a demo."}
- {"title":"Norton Commando history","summary":"Compared 750 vs 850 model years and the electric-start variant."}

Never make the summary a copy or close paraphrase of the title.

CONVERSATION:
---
USER: ${textOf(firstUser)}

ASSISTANT: ${textOf(firstAssistant)}
---`,
      maxRetries: 1,
    })

    // Defensive: if the model returned identical or near-identical strings,
    // drop the summary so the sidebar falls back to showing just the time.
    // Better to show less than to show noise.
    const normTitle = object.title.trim().toLowerCase()
    const normSummary = object.summary.trim().toLowerCase()
    const summary = (normTitle === normSummary || normSummary.startsWith(normTitle))
      ? null
      : object.summary

    await storage.updateSummary(conversationId, userId, {
      title: object.title,
      summary,
    })

    return c.json({ title: object.title, summary })
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

/**
 * PATCH /api/conversations/:id
 *
 * Partial update. Supported fields:
 *   - title: rename
 *   - projectId: move between projects (null = ungroup)
 *
 * Only fields explicitly passed are changed. Undefined means "leave alone";
 * null on projectId specifically clears the grouping.
 */
app.patch(
  '/:id',
  zValidator(
    'json',
    z.object({
      title: z.string().max(200).optional(),
      projectId: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const conversationId = c.req.param('id')
    const userId = c.get('userId')
    const input = c.req.valid('json')
    const storage = createD1ChatStorage(c.env.DB)

    if (!(await storage.isOwner(conversationId, userId))) {
      return c.json({ error: 'Not found' }, 404)
    }

    if (input.title !== undefined) {
      await storage.updateTitle(conversationId, userId, input.title)
    }
    if (input.projectId !== undefined) {
      await storage.updateProject(conversationId, userId, input.projectId)
    }
    return c.json({ success: true })
  },
)

export default app
