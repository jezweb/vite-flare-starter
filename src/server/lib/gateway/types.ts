/**
 * AI Gateway Types
 *
 * Type definitions for external AI providers via Cloudflare AI Gateway.
 * Supports all providers configured in AI Gateway with stored keys (BYOK).
 */

/**
 * Supported external AI providers
 * These match the provider keys in AI Gateway
 */
export type ExternalProvider =
  | 'openai'
  | 'anthropic'
  | 'google-ai-studio'
  | 'groq'
  | 'mistral'
  | 'deepseek'
  | 'perplexity'
  | 'grok'
  | 'huggingface'
  | 'openrouter'

/**
 * External provider configuration
 */
export interface ExternalProviderConfig {
  /** Provider identifier */
  provider: ExternalProvider
  /** Display name */
  name: string
  /** Whether keys are stored in AI Gateway */
  hasStoredKeys?: boolean
  /** Available models */
  models: ExternalModelConfig[]
}

/**
 * External model configuration
 */
export interface ExternalModelConfig {
  /** Model ID as used in API calls */
  id: string
  /** Display name */
  name: string
  /** Context window in tokens */
  contextWindow: number
  /** Max output tokens */
  maxOutputTokens: number
  /** Whether it supports streaming */
  supportsStreaming: boolean
  /** Whether it supports vision/image input */
  supportsVision?: boolean
  /** Whether it supports PDF input */
  supportsPdf?: boolean
  /** Description */
  description: string
}

/**
 * Gateway client options
 */
export interface GatewayClientOptions {
  /** Model to use */
  model: string
  /** Max tokens to generate */
  maxTokens?: number
  /** Temperature (0-2) */
  temperature?: number
  /** System prompt */
  systemPrompt?: string
}

/**
 * Gateway generation result
 */
export interface GatewayGenerateResult {
  /** Generated response */
  response: string
  /** Provider used */
  provider: ExternalProvider
  /** Model used */
  model: string
  /** Duration in ms */
  durationMs: number
  /** Token usage if available */
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

/**
 * Content part for multimodal messages
 */
export type GatewayContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }  // OpenAI/Workers AI format
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }  // Anthropic format
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }  // Anthropic PDF format
  | { type: 'file'; file: { filename: string; file_data: string } }  // OpenRouter file format (PDFs)

/**
 * Chat message format (OpenAI-compatible)
 */
export interface GatewayChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Multimodal chat message format (for vision-capable models)
 * Content can be a string or an array of content parts (text + images)
 */
export interface GatewayMultimodalMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | GatewayContentPart[]
}

// =============================================================================
// STREAMING TYPES
// =============================================================================

/**
 * Token usage from streaming response
 */
export interface StreamUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

/**
 * Internal streaming chunk format
 *
 * This is the format sent to the client via SSE:
 *   data: {"type":"text","data":"Hello"}
 *   data: {"type":"done","usage":{...}}
 *   data: {"type":"error","error":"..."}
 */
export interface StreamingChunk {
  type: 'text' | 'thinking' | 'done' | 'error' | 'start'
  data?: string
  usage?: StreamUsage
  error?: string
}

// =============================================================================
// MODEL DETECTION HELPERS
// =============================================================================

/**
 * Check if a model ID represents an external (non-Workers AI) model
 *
 * External models use the format: "provider/model-name"
 * Workers AI models use: "@cf/vendor/model-name"
 *
 * @example
 * isExternalModel('openai/gpt-4o-mini')  // true
 * isExternalModel('anthropic/claude-3-5-sonnet-20241022')  // true
 * isExternalModel('@cf/meta/llama-3.1-8b-instruct')  // false
 * isExternalModel('llama-8b')  // false (Workers AI alias)
 */
export function isExternalModel(modelId: string): boolean {
  // Workers AI models start with @cf/ or are short aliases
  if (modelId.startsWith('@cf/')) return false

  // External models contain provider/model format (but not @cf)
  // Must have a / and not start with @
  return modelId.includes('/') && !modelId.startsWith('@')
}

/**
 * Parse an external model ID into provider and model parts
 *
 * @example
 * parseExternalModel('openai/gpt-4o-mini')
 * // { provider: 'openai', model: 'gpt-4o-mini' }
 *
 * parseExternalModel('anthropic/claude-3-5-sonnet-20241022')
 * // { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' }
 */
export function parseExternalModel(modelId: string): {
  provider: ExternalProvider
  model: string
} | null {
  if (!isExternalModel(modelId)) return null

  const slashIndex = modelId.indexOf('/')
  if (slashIndex === -1) return null

  return {
    provider: modelId.slice(0, slashIndex) as ExternalProvider,
    model: modelId.slice(slashIndex + 1),
  }
}
