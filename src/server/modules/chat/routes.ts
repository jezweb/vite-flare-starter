/**
 * Chat API Routes — utility endpoints
 *
 * The streaming chat path moved to the `ChatAgent` Durable Object
 * (`src/server/modules/chat/chat-agent.ts`) routed via `routeAgentRequest`
 * at `/agents/chat-agent/{instance-name}`. The endpoints here are the
 * surviving non-streaming utility surfaces:
 *
 *   - GET  /usage          — per-user token usage stats (admin/observability)
 *   - POST /extract        — one-shot structured data extraction (Zod schemas)
 *   - POST /stream-extract — streamObject variant for progressive UI
 *   - GET  /catalog        — tool catalogue for the routine wizard pickers
 */
import { Hono } from 'hono'
import { generateText, streamObject, Output } from 'ai'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { desc, eq, sql } from 'drizzle-orm'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import { resolveModel, resolveModelRole, thinkingOffProviderOptions } from '@/server/lib/ai'
import { aiUsageLogs } from './db/schema'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)
app.use('*', requireScopes('chat:write'))

/**
 * GET /api/chat/usage - Per-user token usage stats.
 *
 * Read by the admin observability panel and the user's own settings page
 * (cumulative tokens + recent calls). Aggregates `aiUsageLogs` rows that
 * `ChatAgent.onChatMessage`'s `onFinish` callback writes after each turn.
 */
app.get('/usage', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)

  const [totals] = await db
    .select({
      totalRequests: sql<number>`count(*)`,
      totalTokens: sql<number>`coalesce(sum(${aiUsageLogs.totalTokens}), 0)`,
      totalPromptTokens: sql<number>`coalesce(sum(${aiUsageLogs.promptTokens}), 0)`,
      totalCompletionTokens: sql<number>`coalesce(sum(${aiUsageLogs.completionTokens}), 0)`,
      // Reasoning tokens (subset of completion) — shows how much of the output
      // budget went to thinking vs the visible answer (#75).
      totalReasoningTokens: sql<number>`coalesce(sum(${aiUsageLogs.reasoningTokens}), 0)`,
    })
    .from(aiUsageLogs)
    .where(eq(aiUsageLogs.userId, userId))

  const recent = await db
    .select()
    .from(aiUsageLogs)
    .where(eq(aiUsageLogs.userId, userId))
    .orderBy(desc(aiUsageLogs.createdAt))
    .limit(10)

  return c.json({ totals, recent })
})

// ============================================================================
// STRUCTURED OUTPUT
// ============================================================================

const extractSchemas = {
  summary: z.object({
    title: z.string().describe('A concise title for the text'),
    summary: z.string().max(200).describe('A brief summary in 1-2 sentences'),
    keyPoints: z.array(z.string()).max(5).describe('Key points from the text'),
    wordCount: z.number().describe('Approximate word count of the input'),
  }),
  entities: z.object({
    people: z.array(z.string()).describe('Named people mentioned'),
    places: z.array(z.string()).describe('Locations and places mentioned'),
    organizations: z.array(z.string()).describe('Companies, teams, or organizations'),
    dates: z.array(z.string()).describe('Dates and time references'),
  }),
  sentiment: z.object({
    overall: z.enum(['positive', 'negative', 'neutral', 'mixed']).describe('Overall sentiment'),
    score: z.number().min(-1).max(1).describe('Sentiment score from -1 (negative) to 1 (positive)'),
    reasoning: z.string().describe('Brief explanation of the sentiment assessment'),
  }),
} as const

type ExtractSchema = keyof typeof extractSchemas

/**
 * POST /api/chat/extract - Structured data extraction.
 *
 * Uses AI SDK `generateText` + `Output.object` for a one-shot extraction.
 * Worked example surface — drives the ExtractPage demo and is useful for
 * forks adopting structured-output patterns.
 */
app.post('/extract', async (c) => {
  try {
    const body = await c.req.json()
    const { text, schema: schemaName } = body as { text: string; schema: ExtractSchema }

    if (!text || !schemaName || !extractSchemas[schemaName]) {
      return c.json(
        { error: 'Required: text (string) and schema (summary | entities | sentiment)' },
        400
      )
    }
    if (text.length > 100_000) {
      return c.json({ error: 'Text too long (max 100,000 characters)' }, 400)
    }

    // Structured extraction is a composer task (#87) — bounded + templated.
    // The role resolves to a fast model with thinking off (the default Kimi
    // would otherwise burn output budget thinking before the JSON). Forks
    // retune with MODEL_ROLE_COMPOSER.
    const role = resolveModelRole(c.env as unknown as Record<string, unknown>, 'composer')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = extractSchemas[schemaName] as any
    const { output } = await generateText({
      model: resolveModel(c.env, role.modelId),
      output: Output.object({ schema }),
      prompt: `Extract the following from this text:\n\n${text}`,
      providerOptions: thinkingOffProviderOptions(role),
    })

    return c.json({
      success: true,
      schema: schemaName,
      model: role.modelId,
      data: output,
    })
  } catch (error) {
    console.error('Extract error:', error)
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Extraction failed' },
      500
    )
  }
})

