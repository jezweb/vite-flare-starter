/**
 * Chat API Routes
 *
 * Streaming chat using AI SDK ToolLoopAgent pattern.
 * Features: agent abstraction, smoothStream, token usage logging,
 * reasoning middleware, tool calling, consumeStream for disconnect resilience.
 */
import { Hono } from 'hono'
import { generateText, convertToModelMessages, smoothStream, Output, createAgentUIStreamResponse, safeValidateUIMessages, pruneMessages, consumeStream, streamObject } from 'ai'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { desc, eq, sql } from 'drizzle-orm'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import { DEFAULT_MODEL, getModel, resolveModel, buildChatAgent } from '@/server/lib/ai'
import { createD1ChatStorage } from '@/server/modules/conversations/storage'
import { aiUsageLogs } from './db/schema'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)
app.use('*', requireScopes('chat:write'))

/**
 * POST /api/chat - Streaming chat endpoint (AI SDK ToolLoopAgent)
 *
 * Accepts AI SDK UIMessage format from useChat hook.
 * Uses ToolLoopAgent for the agent loop, createAgentUIStreamResponse for streaming.
 * Supports conversation persistence via optional conversationId.
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { model: requestedModel, systemPrompt, conversationId: existingConversationId } = body
    // Accept both legacy { messages } and new { message, allMessages } shapes
    const messages = (body.messages || body.allMessages || (body.message ? [body.message] : [])) as Array<{ role: string; content?: unknown; parts?: unknown[] }>

    const userId = c.get('userId')
    const user = c.get('user') as { name?: string; email?: string; role?: string } | undefined
    const storage = createD1ChatStorage(c.env.DB)

    // Create or reuse conversation
    let conversationId = existingConversationId as string | undefined
    if (!conversationId) {
      // Auto-generate title from first user message
      const firstUserMsg = messages.find((m: { role: string }) => m.role === 'user')
      const title = firstUserMsg?.content
        ? String(typeof firstUserMsg.content === 'string' ? firstUserMsg.content : JSON.stringify(firstUserMsg.content)).slice(0, 80)
        : 'New conversation'

      conversationId = await storage.createConversation(userId, {
        title,
        model: requestedModel || DEFAULT_MODEL,
        systemPrompt,
      })
    }

    // Build the agent (model, tools, system prompt, logging — all encapsulated)
    const { agent, startTime, modelId } = await buildChatAgent({
      env: c.env as unknown as Parameters<typeof buildChatAgent>[0]['env'],
      userId,
      user: user || undefined,
      modelId: requestedModel,
      systemPrompt,
    })

    // Validate loaded messages against current tool schemas (handles schema drift)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validation = await safeValidateUIMessages({ messages, tools: agent.tools as any })
    const validatedMessages = validation.success ? validation.data : messages

    // Stream the agent response to the client
    const response = await createAgentUIStreamResponse({
      agent,
      uiMessages: validatedMessages,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      originalMessages: validatedMessages as any,
      experimental_transform: smoothStream({ chunking: 'word' }),
      sendReasoning: true,
      messageMetadata: ({ part }) => {
        if (part.type === 'finish') {
          return {
            conversationId,
            model: modelId,
            inputTokens: part.totalUsage?.inputTokens,
            outputTokens: part.totalUsage?.outputTokens,
            durationMs: Date.now() - startTime,
          }
        }
        return undefined
      },
      onFinish: async ({ messages: finalMessages }) => {
        // Persist conversation messages to D1
        try {
          await storage.saveChat({ conversationId: conversationId!, messages: finalMessages })
        } catch (err) {
          console.error('Failed to persist conversation:', err)
        }
      },
      // Consume a tee'd copy server-side — ensures onFinish fires even if client disconnects
      consumeSseStream: async ({ stream }) => {
        await consumeStream({ stream })
      },
    })

    return response
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

    // Prune old reasoning and tool calls to reduce context size
    const modelMessages = pruneMessages({
      messages: await convertToModelMessages(messages),
      reasoning: 'before-last-message',
      toolCalls: 'before-last-message',
    })

    const { text, usage } = await generateText({
      model: resolveModel(c.env, modelId),
      messages: modelMessages,
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
 * POST /api/chat/stream-extract - Streaming structured data extraction
 *
 * Like /extract but streams the object progressively via AI SDK streamObject.
 * Client consumes with useObject() hook from @ai-sdk/react.
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

    const modelId = '@cf/moonshotai/kimi-k2.5'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = extractSchemas[schemaName] as any
    const result = streamObject({
      model: resolveModel(c.env, modelId),
      schema,
      prompt: `Extract the following from this text:\n\n${text}`,
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
