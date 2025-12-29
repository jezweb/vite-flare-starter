/**
 * Chat API Routes
 *
 * Provides streaming chat functionality using Workers AI
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import { createAIClient, resolveModelId, MODEL_REGISTRY } from '@/server/lib/ai'

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
 * Returns a text/event-stream response with SSE format
 */
app.post('/', zValidator('json', chatRequestSchema), async (c) => {
  const { messages, model } = c.req.valid('json')

  try {
    const ai = createAIClient(c.env.AI)
    const modelId = model ? resolveModelId(model) : undefined
    const modelConfig = modelId ? MODEL_REGISTRY[modelId] : MODEL_REGISTRY['@cf/meta/llama-3.1-8b-instruct']

    // Check if model supports streaming
    if (!modelConfig.supportsStreaming) {
      // Fall back to non-streaming response
      const result = await ai.chat(messages, { model: modelId })

      // Return as SSE format for consistency
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          // Send the full response as a single chunk
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

    // Get streaming response
    const stream = await ai.chatStream(messages, { model: modelId })

    // Transform the stream to SSE format
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

            // Parse the chunk - Workers AI returns JSON chunks
            const text = decoder.decode(value, { stream: true })

            // Workers AI stream format: data: {"response":"text"}
            const lines = text.split('\n').filter((line) => line.trim())

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                } else {
                  try {
                    const parsed = JSON.parse(data)
                    if (parsed.response) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ content: parsed.response })}\n\n`)
                      )
                    }
                  } catch {
                    // If parsing fails, send raw content
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: data })}\n\n`))
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream processing error:', error)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: 'Stream processing error' })}\n\n`
            )
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
 * Returns a JSON response with the complete message
 */
app.post('/complete', zValidator('json', chatRequestSchema), async (c) => {
  const { messages, model } = c.req.valid('json')

  try {
    const ai = createAIClient(c.env.AI)
    const modelId = model ? resolveModelId(model) : undefined
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
