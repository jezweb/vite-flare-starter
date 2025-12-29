/**
 * Workers AI Client
 *
 * A lightweight, type-safe wrapper around Cloudflare Workers AI that provides:
 * - Type-safe model selection
 * - Automatic thinking token extraction for reasoning models
 * - JSON generation with Zod validation
 * - Retry logic with exponential backoff
 * - Streaming support
 *
 * @example
 * import { createAIClient } from '@/server/lib/ai'
 *
 * const ai = createAIClient(c.env.AI)
 *
 * // Simple generation
 * const result = await ai.generate('Summarize this text...')
 *
 * // With specific model and options
 * const result = await ai.generate(prompt, {
 *   model: 'llama-70b',
 *   maxTokens: 2000,
 *   temperature: 0.7,
 * })
 *
 * // JSON with Zod validation
 * const { data } = await ai.generateJSON(prompt, mySchema)
 */

import type { z } from 'zod'
import type {
  AIClientOptions,
  GenerateResult,
  GenerateJSONResult,
  ChatMessage,
  AIRunParams,
  TokenUsage,
} from './types'
import { MODEL_REGISTRY, DEFAULT_MODEL } from './models'
import { AIError, AIErrorCode, withRetry } from './errors'
import { extractThinking, extractJSON, buildJSONPrompt, estimateTokens } from './utils'

/**
 * Default timeout in milliseconds (30 seconds)
 */
const DEFAULT_TIMEOUT = 30000

/**
 * Extract text content from various AI response formats.
 * Handles both standard format and OpenAI Responses API format.
 */
function extractResponseText(response: unknown): string | null {
  if (typeof response === 'string') {
    return response
  }

  if (!response || typeof response !== 'object') {
    return null
  }

  const resp = response as Record<string, unknown>

  // Standard format: { response: string }
  if (typeof resp['response'] === 'string') {
    return resp['response']
  }

  // Simple text field
  if (typeof resp['text'] === 'string' && resp['text']) {
    return resp['text']
  }

  // OpenAI Responses API format: { output: [{ content: [{ text: string }] }] }
  // Used by GPT-OSS models
  if (Array.isArray(resp['output']) && resp['output'].length > 0) {
    const firstOutput = resp['output'][0] as Record<string, unknown>
    if (firstOutput && Array.isArray(firstOutput['content']) && firstOutput['content'].length > 0) {
      const firstContent = firstOutput['content'][0] as Record<string, unknown>
      if (typeof firstContent['text'] === 'string') {
        return firstContent['text']
      }
    }
  }

  // Direct content field (as string)
  if (typeof resp['content'] === 'string') {
    return resp['content']
  }

  // output_text field
  if (typeof resp['output_text'] === 'string') {
    return resp['output_text']
  }

  // output as string
  if (typeof resp['output'] === 'string') {
    return resp['output']
  }

  return null
}

/**
 * AI Client class for interacting with Workers AI
 */
export class AIClient {
  private ai: Ai

  constructor(ai: Ai) {
    this.ai = ai
  }

