/**
 * AI Gateway Client (Unified)
 *
 * Two modes of operation:
 * 1. Binding mode (recommended): Uses env.AI.gateway() binding - no API token needed
 * 2. HTTP mode (legacy): Uses REST API with cf-aig-authorization header
 *
 * @see https://developers.cloudflare.com/ai-gateway/integrations/worker-binding-methods/
 *
 * @example Binding mode (recommended)
 * const gateway = createGatewayClientFromBinding(c.env.AI, 'default')
 * const result = await gateway.generate('Hello!', {
 *   provider: 'openai',
 *   model: 'gpt-4o-mini',
 * })
 *
 * @example HTTP mode (legacy)
 * const gateway = createGatewayClient({
 *   accountId: '...',
 *   gatewayId: 'default',
 *   apiToken: c.env.AI_GATEWAY_TOKEN,
 * })
 */

import type {
  ExternalProvider,
  GatewayClientOptions,
  GatewayGenerateResult,
  GatewayChatMessage,
  GatewayMultimodalMessage,
} from './types'
import { getExternalModel } from './providers'

/**
 * Gateway client configuration (HTTP mode)
 */
export interface GatewayConfig {
  /** Cloudflare account ID */
  accountId: string
  /** AI Gateway ID */
  gatewayId: string
  /** Cloudflare API token with AI Gateway permissions */
  apiToken: string
}

/**
 * Binding-based Gateway client configuration
 */
export interface GatewayBindingConfig {
  /** AI binding from env.AI */
  ai: Ai
  /** Gateway ID (e.g., 'default') */
  gatewayId: string
}

/**
 * OpenAI-compatible chat completion response
 */
interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Unified Gateway client using /compat endpoint
 */
export class GatewayClient {
  private config: GatewayConfig
  private baseUrl: string

  constructor(config: GatewayConfig) {
    this.config = config
    this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}/compat`
  }

  /**
   * Generate text using any supported provider
   */
  async generate(
    prompt: string,
    options: GatewayClientOptions & { provider: ExternalProvider }
  ): Promise<GatewayGenerateResult> {
    const { provider, model, maxTokens, temperature, systemPrompt } = options

    const messages: GatewayChatMessage[] = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    return this.chat(messages, { provider, model, maxTokens, temperature })
  }

  /**
   * Chat with any supported provider
   */
  async chat(
    messages: GatewayChatMessage[],
    options: GatewayClientOptions & { provider: ExternalProvider }
  ): Promise<GatewayGenerateResult> {
    const { provider, model, maxTokens, temperature } = options

    const modelConfig = getExternalModel(provider, model)
    const defaultMaxTokens = modelConfig?.maxOutputTokens || 4096

    const startTime = Date.now()
    const fullModel = `${provider}/${model}`

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-aig-authorization': `Bearer ${this.config.apiToken}`,
      },
      body: JSON.stringify({
        model: fullModel,
        messages,
        max_tokens: maxTokens || defaultMaxTokens,
        temperature: temperature ?? 0.7,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`AI Gateway error (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as ChatCompletionResponse
    const durationMs = Date.now() - startTime

    return {
      response: data.choices[0]?.message?.content || '',
      provider,
      model,
      durationMs,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    }
  }

  /**
   * Stream chat with any supported provider
   */
  async chatStream(
    messages: GatewayChatMessage[],
    options: GatewayClientOptions & { provider: ExternalProvider }
  ): Promise<ReadableStream> {
    const { provider, model, maxTokens, temperature } = options

    const modelConfig = getExternalModel(provider, model)
    const defaultMaxTokens = modelConfig?.maxOutputTokens || 4096
    const fullModel = `${provider}/${model}`

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-aig-authorization': `Bearer ${this.config.apiToken}`,
      },
      body: JSON.stringify({
        model: fullModel,
        messages,
        max_tokens: maxTokens || defaultMaxTokens,
        temperature: temperature ?? 0.7,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`AI Gateway streaming error (${response.status}): ${errorText}`)
    }

    return response.body as ReadableStream
  }

  /**
   * Check if gateway is configured
   */
  isConfigured(): boolean {
    return !!this.config.apiToken
  }
}

/**
 * Create a gateway client instance (HTTP mode)
 */
