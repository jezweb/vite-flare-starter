/**
 * Chat API Routes
 *
 * Provides streaming chat functionality using AI Gateway.
 * Supports all providers: Workers AI (free), OpenAI, Anthropic, Google, etc.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import { createAIGatewayClient, getModelConfig, DEFAULT_MODEL } from '@/server/lib/ai'

const app = new Hono<AuthContext>()

// Apply auth middleware to all routes
app.use('*', authMiddleware)

// All chat routes require chat:write scope for API tokens
app.use('*', requireScopes('chat:write'))

// Schema for chat request
const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  model: z.string().optional(),
})

/**
 * POST /api/chat - Streaming chat endpoint
 *
 * Returns a text/event-stream response with SSE format.
 * Works with all providers via AI Gateway.
 */
app.post('/', zValidator('json', chatRequestSchema), async (c) => {
  const { messages, model } = c.req.valid('json')

  try {
    const ai = createAIGatewayClient(c.env)
    const modelId = model || DEFAULT_MODEL
    const modelConfig = getModelConfig(modelId)

    // Check if model supports streaming
    if (modelConfig && !modelConfig.supportsStreaming) {
      // Fall back to non-streaming response
      const result = await ai.chat(messages, { model: modelId })

      // Return as SSE format for consistency
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: result.response })}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // Get streaming response from AI Gateway
    const stream = await ai.chatStream(messages, { model: modelId })

    // Transform the stream to our SSE format
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const transformedStream = new ReadableStream({
      async start(controller) {
        const reader = stream.getReader()

        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
              break
            }

            // Parse the chunk - AI Gateway returns SSE format
            const text = decoder.decode(value, { stream: true })
            const lines = text.split('\n').filter((line) => line.trim())

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                } else {
                  try {
                    const parsed = JSON.parse(data)
                    // Handle both Workers AI format and OpenAI format
                    const content = parsed.response || parsed.choices?.[0]?.delta?.content
                    if (content) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                    }
                  } catch {
                    // If parsing fails, skip
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream processing error:', error)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'Stream processing error' })}\n\n`)
          )
          controller.close()
        }
      },
    })

    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat error:', error)
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Chat failed',
      },
      500
    )
  }
})

/**
 * POST /api/chat/complete - Non-streaming chat endpoint
 *
 * Returns a JSON response with the complete message.
 * Works with all providers via AI Gateway.
 */
app.post('/complete', zValidator('json', chatRequestSchema), async (c) => {
  const { messages, model } = c.req.valid('json')

  try {
    const ai = createAIGatewayClient(c.env)
    const modelId = model || DEFAULT_MODEL
    const result = await ai.chat(messages, { model: modelId })

    return c.json({
      success: true,
      message: {
        role: 'assistant' as const,
        content: result.response,
      },
      model: result.model,
      thinking: result.thinking,
      durationMs: result.durationMs,
      usage: result.usage,
    })
  } catch (error) {
    console.error('Chat error:', error)
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Chat failed',
      },
      500
    )
  }
})

export default app
