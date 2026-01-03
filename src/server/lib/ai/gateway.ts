/**
 * AI Gateway Client (Unified Compat Endpoint)
 *
 * Uses AI Gateway's OpenAI-compatible endpoint for ALL providers.
 * Single endpoint, single format - gateway handles conversion.
 *
 * Benefits:
 * - One code path for Workers AI, OpenAI, Anthropic, Google, etc.
 * - BYOK: API keys stored in Cloudflare AI Gateway dashboard
 * - Unified logging and analytics
 * - No special cases for different API formats
 *
 * Model format: "provider/model-name" for external, "@cf/..." for Workers AI
 *
 * @see https://developers.cloudflare.com/ai-gateway/
 */

import type { ChatMessage, TokenUsage, GenerateResult, GenerateJSONResult } from './types'
import type { ProviderModelConfig } from './providers'
import { parseModelId, getModelConfig, DEFAULT_MODEL } from './providers'
import { withRetry } from './errors'
import { extractThinking, extractJSON, buildJSONPrompt, estimateTokens } from './utils'
import type { z } from 'zod'

// Cloudflare account ID (from wrangler.jsonc)
const DEFAULT_ACCOUNT_ID = '0460574641fdbb98159c98ebf593e2bd'

/**
 * Environment bindings for AI Gateway
 */
export interface AIGatewayEnv {
  AI_GATEWAY_ID?: string
  CF_ACCOUNT_ID?: string
  CF_AIG_TOKEN?: string
  AI?: Ai // Native Workers AI binding for @cf/@hf models
}

/**
 * Options for AI Gateway requests
 */
export interface AIGatewayOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  timeout?: number
  retries?: number
}

/**
 * Get the Compat endpoint URL (OpenAI-compatible for all providers)
 */
function getCompatEndpoint(env: AIGatewayEnv): string {
  const gatewayId = env.AI_GATEWAY_ID || 'default'
  const accountId = env.CF_ACCOUNT_ID || DEFAULT_ACCOUNT_ID
  return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}`
}

/**
 * Build headers for AI Gateway requests
 */
function buildHeaders(env: AIGatewayEnv): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Authenticated Gateway requires cf-aig-authorization header
  if (env.CF_AIG_TOKEN) {
    headers['cf-aig-authorization'] = `Bearer ${env.CF_AIG_TOKEN}`
  }

  return headers
}

/**
 * Convert ChatMessage array to OpenAI format
 */
function convertMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))
}

/**
 * Check if a model should use native Workers AI binding
 * @cf/ and @hf/ prefixes indicate Workers AI models
 */
function isWorkersAIModel(modelId: string): boolean {
  return modelId.startsWith('@cf/') || modelId.startsWith('@hf/')
}

/**
 * Check if a model should route through OpenRouter
 * Models with slashes (like x-ai/grok-2) that aren't Workers AI
 */
function isOpenRouterModel(modelId: string): boolean {
  return modelId.includes('/') && !isWorkersAIModel(modelId)
}

/**
 * Parse tool call from text response (fallback for models like Qwen)
 *
 * Some models output tool calls as JSON in their text response:
 * - {"name":"toolName","arguments":{"param":"value"}}
 * - {"tool":"toolName","params":{"param":"value"}}
 */
function parseToolCallFromText(
  text: string
): { id: string; name: string; arguments: Record<string, unknown> } | null {
  // Try to find JSON in the text
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0])

    // Format 1: {"name":"tool","arguments":{...}}
    if (parsed.name && typeof parsed.name === 'string') {
      return {
        id: crypto.randomUUID(),
        name: parsed.name,
        arguments: parsed.arguments || parsed.params || parsed.args || {},
      }
    }

    // Format 2: {"tool":"name","params":{...}}
    if (parsed.tool && typeof parsed.tool === 'string') {
      return {
        id: crypto.randomUUID(),
        name: parsed.tool,
        arguments: parsed.params || parsed.arguments || parsed.args || {},
      }
    }

    // Format 3: {"function":{"name":"tool","arguments":{...}}}
    if (parsed.function?.name && typeof parsed.function.name === 'string') {
      return {
        id: crypto.randomUUID(),
        name: parsed.function.name,
        arguments: parsed.function.arguments || {},
      }
    }
  } catch {
    // Not valid JSON, ignore
  }

  return null
}

/**
 * Get the AI Gateway model path for a given model ID
 *
 * - Workers AI: workers-ai/@cf/meta/llama-3.1-8b-instruct
 * - OpenRouter: openrouter/x-ai/grok-2 (for slash-format models)
 * - OpenAI: openai/gpt-4o
 * - Anthropic: anthropic/claude-sonnet-4-5-20250929
 */
function getGatewayModelPath(modelId: string): string {
  const { provider, model } = parseModelId(modelId)

  if (provider === 'workers-ai') {
    // Workers AI models go through workers-ai endpoint
    return `workers-ai/${model}`
  }

  // OpenRouter models (have slash like x-ai/grok-2)
  if (isOpenRouterModel(modelId)) {
    return `openrouter/${modelId}`
  }

  // External providers: provider/model
  return `${provider}/${model}`
}

/**
 * Call AI Gateway Compat endpoint
 */
async function callGateway(
  env: AIGatewayEnv,
  modelId: string,
  messages: ChatMessage[],
  options: AIGatewayOptions = {}
): Promise<{ content: string; finishReason: string }> {
  const baseUrl = getCompatEndpoint(env)
  const gatewayPath = getGatewayModelPath(modelId)
  const endpoint = `${baseUrl}/${gatewayPath}`

  const config = getModelConfig(modelId)
  const maxTokens = options.maxTokens || config?.defaultMaxTokens || 1000

  const body: Record<string, unknown> = {
    messages: convertMessages(messages),
    max_tokens: maxTokens,
  }

  if (options['temperature'] !== undefined) {
    body['temperature'] = options['temperature']
  }

  const timeout = options.timeout || 30000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(env),
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`AI Gateway error (${response.status}): ${error}`)
    }

    const result = (await response.json()) as {
      response?: string // Workers AI format
      choices?: Array<{
        // OpenAI format
        message: {
          content?: string | null
        }
        finish_reason: string
      }>
    }

    // Handle Workers AI response format
    if (result.response !== undefined) {
      return {
        content: result.response,
        finishReason: 'stop',
      }
    }

    // Handle OpenAI format
    if (result.choices && result.choices.length > 0) {
      const choice = result.choices[0]
      if (choice) {
        return {
          content: choice.message.content || '',
          finishReason: choice.finish_reason,
        }
      }
    }

    throw new Error('Unexpected response format from AI Gateway')
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`)
    }
    throw error
  }
}

