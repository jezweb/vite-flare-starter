/**
 * Artifacts list — lightweight scan of conversation messages to surface
 * AI-generated artifacts (HTML / SVG / Mermaid) created via the
 * `create_artifact` and `edit_artifact` tools.
 *
 * Artifacts aren't stored in their own table — they live as tool-result
 * parts inside the messages JSON. This endpoint scans recent messages
 * for parts where the result has `_artifact: true` and surfaces a list
 * with title, type, conversation link, and creation timestamp.
 *
 * For large message volumes this would benefit from a dedicated
 * artifacts index table; v1 ships the message-scan approach which is
 * fine for hundreds of conversations.
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { conversations, conversationMessages } from '@/server/modules/conversations/db/schema'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

interface ArtifactSummary {
  conversationId: string
  conversationTitle: string | null
  messageId: string
  artifactId: string
  type: string
  title: string
  height: number
  createdAt: string
}

/**
 * GET /api/chat/artifacts
 *
 * Scan recent messages of the user's conversations, extract artifact
 * tool results, return a flat list ordered by creation time.
 *
 * Limited to last 500 messages across the user's conversations to avoid
 * scanning the full message history every load.
 */
app.get('/', async (c) => {
  const userId = c.get('userId')
  const typeFilter = c.req.query('type') ?? null // 'html' | 'svg' | 'mermaid' | null
  const search = c.req.query('q')?.toLowerCase() ?? null
  const d = drizzle(c.env.DB)

  // Pull the user's conversations + recent messages with the parts JSON.
  // 500 messages is a reasonable upper bound for v1.
  const rows = await d
    .select({
      msgId: conversationMessages.id,
      convId: conversationMessages.conversationId,
      convTitle: conversations.title,
      parts: conversationMessages.parts,
      createdAt: conversationMessages.createdAt,
    })
    .from(conversationMessages)
    .innerJoin(conversations, eq(conversations.id, conversationMessages.conversationId))
    .where(and(eq(conversations.userId, userId), eq(conversationMessages.role, 'assistant')))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(500)

  const artifacts: ArtifactSummary[] = []

  for (const row of rows) {
    let parts: unknown
    try {
      parts = JSON.parse(row.parts)
    } catch {
      continue
    }
    if (!Array.isArray(parts)) continue

    for (const part of parts) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>
      // AI SDK tool-result parts: { type: 'tool-result', output: { ... } } or
      // { type: 'tool-call', result: { ... } } depending on SDK version.
      const out = p['output']
      const res = p['result']
      const candidate =
        (out && typeof out === 'object' ? (out as Record<string, unknown>) : null) ??
        (res && typeof res === 'object' ? (res as Record<string, unknown>) : null)
      if (!candidate) continue
      if (candidate['_artifact'] !== true) continue

      const t = String(candidate['type'] ?? '')
      if (typeFilter && t !== typeFilter) continue

      const title = String(candidate['title'] ?? 'Untitled artifact')
      if (search && !title.toLowerCase().includes(search) && !t.includes(search)) continue

      artifacts.push({
        conversationId: row.convId,
        conversationTitle: row.convTitle,
        messageId: row.msgId,
        artifactId: String(candidate['artifactId'] ?? candidate['id'] ?? row.msgId),
        type: t || 'unknown',
        title,
        height: Number(candidate['height'] ?? 400),
        createdAt: row.createdAt
          ? new Date(row.createdAt as unknown as number).toISOString()
          : new Date().toISOString(),
      })
    }
  }

  return c.json({ artifacts: artifacts.slice(0, 200) })
})

export default app
