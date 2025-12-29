/**
 * Stream Transformer for AI Gateway
 *
 * Transforms OpenAI-format SSE streams from AI Gateway to our internal format.
 *
 * OpenAI format:
 *   data: {"choices":[{"delta":{"content":"Hello"}}]}
 *   data: [DONE]
 *
 * Internal format:
 *   data: {"type":"text","data":"Hello"}
 *   data: {"type":"done"}
 *
 * @see https://developers.cloudflare.com/ai-gateway/integrations/streaming/
 */

import type { StreamingChunk, StreamUsage } from './types'

/**
 * OpenAI streaming chunk format
 */
interface OpenAIStreamChunk {
  id?: string
  object?: string
  created?: number
  model?: string
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Callbacks for stream processing
 */
export interface StreamCallbacks {
  /** Called when text content is received */
  onText?: (text: string) => void | Promise<void>
  /** Called when stream completes */
  onDone?: (usage?: StreamUsage) => void | Promise<void>
  /** Called on error */
  onError?: (error: string) => void | Promise<void>
}

/**
 * Process an OpenAI-format SSE stream and call callbacks
 *
 * @example
 * const stream = await gateway.chatStream(messages, options)
 * let fullText = ''
 *
 * await processOpenAIStream(stream, {
 *   onText: (text) => {
 *     fullText += text
 *     writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'text', data: text })}\n\n`))
 *   },
 *   onDone: (usage) => {
 *     writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
 *   },
 * })
 */
export async function processOpenAIStream(
  stream: ReadableStream,
  callbacks: StreamCallbacks
): Promise<{ fullText: string; usage?: StreamUsage }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let lastUsage: StreamUsage | undefined
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Append to buffer and process complete lines
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')

      // Keep the last incomplete line in buffer
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        if (!line.startsWith('data: ')) continue

        const data = line.slice(6) // Remove 'data: ' prefix

        // Handle [DONE] marker
        if (data === '[DONE]') {
          await callbacks.onDone?.(lastUsage)
          continue
        }

        try {
          const parsed = JSON.parse(data) as OpenAIStreamChunk

          // Extract text content from delta
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullText += content
            await callbacks.onText?.(content)
          }

          // Capture usage if present (usually on final chunk)
          if (parsed.usage) {
            lastUsage = {
              promptTokens: parsed.usage.prompt_tokens,
              completionTokens: parsed.usage.completion_tokens,
              totalTokens: parsed.usage.total_tokens,
            }
          }
        } catch {
          // Ignore JSON parse errors - may be incomplete chunk
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const lines = buffer.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') {
          await callbacks.onDone?.(lastUsage)
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    await callbacks.onError?.(errorMessage)
  } finally {
    reader.releaseLock()
  }

  return { fullText, usage: lastUsage }
}

/**
 * Create a TransformStream that converts OpenAI SSE to internal SSE format
 *
 * Use this when you want to pipe the stream directly rather than process with callbacks.
 *
 * @example
 * const stream = await gateway.chatStream(messages, options)
 * const transformed = stream.pipeThrough(createStreamTransformer())
 * return new Response(transformed, { headers: { 'Content-Type': 'text/event-stream' } })
 */
export function createStreamTransformer(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        if (!line.startsWith('data: ')) continue

        const data = line.slice(6)

        if (data === '[DONE]') {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
          )
          continue
        }

        try {
          const parsed = JSON.parse(data) as OpenAIStreamChunk
          const content = parsed.choices?.[0]?.delta?.content

          if (content) {
            const internalChunk: StreamingChunk = {
              type: 'text',
              data: content,
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(internalChunk)}\n\n`)
            )
          }

          // Include usage in done event if available
          if (parsed.usage) {
            const doneChunk: StreamingChunk = {
              type: 'done',
              usage: {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens,
              },
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`)
            )
          }
        } catch {
          // Ignore parse errors
        }
      }
    },

    flush(controller) {
      // Process any remaining buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
            )
          }
        }
      }
    },
  })
}