  /**
   * Generate text from a prompt.
   *
   * @param prompt - The prompt to send to the model
   * @param options - Generation options
   * @returns Generated response with thinking extracted for reasoning models
   *
   * @example
   * const result = await ai.generate('What is the capital of France?')
   * console.log(result.response) // "Paris"
   *
   * // With reasoning model
   * const result = await ai.generate('Solve: 2+2=?', { model: 'qwq-32b' })
   * console.log(result.thinking) // Chain-of-thought reasoning
   * console.log(result.response) // "4"
   */
  async generate(prompt: string, options: AIClientOptions = {}): Promise<GenerateResult> {
    const model = options.model || DEFAULT_MODEL
    const modelConfig = MODEL_REGISTRY[model]

    if (!modelConfig) {
      throw new AIError(
        `Model "${model}" not found in registry`,
        AIErrorCode.MODEL_NOT_FOUND,
        model
      )
    }

    const maxTokens = options.maxTokens || modelConfig.defaultMaxTokens
    const timeout = options.timeout ?? DEFAULT_TIMEOUT

    // Build params based on API format
    const params: AIRunParams = {
      max_tokens: maxTokens,
    }

    if (modelConfig.apiFormat === 'responses') {
      // OpenAI GPT-OSS uses Responses API format
      params.instructions = 'You are a helpful assistant.'
      params.input = prompt
    } else {
      // Standard format uses messages array (not prompt)
      params.messages = [
        { role: 'user', content: prompt },
      ]
    }

    if (options.temperature !== undefined) {
      params.temperature = options.temperature
    }

    const startTime = Date.now()
    const retries = options.retries ?? 2

    const response = await withRetry(
      async () => {
        // Workers AI doesn't support AbortSignal, so use Promise.race for timeout
        const aiPromise = this.ai.run(
          modelConfig.id as Parameters<Ai['run']>[0],
          params
        )

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Request timed out after ${timeout}ms`)), timeout)
        })

        return Promise.race([aiPromise, timeoutPromise])
      },
      model,
      { retries }
    )

    const durationMs = Date.now() - startTime

    // Extract text from response (handles various AI response formats)
    const raw = extractResponseText(response)
    if (raw === null) {
      throw new AIError(
        `Could not extract text from model ${model} response`,
        AIErrorCode.INVALID_RESPONSE,
        model
      )
    }

    // Estimate token usage
    const inputTokens = estimateTokens(prompt)
    const outputTokens = estimateTokens(raw)
    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    }

    // Extract thinking for reasoning models
    if (modelConfig.isReasoning) {
      const { thinking, content } = extractThinking(raw)
      return {
        response: content,
        thinking,
        raw,
        model,
        durationMs,
        usage,
      }
    }

    return {
      response: raw,
      thinking: null,
      raw,
      model,
      durationMs,
      usage,
    }
  }

  /**
   * Multi-turn chat conversation.
   *
   * @param messages - Array of chat messages
   * @param options - Generation options
   *
   * @example
   * const result = await ai.chat([
   *   { role: 'system', content: 'You are a helpful assistant.' },
   *   { role: 'user', content: 'What is TypeScript?' },
   * ])
   */
  async chat(
    messages: ChatMessage[],
    options: AIClientOptions = {}
  ): Promise<GenerateResult> {
    const model = options.model || DEFAULT_MODEL
    const modelConfig = MODEL_REGISTRY[model]

    if (!modelConfig) {
      throw new AIError(
        `Model "${model}" not found in registry`,
        AIErrorCode.MODEL_NOT_FOUND,
        model
      )
    }

    const maxTokens = options.maxTokens || modelConfig.defaultMaxTokens
    const timeout = options.timeout ?? DEFAULT_TIMEOUT

    // Build params based on API format
    const params: AIRunParams = {
      max_tokens: maxTokens,
    }

    if (modelConfig.apiFormat === 'responses') {
      // OpenAI GPT-OSS uses Responses API format
      // Extract system message as instructions, combine user messages as input
      const systemMessage = messages.find((m) => m.role === 'system')
      const userMessages = messages.filter((m) => m.role !== 'system')
      params.instructions = systemMessage?.content || 'You are a helpful assistant.'
      params.input = userMessages.map((m) => `${m.role}: ${m.content}`).join('\n')
    } else {
      // Standard format
      params.messages = messages.map((m) => ({ role: m.role, content: m.content }))
    }

    if (options.temperature !== undefined) {
      params.temperature = options.temperature
    }

    const startTime = Date.now()
    const retries = options.retries ?? 2

    const response = await withRetry(
      async () => {
        // Workers AI doesn't support AbortSignal, so use Promise.race for timeout
        const aiPromise = this.ai.run(
          modelConfig.id as Parameters<Ai['run']>[0],
          params
        )

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Request timed out after ${timeout}ms`)), timeout)
        })

        return Promise.race([aiPromise, timeoutPromise])
      },
      model,
      { retries }
    )

    const durationMs = Date.now() - startTime

    // Extract text from response (handles various AI response formats)
    const raw = extractResponseText(response)
    if (raw === null) {
      throw new AIError(
        `Could not extract text from model ${model} response`,
        AIErrorCode.INVALID_RESPONSE,
        model
      )
    }

    // Estimate token usage from messages and response
    const inputText = messages.map((m) => m.content).join('\n')
    const inputTokens = estimateTokens(inputText) + (messages.length * 4) // Add overhead for role tags
    const outputTokens = estimateTokens(raw)
    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    }

    if (modelConfig.isReasoning) {
      const { thinking, content } = extractThinking(raw)
      return {
        response: content,
        thinking,
        raw,
        model,
        durationMs,
        usage,
      }
    }

    return {
      response: raw,
      thinking: null,
      raw,
      model,
      durationMs,
      usage,
    }
  }

  /**
   * Generate structured JSON output with Zod validation.
   *
   * Prompts the model to return JSON and validates it against a Zod schema.
   * Returns success: false if parsing or validation fails.
   *
   * @param prompt - The prompt requesting JSON output
   * @param schema - Zod schema for validation
   * @param options - Generation options
   *
   * @example
   * const contactSchema = z.object({
   *   name: z.string(),
   *   email: z.string().email(),
   * })
   *
   * const { data, success } = await ai.generateJSON(
   *   'Extract contact info from: "John at john@example.com"',
   *   contactSchema
   * )
   *
   * if (success && data) {
   *   console.log(data.name, data.email)
   * }
   */
  async generateJSON<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options: AIClientOptions = {}
  ): Promise<GenerateJSONResult<T>> {
    const model = options.model || DEFAULT_MODEL
    const modelConfig = MODEL_REGISTRY[model]

    if (!modelConfig) {
      throw new AIError(
        `Model "${model}" not found in registry`,
        AIErrorCode.MODEL_NOT_FOUND,
        model
      )
    }

    // Build JSON-focused prompt
    const jsonPrompt = buildJSONPrompt(prompt)

    const maxTokens = options.maxTokens || modelConfig.defaultMaxTokens
    const timeout = options.timeout ?? DEFAULT_TIMEOUT

    // Build params based on API format
    const params: AIRunParams = {
      max_tokens: maxTokens,
    }

    if (modelConfig.apiFormat === 'responses') {
      // OpenAI GPT-OSS uses Responses API format
      params.instructions = 'You are a helpful assistant that responds with valid JSON only.'
      params.input = jsonPrompt
    } else {
      // Standard format uses messages array
      params.messages = [
        { role: 'system', content: 'You are a helpful assistant that responds with valid JSON only.' },
        { role: 'user', content: jsonPrompt },
      ]
    }

    if (options.temperature !== undefined) {
      params.temperature = options.temperature
    }

    const startTime = Date.now()
    const retries = options.retries ?? 2

    const response = await withRetry(
      async () => {
        // Workers AI doesn't support AbortSignal, so use Promise.race for timeout
        const aiPromise = this.ai.run(
          modelConfig.id as Parameters<Ai['run']>[0],
          params
        )

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Request timed out after ${timeout}ms`)), timeout)
        })

        return Promise.race([aiPromise, timeoutPromise])
      },
      model,
      { retries }
    )

    const durationMs = Date.now() - startTime

    // Extract text from response (handles various AI response formats)
    const raw = extractResponseText(response)
    if (raw === null) {
      throw new AIError(
        `Could not extract text from model ${model} response`,
        AIErrorCode.INVALID_RESPONSE,
        model
      )
    }

    // Estimate token usage
    const inputTokens = estimateTokens(jsonPrompt) + 20 // Add overhead for system prompt
    const outputTokens = estimateTokens(raw)
    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    }

    // Extract thinking for reasoning models
    let thinking: string | null = null
    let contentToProcess = raw

    if (modelConfig.isReasoning) {
      const extracted = extractThinking(raw)
      thinking = extracted.thinking
      contentToProcess = extracted.content
    }

    // Try to extract and validate JSON
    const extracted = extractJSON<unknown>(contentToProcess)

    if (extracted === null) {
      return {
        data: null,
        raw,
        thinking,
        model,
        durationMs,
        success: false,
        error: 'Failed to extract JSON from response',
        usage,
      }
    }

    // Validate with Zod
    const parseResult = schema.safeParse(extracted)

    if (!parseResult.success) {
      return {
        data: null,
        raw,
        thinking,
        model,
        durationMs,
        success: false,
        error: `Validation failed: ${parseResult.error.message}`,
        usage,
      }
    }

    return {
      data: parseResult.data,
      raw,
      thinking,
      model,
      durationMs,
      success: true,
      usage,
    }
  }

  /**
   * Generate text with streaming response.
   *
   * @param prompt - The prompt to send to the model
   * @param options - Generation options
   * @returns A ReadableStream of the response
   *
   * @example
   * app.get('/api/stream', async (c) => {
   *   const ai = createAIClient(c.env.AI)
   *   const stream = await ai.generateStream('Write a story...')
   *
   *   return new Response(stream, {
   *     headers: { 'Content-Type': 'text/event-stream' }
   *   })
   * })
   */
  async generateStream(
    prompt: string,
    options: Omit<AIClientOptions, 'retries'> = {}
  ): Promise<ReadableStream> {
    const model = options.model || DEFAULT_MODEL
    const modelConfig = MODEL_REGISTRY[model]

    if (!modelConfig) {
      throw new AIError(
        `Model "${model}" not found in registry`,
        AIErrorCode.MODEL_NOT_FOUND,
        model
      )
    }

    if (!modelConfig.supportsStreaming) {
      throw new AIError(
        `Model "${model}" does not support streaming`,
        AIErrorCode.INVALID_RESPONSE,
        model
      )
    }

    const maxTokens = options.maxTokens || modelConfig.defaultMaxTokens

    // Build params based on API format
    const params: AIRunParams = {
      max_tokens: maxTokens,
      stream: true,
    }

    if (modelConfig.apiFormat === 'responses') {
      params.instructions = 'You are a helpful assistant.'
      params.input = prompt
    } else {
      // Standard format uses messages array
      params.messages = [
        { role: 'user', content: prompt },
      ]
    }

    if (options.temperature !== undefined) {
      params.temperature = options.temperature
    }

    const response = await this.ai.run(
      modelConfig.id as Parameters<Ai['run']>[0],
      params
    )

    // Workers AI returns a ReadableStream when stream: true
    return response as unknown as ReadableStream
  }

  /**
   * Streaming chat conversation.
   *
   * @param messages - Array of chat messages
   * @param options - Generation options
   * @returns A ReadableStream of the response
   */
  async chatStream(
    messages: ChatMessage[],
    options: Omit<AIClientOptions, 'retries'> = {}
  ): Promise<ReadableStream> {
    const model = options.model || DEFAULT_MODEL
    const modelConfig = MODEL_REGISTRY[model]

    if (!modelConfig) {
      throw new AIError(
        `Model "${model}" not found in registry`,
        AIErrorCode.MODEL_NOT_FOUND,
        model
      )
    }

    if (!modelConfig.supportsStreaming) {
      throw new AIError(
        `Model "${model}" does not support streaming`,
        AIErrorCode.INVALID_RESPONSE,
        model
      )
    }

    const maxTokens = options.maxTokens || modelConfig.defaultMaxTokens

    // Build params based on API format
    const params: AIRunParams = {
      max_tokens: maxTokens,
      stream: true,
    }

    if (modelConfig.apiFormat === 'responses') {
      const systemMessage = messages.find((m) => m.role === 'system')
      const userMessages = messages.filter((m) => m.role !== 'system')
      params.instructions = systemMessage?.content || 'You are a helpful assistant.'
      params.input = userMessages.map((m) => `${m.role}: ${m.content}`).join('\n')
    } else {
      params.messages = messages.map((m) => ({ role: m.role, content: m.content }))
    }

    if (options.temperature !== undefined) {
      params.temperature = options.temperature
    }

    const response = await this.ai.run(
      modelConfig.id as Parameters<Ai['run']>[0],
      params
    )

    return response as unknown as ReadableStream
  }
}

/**
 * Create an AI client instance.
 *
 * @param ai - The Workers AI binding from c.env.AI
 * @returns An AIClient instance
 *
 * @example
 * import { createAIClient } from '@/server/lib/ai'
 *
 * app.get('/api/analyze', async (c) => {
 *   const ai = createAIClient(c.env.AI)
 *   const result = await ai.generate('Analyze this...')
 *   return c.json({ result: result.response })
 * })
 */
export function createAIClient(ai: Ai): AIClient {
  return new AIClient(ai)
}
