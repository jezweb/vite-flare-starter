/**
 * Chat API Routes
 *
 * Streaming chat using AI SDK + Workers AI provider.
 * Features: smoothStream, token usage logging, reasoning middleware, tool calling.
 */
import { Hono } from 'hono'
import { streamText, convertToModelMessages, smoothStream, stepCountIs } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { drizzle } from 'drizzle-orm/d1'
import { desc, eq, sql } from 'drizzle-orm'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import { DEFAULT_MODEL, getModel } from '@/server/lib/ai/models'
import { buildModel } from '@/server/lib/ai/middleware'
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

    const workersai = createWorkersAI({ binding: c.env.AI })
    const model = buildModel(workersai(modelId), modelId)

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

    const workersai = createWorkersAI({ binding: c.env.AI })

    const { text, usage } = await streamText({
      model: workersai(modelId),
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

export default app