export function createGatewayClient(config: GatewayConfig): GatewayClient {
  return new GatewayClient(config)
}

/**
 * Binding-based Gateway client using env.AI.gateway()
 *
 * Uses the Workers AI binding to access AI Gateway, which:
 * - Requires no separate API token
 * - Automatically uses BYOK keys stored in AI Gateway
 */
export class GatewayBindingClient {
  private ai: Ai
  private gatewayId: string

  constructor(config: GatewayBindingConfig) {
    this.ai = config.ai
    this.gatewayId = config.gatewayId
  }

  /**
   * Generate text using any supported provider via binding
   */
  async generate(
    prompt: string,
    options: GatewayClientOptions & { provider: ExternalProvider }
  ): Promise<GatewayGenerateResult> {
    const { provider, model, maxTokens, temperature, systemPrompt } = options

    const messages: GatewayChatMessage[] = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    return this.chat(messages, { provider, model, maxTokens, temperature })
  }

  /**
   * Chat with any supported provider via binding
   */
  async chat(
    messages: GatewayChatMessage[],
    options: GatewayClientOptions & { provider: ExternalProvider }
  ): Promise<GatewayGenerateResult> {
    const { provider, model, maxTokens, temperature } = options

    const modelConfig = getExternalModel(provider, model)
    const defaultMaxTokens = modelConfig?.maxOutputTokens || 4096

    const startTime = Date.now()
    const gateway = this.ai.gateway(this.gatewayId)

    const response = await gateway.run({
      provider: provider,
      endpoint: 'chat/completions',
      headers: {},
      query: {
        model: model,
        messages: messages,
        max_tokens: maxTokens || defaultMaxTokens,
        temperature: temperature ?? 0.7,
      },
    })

    const durationMs = Date.now() - startTime

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`AI Gateway error (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as ChatCompletionResponse

    return {
      response: data.choices?.[0]?.message?.content || '',
      provider,
      model,
      durationMs,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    }
  }

  /**
   * Stream chat via binding
   */
  async chatStream(
    messages: GatewayChatMessage[],
    options: GatewayClientOptions & { provider: ExternalProvider }
  ): Promise<ReadableStream> {
    const { provider, model, maxTokens, temperature } = options

    const modelConfig = getExternalModel(provider, model)
    const defaultMaxTokens = modelConfig?.maxOutputTokens || 4096

    const gateway = this.ai.gateway(this.gatewayId)

    const response = await gateway.run({
      provider: provider,
      endpoint: 'chat/completions',
      headers: {},
      query: {
        model: model,
        messages: messages,
        max_tokens: maxTokens || defaultMaxTokens,
        temperature: temperature ?? 0.7,
        stream: true,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`AI Gateway streaming error (${response.status}): ${errorText}`)
    }

    return response.body as ReadableStream
  }

  /**
   * Stream multimodal chat via binding (for vision-capable models)
   */
  async chatMultimodalStream(
    messages: GatewayMultimodalMessage[],
    options: GatewayClientOptions & { provider: ExternalProvider }
  ): Promise<ReadableStream> {
    const { provider, model, maxTokens, temperature } = options

    const modelConfig = getExternalModel(provider, model)
    const defaultMaxTokens = modelConfig?.maxOutputTokens || 4096

    const gateway = this.ai.gateway(this.gatewayId)

    const response = await gateway.run({
      provider: provider,
      endpoint: 'chat/completions',
      headers: {},
      query: {
        model: model,
        messages: messages,
        max_tokens: maxTokens || defaultMaxTokens,
        temperature: temperature ?? 0.7,
        stream: true,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`AI Gateway multimodal streaming error (${response.status}): ${errorText}`)
    }

    return response.body as ReadableStream
  }

  /**
   * Check if binding is available
   */
  isConfigured(): boolean {
    return !!this.ai
  }
}

/**
 * Create a binding-based gateway client (recommended)
 *
 * @example
 * const gateway = createGatewayClientFromBinding(c.env.AI, 'default')
 * const result = await gateway.generate('Hello!', {
 *   provider: 'openai',
 *   model: 'gpt-4o-mini',
 * })
 */
export function createGatewayClientFromBinding(ai: Ai, gatewayId: string): GatewayBindingClient {
  return new GatewayBindingClient({ ai, gatewayId })
}