/**
 * POST /api/chat/stream-extract - Streaming structured data extraction.
 *
 * Streams the object progressively via `streamObject`. Client consumes
 * with `useObject()` from `@ai-sdk/react`. Same schema set as `/extract`.
 */
app.post('/stream-extract', async (c) => {
  try {
    const body = await c.req.json()
    const { text, schema: schemaName } = body as { text: string; schema: ExtractSchema }

    if (!text || !schemaName || !extractSchemas[schemaName]) {
      return c.json(
        { error: 'Required: text (string) and schema (summary | entities | sentiment)' },
        400
      )
    }
    if (text.length > 100_000) {
      return c.json({ error: 'Text too long (max 100,000 characters)' }, 400)
    }

    // Composer role (#87) — same rationale as /extract.
    const role = resolveModelRole(c.env as unknown as Record<string, unknown>, 'composer')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = extractSchemas[schemaName] as any
    const result = streamObject({
      model: resolveModel(c.env, role.modelId),
      schema,
      prompt: `Extract the following from this text:\n\n${text}`,
      providerOptions: thinkingOffProviderOptions(role),
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('Stream extract error:', error)
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Extraction failed' },
      500
    )
  }
})

// ============================================================================
// TOOL CATALOGUE
// ============================================================================

/**
 * GET /api/chat/catalog — tools catalogue for routine setup wizard pickers.
 *
 * Returns the tool definitions the chat agent ships with, filtered to the
 * user's connector settings. Each entry has `{ name, description, category }`
 * so a UI can render a grouped checkbox list.
 *
 * Categories are derived from a short prefix heuristic.
 */
app.get('/catalog', async (c) => {
  const userId = c.get('userId')
  const { buildChatTools } = await import('./tools')
  // Stub AgentContext just for the availability filter — callers don't
  // need a real model resolution here, only the shape that lets each
  // tool's `isAvailable` predicate run.
  const ctx = {
    env: c.env as unknown as Record<string, unknown>,
    userId,
    user: { id: userId, email: '', name: null, image: null, role: 'user' as const },
    projectId: null,
    model: { id: 'stub', provider: 'other' as const, supportsVision: false, supportsTools: true },
    telemetry: { recordToolCall: () => {}, recordError: () => {} } as never,
  }
  const tools = await buildChatTools(ctx as never)
  const catalog = Object.entries(tools).map(([name, tool]) => {
    const description = (tool as { description?: string }).description ?? ''
    return { name, description, category: categoriseTool(name) }
  })
  catalog.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  return c.json({ tools: catalog })
})

function categoriseTool(name: string): string {
  if (
    name.startsWith('gmail_') ||
    name.startsWith('google_workspace_') ||
    name === 'show_link' ||
    name === 'show_image'
  ) {
    return name.startsWith('gmail_')
      ? 'Gmail'
      : name.startsWith('google_')
        ? 'Google Workspace'
        : 'UI'
  }
  if (name.startsWith('drive_') || name.includes('drive')) return 'Google Drive'
  if (name.startsWith('calendar_')) return 'Google Calendar'
  if (name.startsWith('notion_')) return 'Notion'
  if (name.startsWith('atlassian_') || name.startsWith('jira_')) return 'Atlassian'
  if (name.startsWith('slack_')) return 'Slack'
  if (name.startsWith('microsoft_')) return 'Microsoft 365'
  if (name.startsWith('image_') || name.includes('image')) return 'Images'
  if (name.startsWith('media_') || name.includes('video')) return 'Media'
  if (
    name.startsWith('inbox_') ||
    name === 'notify' ||
    name === 'space_send' ||
    name === 'webhook_post' ||
    name === 'approval_queue'
  )
    return 'Channels'
  if (
    name === 'find_tools' ||
    name === 'load_skill' ||
    name === 'recall' ||
    name === 'remember' ||
    name === 'done'
  )
    return 'Core'
  if (name === 'web_search' || name.includes('search') || name.includes('browse'))
    return 'Search & web'
  return 'Other'
}

/**
 * Hono RPC type export for type-safe client usage.
 *
 * @example
 * import { hc } from 'hono/client'
 * import type { ChatRoutes } from '@/server/modules/chat/routes'
 * const client = hc<ChatRoutes>('/api/chat')
 */
export type ChatRoutes = typeof app

export default app
