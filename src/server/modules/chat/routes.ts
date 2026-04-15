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
    const { model: requestedModel, conversationId: existingConversationId } = body
    // systemPrompt is intentionally server-controlled — client cannot override.
    // Fork-users: change this in buildChatAgent's default instructions.
    const systemPrompt = undefined
    // Accept both legacy { messages } and new { message, allMessages } shapes
    const messages = (body.messages || body.allMessages || (body.message ? [body.message] : [])) as Array<{ role: string; content?: unknown; parts?: unknown[] }>

    const userId = c.get('userId')
    const user = c.get('user') as { name?: string; email?: string; role?: string } | undefined
    const storage = createD1ChatStorage(c.env.DB)

    // Create or reuse conversation
    let conversationId = existingConversationId as string | undefined
    if (!conversationId) {
      // Auto-generate title from first user message — UIMessages use `parts`, not `content`
      const firstUserMsg = messages.find((m: { role: string }) => m.role === 'user')
      const extractTitle = (msg: typeof firstUserMsg): string => {
        if (!msg) return 'New conversation'
        if (typeof msg.content === 'string' && msg.content.trim()) return msg.content.slice(0, 80)
        const parts = msg.parts as Array<{ type?: string; text?: string }> | undefined
        const textPart = parts?.find((p) => p?.type === 'text' && typeof p.text === 'string' && p.text.trim())
        if (textPart?.text) return textPart.text.slice(0, 80)
        return 'New conversation'
      }

      conversationId = await storage.createConversation(userId, {
        title: extractTitle(firstUserMsg),
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

    // Pre-process file attachments: convert non-image files to text/transcription
    // so they work with models that only accept image file parts.
    for (const msg of messages) {
      if (msg.role !== 'user' || !msg.parts) continue
      const parts = msg.parts as Array<{ type: string; url?: string; mediaType?: string; data?: string; text?: string }>
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!
        if (part.type !== 'file') continue
        const mime = part.mediaType || ''
        // Images pass through — models handle them natively
        if (mime.startsWith('image/')) continue
        try {
          if (!part.url?.startsWith('data:')) continue
          const base64 = part.url.split(',')[1] || ''
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

          let textContent = ''

          // Audio files: transcribe via Workers AI (Deepgram Nova 3)
          if (mime.startsWith('audio/')) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const result = await (c.env.AI as any).run('@cf/deepgram/nova-3', { audio: [...bytes] })
              textContent = result?.text || result?.vtt || ''
              if (textContent) {
                textContent = `[Audio transcription]:\n\n${textContent}`
              }
            } catch (err) {
              console.warn('Audio transcription failed:', err)
              textContent = '[Audio file attached but transcription failed. Use the transcribe_audio tool to retry.]'
            }
          // PDFs: convert to markdown via toMarkdown
          } else if (mime === 'application/pdf') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ai = c.env.AI as any
            if (typeof ai?.toMarkdown === 'function') {
              const result = await ai.toMarkdown([{ name: 'upload', blob: new Blob([bytes], { type: mime }) }])
              textContent = `[Attached file content]:\n\n${result?.[0]?.data || new TextDecoder().decode(bytes)}`
            } else {
              textContent = `[Attached file content]:\n\n${new TextDecoder().decode(bytes)}`
            }
          // Other text-ish files: decode as UTF-8
          } else {
            textContent = `[Attached file content]:\n\n${new TextDecoder().decode(bytes)}`
          }

          if (textContent) {
            parts[i] = { type: 'text', text: textContent } as typeof part
          }
        } catch (err) {
          console.warn('Failed to convert file attachment:', err)
        }
      }
    }

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
      // Without this the assistant message lands in D1 with an empty id, failing the PK.
      generateMessageId: () => crypto.randomUUID(),
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
        console.log(JSON.stringify({ event: 'chat_onFinish', conversationId, messageCount: finalMessages.length, firstRole: finalMessages[0]?.role }))
        try {
          await storage.saveChat({ conversationId: conversationId!, messages: finalMessages })
          console.log(JSON.stringify({ event: 'chat_saved', conversationId, messageCount: finalMessages.length }))
        } catch (err) {
          console.error(JSON.stringify({ event: 'chat_save_error', error: String(err), conversationId }))
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
