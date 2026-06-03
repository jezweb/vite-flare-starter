/**
 * Workers AI Module - Type Definitions
 *
 * Type-safe interfaces for the model registry.
 * AI SDK handles its own types for generation/streaming.
 */

/**
 * Model ID - any string identifier
 *
 * Conventions:
 * - @cf/vendor/model-name → Workers AI (free)
 * - @hf/vendor/model-name → Workers AI via HuggingFace (free)
 */
export type ModelId = string

/**
 * API format used by the model
 * - 'standard': Uses { messages } array
 * - 'responses': Uses { instructions, input } (OpenAI Responses API)
 */
export type APIFormat = 'standard' | 'responses'

/**
 * Model capability tier - used for sorting and display
 */
export type ModelTier = 'flagship' | 'reasoning' | 'balanced' | 'fast'

/**
 * Model configuration metadata
 */
export interface ModelConfig {
  /** Full Workers AI model ID */
  id: ModelId
  /** Human-readable display name for UI */
  displayName: string
  /** Model provider */
  provider:
    | 'meta'
    | 'qwen'
    | 'google'
    | 'openai'
    | 'nous'
    | 'ibm'
    | 'mistral'
    | 'moonshot'
    | 'nvidia'
    | 'zhipu'
    | 'anthropic'
  /** Maximum context window in tokens */
  contextWindow: number
  /** Whether the model outputs <think> tokens */
  isReasoning: boolean
  /** Whether streaming is supported */
  supportsStreaming: boolean
  /** Whether the model supports function/tool calling */
  supportsTools: boolean
  /** Whether the model supports vision/image input */
  supportsVision: boolean
  /** Whether the model supports PDF input */
  supportsPdf: boolean
  /** Default max tokens for this model */
  defaultMaxTokens: number
  /** Human-readable description */
  description: string
  /** API format (defaults to 'standard') */
  apiFormat?: APIFormat
  /** Capability tier for sorting and display */
  tier: ModelTier
  /**
   * Cost tier derived from input-token pricing. Drives the tiny pricing
   * indicator on the UI model-picker trigger (1–3 dots, or none for free).
   * - free: no inference cost (Workers AI)
   * - low: ≤ $1 per million input tokens
   * - mid: > $1 and ≤ $5 per million input tokens
   * - high: > $5 per million input tokens
   */
  costTier: 'free' | 'low' | 'mid' | 'high'
}
