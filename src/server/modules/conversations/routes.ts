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
import { resolveModel, resolveModelRole, thinkingOffProviderOptions } from '@/server/lib/ai'
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
        select:
          '"conversation_messages".conversation_id, "conversation_messages".parts, "conversation_messages".role',
        // Scope to current user's conversations only
        where:
          '"conversation_messages".conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)',
        whereParams: [userId],
      }
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
    const filtered = all.filter((conv) => conv.title?.toLowerCase().includes(query.toLowerCase()))
    return c.json({
      results: filtered.map((conv) => ({
        conversationId: conv.id,
        snippet: conv.title || '',
        role: 'title',
      })),
    })
  }
})

/** GET /api/conversations/:id — load a conversation's messages
 *
 * Returns `{ messages: [] }` when the conversation row doesn't exist OR
 * belongs to another user. Both cases are indistinguishable to the caller,
 * which is the same security guarantee as 404 — but avoids spurious 404s
 * in the network panel during the chat lazy-creation flow (ChatPage's
 * `useConversationMessages` query fires on URL transition before
 * `ChatAgent.onChatMessage` lazily creates the row on the first turn).
 *
 * UX-audit M1 (2026-05-06).
 */
app.get('/:id', async (c) => {
  const conversationId = c.req.param('id')
  const userId = c.get('userId')
  const storage = createD1ChatStorage(c.env.DB)

  if (!(await storage.isOwner(conversationId, userId))) {
    return c.json({ messages: [] })
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

  return new Response(
    JSON.stringify({ conversationId, messages, exportedAt: new Date().toISOString() }, null, 2),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="conversation-${conversationId.slice(0, 8)}.json"`,
      },
    }
  )
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

  // Strip <skill_content …>…</skill_content> wrappers so the summariser
  // doesn't see the skill body (which biases titles toward the skill name
  // rather than the user's actual question). Keep whatever the user wrote
  // after the wrapper.
  const stripSkillContent = (text: string): string => {
    return text.replace(/<skill_content\b[^>]*>[\s\S]*?<\/skill_content>\s*/gi, '').trim()
  }

  const textOf = (m: typeof firstUser) =>
    (m.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => (p as { type: string }).type === 'text')
      .map((p) => stripSkillContent(p.text))
      .filter(Boolean)
      .join('\n')
      .slice(0, 1500)

  try {
    // Title/summary is a composer task (#87) — thinking off so the bounded
    // structured output isn't starved by the default reasoning model.
    const role = resolveModelRole(c.env as unknown as Record<string, unknown>, 'composer')
    const { object } = await generateObject({
      model: resolveModel(c.env, role.modelId),
      providerOptions: thinkingOffProviderOptions(role),
      schema: z.object({
        title: z
          .string()
          .min(1)
          .max(60)
          .describe('A short noun phrase naming the topic. 2-5 words. No verbs. No colons.'),
        summary: z
          .string()
          .min(1)
          .max(120)
          .describe(
            'A one-sentence description of the exchange, using different words from the title.'
          ),
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
    const summary =
      normTitle === normSummary || normSummary.startsWith(normTitle) ? null : object.summary

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
 * POST /api/conversations/:id/compact
 *
 * "Summarise & start fresh." Loads the full conversation, asks Haiku
 * (via OpenRouter) or Kimi K2.6 (Workers AI fallback) for a dense
 * recap, creates a new conversation seeded with that recap as the
 * first assistant turn, and returns the new conversation id so the
 * client can navigate to it.
 *
 * Companion to the conversation-size indicator in the chat UI — when
 * a thread crosses the 60% / 90% threshold the user can compact rather
 * than dragging context bloat forward forever (or hitting a hard stop).
 *
 * Auth: scoped by userId via storage.isOwner. The new conversation
 * inherits the original's model + projectId so the compacted thread
 * lands in the right place in the sidebar.
 */
app.post('/:id/compact', async (c) => {
  const conversationId = c.req.param('id')
  const userId = c.get('userId')
  const storage = createD1ChatStorage(c.env.DB)

  if (!(await storage.isOwner(conversationId, userId))) {
    return c.json({ error: 'Not found' }, 404)
  }

  const messages = await storage.loadChat(conversationId)
  if (messages.length < 2) {
    return c.json({ skipped: true, reason: 'too-short-to-compact' })
  }

  // Pull the original conversation's model + projectId so the new
  // conversation lands in the same project + uses the same model.
  // Direct query — storage.listConversations is paginated and would be
  // overkill for one row.
  const { drizzle } = await import('drizzle-orm/d1')
  const { conversations } = await import('./db/schema')
  const { eq, and } = await import('drizzle-orm')
  const d = drizzle(c.env.DB)
  const [original] = await d
    .select({
      title: conversations.title,
      model: conversations.model,
      projectId: conversations.projectId,
      systemPrompt: conversations.systemPrompt,
    })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1)

  // Render the conversation as a plain transcript for the summariser.
  // Skip <skill_content> wrappers and tool input/output JSON — Haiku
  // produces tighter recaps from the user-facing turns alone.
  const stripSkill = (text: string): string =>
    text.replace(/<skill_content\b[^>]*>[\s\S]*?<\/skill_content>\s*/gi, '').trim()
  const transcript = messages
    .map((m) => {
      const text = (m.parts ?? [])
        .filter((p): p is { type: 'text'; text: string } => (p as { type: string }).type === 'text')
        .map((p) => stripSkill(p.text))
        .filter(Boolean)
        .join('\n')
      return text ? `${m.role.toUpperCase()}: ${text.slice(0, 4000)}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 80_000)

  // Summarise. Prefer Haiku via OpenRouter for quality; fall back to
  // Kimi K2.6 on Workers AI (free, no key needed) so the feature works
  // out of the box for forks without an API key.
  let summary: string | null = null
  const env = c.env as { OPENROUTER_API_KEY?: string }
  if (env.OPENROUTER_API_KEY) {
    try {
      const { generateText } = await import('ai')
      const { createOpenRouter } = await import('@openrouter/ai-sdk-provider')
      const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
      const result = await generateText({
        model: openrouter('anthropic/claude-haiku-4.5'),
        prompt:
          'Summarise the following conversation transcript into a dense recap that would let the same assistant pick up the thread without the original context. Cover: what the user is working on, key facts they shared (names, numbers, decisions, file paths, identifiers), what the assistant has done so far (tools called, results found), and any open threads or next steps.\n\nWrite as a single block of structured prose, no headings, ~5-8 sentences. Be specific.\n\nTRANSCRIPT:\n---\n' +
          transcript +
          '\n---\n\nRecap:',
        maxOutputTokens: 600,
      })
      summary = result.text?.trim() || null
    } catch (err) {
      console.error(
        JSON.stringify({ event: 'compact_haiku_failed', conversationId, error: String(err) })
      )
    }
  }
  if (!summary) {
    // Composer-role fallback (#87) — free default model with thinking off so
    // the recap isn't starved. Handles long input fine; right when no
    // OpenRouter key is set.
    try {
      const { generateText } = await import('ai')
      const role = resolveModelRole(c.env as unknown as Record<string, unknown>, 'composer')
      const result = await generateText({
        model: resolveModel(c.env, role.modelId),
        providerOptions: thinkingOffProviderOptions(role),
        prompt:
          'Summarise this conversation transcript into a dense 5-8 sentence recap. Include: what the user is working on, key facts (names, numbers, decisions), what was done, and any open threads.\n\nTRANSCRIPT:\n---\n' +
          transcript +
          '\n---\n\nRecap:',
        maxOutputTokens: 600,
      })
      summary = result.text?.trim() || null
    } catch (err) {
      console.error(
        JSON.stringify({ event: 'compact_kimi_failed', conversationId, error: String(err) })
      )
    }
  }
  if (!summary) {
    return c.json({ error: 'compact failed — no summary produced' }, 500)
  }

  // Create the new conversation row + seed the recap as the FIRST
  // assistant message. Using the assistant role (not user) lets the
  // model treat it as established context rather than a fresh request.
  const newId = await storage.createConversation(userId, {
    title: original?.title ? `Continued: ${original.title}` : 'Continued conversation',
    model: original?.model ?? undefined,
    systemPrompt: original?.systemPrompt ?? undefined,
    projectId: original?.projectId ?? null,
  })
  await storage.saveChat({
    conversationId: newId,
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text:
              `**Continued from a previous conversation.** Here's a recap of what we covered:\n\n${summary}\n\n` +
              '_Ask anything to pick up from here._',
          },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
  })

  return c.json({
    success: true,
    newConversationId: newId,
    summary,
  })
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
    })
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
  }
)

export default app
