/**
 * Chat API Routes
 *
 * Streaming chat using AI SDK + Workers AI provider.
 * Features: smoothStream, token usage logging, reasoning middleware, tool calling.
 */
import { Hono } from 'hono'
import { streamText, generateText, convertToModelMessages, smoothStream, stepCountIs, Output } from 'ai'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { desc, eq, sql } from 'drizzle-orm'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import { DEFAULT_MODEL, getModel, resolveModel, buildModel } from '@/server/lib/ai'
import { chatTools } from './tools'
import { aiUsageLogs } from './db/schema'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)
app.use('*', requireScopes('chat:write'))

/**
 * POST /api/chat - Streaming chat endpoint (AI SDK protocol)
 *
 * Accepts AI SDK UIMessage format from useChat hook.
 * Returns streaming response via toUIMessageStreamResponse().
 * Logs token usage to D1 on completion.
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { messages, model: requestedModel, systemPrompt } = body

    const modelId = requestedModel || DEFAULT_MODEL
    const modelConfig = getModel(modelId)
    const userId = c.get('userId')
    const startTime = Date.now()

    const baseModel = resolveModel(c.env, modelId)
    const model = buildModel(baseModel, modelId)

    // Only attach tools for tool-capable models
    const tools = modelConfig?.supportsTools ? chatTools : undefined

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: modelConfig?.supportsTools ? stepCountIs(5) : stepCountIs(1),
      maxOutputTokens: modelConfig?.defaultMaxTokens ?? 2000,
      experimental_transform: smoothStream({ chunking: 'word' }),
      onFinish: async ({ usage, finishReason }) => {
        try {
          const db = drizzle(c.env.DB)
          await db.insert(aiUsageLogs).values({
            userId,
            model: modelId,
            promptTokens: usage.inputTokens ?? 0,
            completionTokens: usage.outputTokens ?? 0,
            totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
            finishReason,
            durationMs: Date.now() - startTime,
          })
        } catch (err) {
          console.error('Failed to log AI usage:', err)
        }
      },
    })

    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      messageMetadata: ({ part }) => {
        if (part.type === 'finish') {
          return {
            model: modelId,
            inputTokens: part.totalUsage?.inputTokens,
            outputTokens: part.totalUsage?.outputTokens,
            durationMs: Date.now() - startTime,
          }
        }
        return undefined
      },
    })
  } catch (error) {
    console.error('Chat error:', error)
    return c.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      500
    )
  }
})

/**
 * POST /api/chat/complete - Non-streaming chat endpoint
 */
app.post('/complete', async (c) => {
  try {
    const body = await c.req.json()
    const { messages, model: requestedModel } = body

    const modelId = requestedModel || DEFAULT_MODEL
    const modelConfig = getModel(modelId)

    const { text, usage } = await streamText({
      model: resolveModel(c.env, modelId),
      messages: await convertToModelMessages(messages),
      maxOutputTokens: modelConfig?.defaultMaxTokens ?? 2000,
    })

    return c.json({
      success: true,
      message: { role: 'assistant' as const, content: text },
      model: modelId,
      usage,
    })
  } catch (error) {
    console.error('Chat error:', error)
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Chat failed' },
      500
    )
  }
})

/**
 * GET /api/chat/usage - Get token usage stats for the authenticated user
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
 * POST /api/chat/extract - Structured data extraction
 *
 * Uses AI SDK generateObject with Zod schemas to extract
 * structured data from text. Requires a tool-capable model.
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

    // Use a tool-capable model for structured output
    const modelId = '@cf/moonshotai/kimi-k2.5'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = extractSchemas[schemaName] as any
    const { output } = await generateText({
      model: resolveModel(c.env, modelId),
      output: Output.object({ schema }),
      prompt: `Extract the following from this text:\n\n${text}`,
    })

    return c.json({
      success: true,
      schema: schemaName,
      model: modelId,
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
 * Hono RPC type export for type-safe client usage
 *
 * @example
 * import { hc } from 'hono/client'
 * import type { ChatRoutes } from '@/server/modules/chat/routes'
 * const client = hc<ChatRoutes>('/api/chat')
 */
export type ChatRoutes = typeof app

export default app
