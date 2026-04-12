/**
 * Chat API Routes
 *
 * Streaming chat using AI SDK + Workers AI provider.
 * Supports all Workers AI models via the native binding.
 */
import { Hono } from 'hono'
import { streamText, convertToModelMessages } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import { DEFAULT_MODEL, getModel } from '@/server/lib/ai/models'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)
app.use('*', requireScopes('chat:write'))

/**
 * POST /api/chat - Streaming chat endpoint (AI SDK protocol)
 *
 * Accepts AI SDK UIMessage format from useChat hook.
 * Returns streaming response via toUIMessageStreamResponse().
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { messages, model: requestedModel, systemPrompt } = body

    const modelId = requestedModel || DEFAULT_MODEL
    const modelConfig = getModel(modelId)

    // Create Workers AI provider with the native binding
    const workersai = createWorkersAI({ binding: c.env.AI })

    const result = streamText({
      model: workersai(modelId),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      maxOutputTokens: modelConfig?.defaultMaxTokens ?? 2000,
    })

    return result.toUIMessageStreamResponse()
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
 *
 * Returns a JSON response with the complete message.
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

export default app