/**
 * Call AI Gateway with streaming response
 */
async function callGatewayStream(
  env: AIGatewayEnv,
  modelId: string,
  messages: ChatMessage[],
  options: AIGatewayOptions = {}
): Promise<ReadableStream> {
  const baseUrl = getCompatEndpoint(env)
  const gatewayPath = getGatewayModelPath(modelId)
  const endpoint = `${baseUrl}/${gatewayPath}`

  const config = getModelConfig(modelId)
  const maxTokens = options.maxTokens || config?.defaultMaxTokens || 1000

  const body: Record<string, unknown> = {
    messages: convertMessages(messages),
    max_tokens: maxTokens,
    stream: true,
  }

  if (options['temperature'] !== undefined) {
    body['temperature'] = options['temperature']
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildHeaders(env),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AI Gateway error (${response.status}): ${error}`)
  }

  if (!response.body) {
    throw new Error('No response body from AI Gateway')
  }

  return response.body
}

/**
 * AI Gateway Client
 *
 * Simplified client that routes all requests through AI Gateway.
 * Works with Workers AI (free) and external providers (BYOK).
 */
export class AIGatewayClient {
  private env: AIGatewayEnv

  constructor(env: AIGatewayEnv) {
    this.env = env
  }

  /**
   * Generate text from a prompt
   */
  async generate(prompt: string, options: AIGatewayOptions = {}): Promise<GenerateResult> {
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }]
    return this.chat(messages, options)
  }

  /**
   * Multi-turn chat conversation
   *
   * Routes requests optimally:
   * - Workers AI models (@cf/@hf) → Native env.AI.run() binding (best performance)
   * - OpenRouter models (x-ai/grok-2) → AI Gateway openrouter passthrough
   * - Other providers → AI Gateway compat endpoint
   */
  async chat(messages: ChatMessage[], options: AIGatewayOptions = {}): Promise<GenerateResult> {
    const modelId = options.model || DEFAULT_MODEL
    const config = getModelConfig(modelId)
    const retries = options.retries ?? 2

    const startTime = Date.now()

    let result: { content: string; finishReason: string }

    // Workers AI models (@cf/@hf) - use native binding for better performance
    if (isWorkersAIModel(modelId) && this.env.AI) {
      result = await this.callNativeWorkersAI(modelId, messages, options)
    } else {
      // All other models via AI Gateway
      result = await withRetry(
        async () => callGateway(this.env, modelId, messages, options),
        modelId,
        { retries }
      )
    }

    const durationMs = Date.now() - startTime

    // Estimate token usage
    const inputText = messages.map((m) => m.content).join('\n')
    const inputTokens = estimateTokens(inputText) + messages.length * 4
    const outputTokens = estimateTokens(result.content)
    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    }

    // Extract thinking for reasoning models
    if (config?.isReasoning) {
      const { thinking, content } = extractThinking(result.content)
      return {
        response: content,
        thinking,
        raw: result.content,
        model: modelId,
        durationMs,
        usage,
      }
    }

    return {
      response: result.content,
      thinking: null,
      raw: result.content,
      model: modelId,
      durationMs,
      usage,
    }
  }

  /**
   * Call native Workers AI binding for @cf/@hf models
   * Better performance than routing through AI Gateway
   */
  private async callNativeWorkersAI(
    modelId: string,
    messages: ChatMessage[],
    options: AIGatewayOptions
  ): Promise<{ content: string; finishReason: string }> {
    const config = getModelConfig(modelId)
    const maxTokens = options.maxTokens || config?.defaultMaxTokens || 1000

    const aiMessages = messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }))

    const aiInput: AiTextGenerationInput = {
      messages: aiMessages,
      max_tokens: maxTokens,
    }

    if (options.temperature !== undefined) {
      aiInput.temperature = options.temperature
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const response = await this.env.AI!.run(modelId as Parameters<Ai['run']>[0], aiInput)

    // Handle string response
    if (typeof response === 'string') {
      return { content: response, finishReason: 'stop' }
    }

    // Handle object response
    const result = response as {
      response?: string | unknown
      tool_calls?: Array<{
        id?: string
        name: string
        arguments: Record<string, unknown>
      }>
    }

    // Ensure content is always a string
    let content =
      typeof result.response === 'string'
        ? result.response
        : result.response
          ? JSON.stringify(result.response)
          : ''

    // Fallback: Some models (like Qwen) output tool calls as JSON in text
    // Try to parse tool call from response if present
    if (content) {
      const parsed = parseToolCallFromText(content)
      if (parsed) {
        // Found a tool call in the text - this is informational only
        // The actual tool execution would happen in a separate tool-calling module
        console.log('[Workers AI] Detected tool call in text response:', parsed.name)
      }
    }

    return {
      content,
      finishReason: result.tool_calls ? 'tool_calls' : 'stop',
    }
  }

  /**
   * Generate structured JSON output with Zod validation
   */
  async generateJSON<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options: AIGatewayOptions = {}
  ): Promise<GenerateJSONResult<T>> {
    const modelId = options.model || DEFAULT_MODEL
    const config = getModelConfig(modelId)

    const jsonPrompt = buildJSONPrompt(prompt)
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant that responds with valid JSON only.' },
      { role: 'user', content: jsonPrompt },
    ]

    const startTime = Date.now()
    const retries = options.retries ?? 2

    const result = await withRetry(
      async () => callGateway(this.env, modelId, messages, options),
      modelId,
      { retries }
    )

    const durationMs = Date.now() - startTime

    // Estimate token usage
    const inputTokens = estimateTokens(jsonPrompt) + 20
    const outputTokens = estimateTokens(result.content)
    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    }

    // Extract thinking for reasoning models
    let thinking: string | null = null
    let contentToProcess = result.content

    if (config?.isReasoning) {
      const extracted = extractThinking(result.content)
      thinking = extracted.thinking
      contentToProcess = extracted.content
    }

    // Extract and validate JSON
    const extracted = extractJSON<unknown>(contentToProcess)

    if (extracted === null) {
      return {
        data: null,
        raw: result.content,
        thinking,
        model: modelId,
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
        raw: result.content,
        thinking,
        model: modelId,
        durationMs,
        success: false,
        error: `Validation failed: ${parseResult.error.message}`,
        usage,
      }
    }

    return {
      data: parseResult.data,
      raw: result.content,
      thinking,
      model: modelId,
      durationMs,
      success: true,
      usage,
    }
  }

  /**
   * Generate text with streaming response
   */
  async generateStream(prompt: string, options: AIGatewayOptions = {}): Promise<ReadableStream> {
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }]
    return this.chatStream(messages, options)
  }

  /**
   * Streaming chat conversation
   */
  async chatStream(messages: ChatMessage[], options: AIGatewayOptions = {}): Promise<ReadableStream> {
    const modelId = options.model || DEFAULT_MODEL
    return callGatewayStream(this.env, modelId, messages, options)
  }

  /**
   * Get model configuration
   */
  getModelConfig(modelId: string): ProviderModelConfig | undefined {
    return getModelConfig(modelId)
  }
}

/**
 * Create an AI Gateway client instance
 */
export function createAIGatewayClient(env: AIGatewayEnv): AIGatewayClient {
  return new AIGatewayClient(env)
}
