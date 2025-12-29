/**
 * Workers AI Module - Type Definitions
 *
 * Type-safe interfaces for the AI abstraction layer.
 */

import type { z } from 'zod'

/**
 * Available Workers AI model IDs for type-safe model selection
 * Uses the official Cloudflare Workers AI model identifiers
 */
export type ModelId =
  // General Purpose
  | '@cf/meta/llama-3.1-8b-instruct'
  | '@cf/meta/llama-3.1-8b-instruct-fast'
  | '@cf/meta/llama-3.2-3b-instruct'
  // Tool-Capable
  | '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  | '@cf/meta/llama-4-scout-17b-16e-instruct'
  | '@hf/nousresearch/hermes-2-pro-mistral-7b'
  | '@cf/qwen/qwen3-30b-a3b-fp8'
  | '@cf/ibm/granite-4.0-h-micro'
  // Specialized
  | '@cf/qwen/qwq-32b'
  | '@cf/qwen/qwen2.5-coder-32b-instruct'
  | '@cf/google/gemma-3-12b-it'
  // OpenAI GPT-OSS
  | '@cf/openai/gpt-oss-120b'
  | '@cf/openai/gpt-oss-20b'

/**
 * @deprecated Use ModelId instead - kept for migration compatibility
 */
export type ModelAlias = ModelId

/**
 * API format used by the model
 * - 'standard': Uses { prompt } or { messages }
 * - 'responses': Uses { instructions, input } (OpenAI Responses API)
 */
export type APIFormat = 'standard' | 'responses'

/**
 * Model capability tier - used for sorting and display
 * Matches the tier system used for external models
 */
export type ModelTier = 'flagship' | 'reasoning' | 'balanced' | 'fast'

/**
 * Model configuration metadata
 */
export interface ModelConfig {
  /** Full Workers AI model ID (e.g., @cf/meta/llama-3.1-8b-instruct) */
  id: ModelId
  /** Human-readable display name for UI (e.g., "Llama 3.1 8B") */
  displayName: string
  /** Model provider (for Workers AI models only) */
  provider: 'meta' | 'qwen' | 'google' | 'openai' | 'nous' | 'ibm'
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
  /** Whether the model supports PDF input (Anthropic/Gemini only) */
  supportsPdf: boolean
  /** Default max tokens for this model */
  defaultMaxTokens: number
  /** Human-readable description */
  description: string
  /** API format (defaults to 'standard') */
  apiFormat?: APIFormat
  /** Capability tier for sorting and display */
  tier: ModelTier
}

/**
 * Options for AI generation methods
 */
export interface AIClientOptions {
  /** Model to use (defaults to '@cf/meta/llama-3.1-8b-instruct') */
  model?: ModelId
  /** Maximum tokens to generate (defaults to model's default) */
  maxTokens?: number
  /** Temperature for randomness (0-2, model default if not specified) */
  temperature?: number
  /** Timeout in milliseconds (defaults to 30000) */
  timeout?: number
  /** Number of retry attempts (defaults to 2) */
  retries?: number
}

/**
 * Token usage information (estimated)
 */
export interface TokenUsage {
  /** Estimated input tokens */
  inputTokens: number
  /** Estimated output tokens */
  outputTokens: number
  /** Total tokens */
  totalTokens: number
}

/**
 * Result from AI generation
 */
export interface GenerateResult {
  /** The generated response text (with thinking removed for reasoning models) */
  response: string
  /** Extracted thinking/reasoning content (for reasoning models) */
  thinking: string | null
  /** The raw unprocessed response */
  raw: string
  /** Model ID that was used */
  model: ModelId
  /** Generation duration in milliseconds */
  durationMs: number
  /** Estimated token usage */
  usage: TokenUsage
}

/**
 * Result from JSON generation with validation
 */
export interface GenerateJSONResult<T> {
  /** Parsed and validated data (null if parsing/validation failed) */
  data: T | null
  /** The raw response from the model */
  raw: string
  /** Extracted thinking content (for reasoning models) */
  thinking: string | null
  /** Model ID that was used */
  model: ModelId
  /** Generation duration in milliseconds */
  durationMs: number
  /** Whether JSON parsing succeeded */
  success: boolean
  /** Error message if parsing/validation failed */
  error?: string
  /** Estimated token usage */
  usage: TokenUsage
}

/**
 * Chat message format (text-only)
 */
export interface ChatMessage {
  /** Role of the message sender */
  role: 'system' | 'user' | 'assistant'
  /** Message content */
  content: string
}

// =============================================================================
// MULTIMODAL TYPES
// =============================================================================

/**
 * Text content part
 */
export interface TextContentPart {
  type: 'text'
  text: string
}

/**
 * Image content part (OpenAI/Workers AI format)
 * Uses base64 data URL: data:image/jpeg;base64,...
 */
export interface ImageUrlContentPart {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'low' | 'high' | 'auto'
  }
}

/**
 * Image content part (Anthropic format)
 */
export interface AnthropicImageContentPart {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
}

/**
 * Document content part (Anthropic format for PDFs)
 */
export interface AnthropicDocumentContentPart {
  type: 'document'
  source: {
    type: 'base64'
    media_type: 'application/pdf'
    data: string
  }
}

/**
 * File content part (OpenRouter format for PDFs and documents)
 * @see https://openrouter.ai/docs/features/pdf-input
 */
export interface OpenRouterFileContentPart {
  type: 'file'
  file: {
    filename: string
    file_data: string // base64 data or URL
  }
}

/**
 * Union of all content part types
 */
export type MessageContentPart =
  | TextContentPart
  | ImageUrlContentPart
  | AnthropicImageContentPart
  | AnthropicDocumentContentPart
  | OpenRouterFileContentPart

/**
 * Multimodal chat message (can have text or array of content parts)
 */
export interface MultimodalMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | MessageContentPart[]
}

/**
 * Provider type for multimodal formatting
 */
export type MultimodalProvider = 'workers-ai' | 'openai' | 'anthropic' | 'google'

/**
 * Attachment data for multimodal messages
 */
export interface AttachmentData {
  id: string
  r2Key: string
  mimeType: string
  filename: string
  size: number
}

/**
 * Internal request parameters for ai.run()
 */
export interface AIRunParams {
  // Standard format
  prompt?: string
  messages?: Array<{ role: string; content: string }>
  // Responses API format (OpenAI GPT-OSS)
  instructions?: string
  input?: string
  // Common options
  max_tokens?: number
  temperature?: number
  stream?: boolean
}

/**
 * Response from Workers AI text generation
 */
export interface AIRunResponse {
  response: string
}

/**
 * Type for Zod schema (generic)
 */
export type ZodSchema<T> = z.ZodType<T>
