/**
 * Workers AI Model Registry
 *
 * A curated selection of stable Workers AI models for different use cases.
 * All models are hosted on Cloudflare Workers AI - no external API keys needed.
 *
 * @see https://developers.cloudflare.com/workers-ai/models/
 */

import type { ModelId, ModelConfig } from './types'

/**
 * Model registry with curated, stable models
 *
 * Keys are the official Cloudflare Workers AI model IDs.
 * This provides universal compatibility with OpenRouter and other providers.
 *
 * Models are organized by:
 * - General Purpose: Everyday tasks, balanced performance
 * - Tool-Capable: Support function/tool calling for agents
 * - Specialized: Reasoning, coding, multilingual
 * - OpenAI GPT-OSS: Production quality with Responses API
 */
export const MODEL_REGISTRY: Record<ModelId, ModelConfig> = {
  // ============================================================================
  // GENERAL PURPOSE MODELS
  // ============================================================================

  '@cf/meta/llama-3.1-8b-instruct': {
    id: '@cf/meta/llama-3.1-8b-instruct',
    displayName: 'Llama 3.1 8B',
    provider: 'meta',
    contextWindow: 7968,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 1000,
    description: 'General purpose, stable production model',
    tier: 'balanced',
  },

  '@cf/meta/llama-3.1-8b-instruct-fast': {
    id: '@cf/meta/llama-3.1-8b-instruct-fast',
    displayName: 'Llama 3.1 8B Fast',
    provider: 'meta',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 1000,
    description: 'Large context, optimized for speed',
    tier: 'balanced',
  },

  '@cf/meta/llama-3.2-3b-instruct': {
    id: '@cf/meta/llama-3.2-3b-instruct',
    displayName: 'Llama 3.2 3B',
    provider: 'meta',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 500,
    description: 'Budget-friendly, quick tasks',
    tier: 'fast',
  },

  // ============================================================================
  // TOOL-CAPABLE MODELS (Function Calling Support)
  // ============================================================================

  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': {
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    displayName: 'Llama 3.3 70B',
    provider: 'meta',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 2000,
    description: 'High quality with tool calling support',
    tier: 'flagship',
  },

  '@cf/meta/llama-4-scout-17b-16e-instruct': {
    id: '@cf/meta/llama-4-scout-17b-16e-instruct',
    displayName: 'Llama 4 Scout 17B',
    provider: 'meta',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true, // Natively multimodal
    supportsPdf: false,
    defaultMaxTokens: 2000,
    description: 'Llama 4 Scout - multimodal with tool calling',
    tier: 'balanced',
  },

  '@hf/nousresearch/hermes-2-pro-mistral-7b': {
    id: '@hf/nousresearch/hermes-2-pro-mistral-7b',
    displayName: 'Hermes 2 Pro 7B',
    provider: 'nous',
    contextWindow: 8000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 1000,
    description: 'Hermes 2 Pro - optimized for tool use',
    tier: 'fast',
  },

  '@cf/qwen/qwen3-30b-a3b-fp8': {
    id: '@cf/qwen/qwen3-30b-a3b-fp8',
    displayName: 'Qwen 3 30B',
    provider: 'qwen',
    contextWindow: 32000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 2000,
    description: 'Qwen 3 with function calling',
    tier: 'balanced',
  },

  '@cf/ibm/granite-4.0-h-micro': {
    id: '@cf/ibm/granite-4.0-h-micro',
    displayName: 'Granite 4.0 Micro',
    provider: 'ibm',
    contextWindow: 8000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 1000,
    description: 'IBM Granite - compact with tool calling',
    tier: 'fast',
  },

  // ============================================================================
  // SPECIALIZED MODELS
  // ============================================================================

  '@cf/qwen/qwq-32b': {
    id: '@cf/qwen/qwq-32b',
    displayName: 'QwQ 32B',
    provider: 'qwen',
    contextWindow: 24000,
    isReasoning: true,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 2000,
    description: 'Step-by-step reasoning with thinking tokens',
    tier: 'reasoning',
  },

  '@cf/qwen/qwen2.5-coder-32b-instruct': {
    id: '@cf/qwen/qwen2.5-coder-32b-instruct',
    displayName: 'Qwen 2.5 Coder 32B',
    provider: 'qwen',
    contextWindow: 32000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 2000,
    description: 'State-of-the-art code generation',
    tier: 'balanced',
  },

  '@cf/google/gemma-3-12b-it': {
    id: '@cf/google/gemma-3-12b-it',
    displayName: 'Gemma 3 12B',
    provider: 'google',
    contextWindow: 80000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: true, // Gemma 3 supports vision
    supportsPdf: false,
    defaultMaxTokens: 1000,
    description: 'Multilingual (140+ languages), vision-capable',
    tier: 'balanced',
  },

  // ============================================================================
  // OPENAI GPT-OSS MODELS (Responses API format)
  // ============================================================================

  '@cf/openai/gpt-oss-120b': {
    id: '@cf/openai/gpt-oss-120b',
    displayName: 'GPT-OSS 120B',
    provider: 'openai',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: false, // Streaming broken for Responses API models
    supportsTools: false,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 2000,
    description: 'OpenAI flagship, production quality',
    apiFormat: 'responses',
    tier: 'flagship',
  },

  '@cf/openai/gpt-oss-20b': {
    id: '@cf/openai/gpt-oss-20b',
    displayName: 'GPT-OSS 20B',
    provider: 'openai',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: false, // Streaming broken for Responses API models
    supportsTools: false,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 1000,
    description: 'OpenAI lightweight, lower latency',
    apiFormat: 'responses',
    tier: 'balanced',
  },
} as const

/**
 * Default model for general use
 */
export const DEFAULT_MODEL: ModelId = '@cf/meta/llama-3.1-8b-instruct'

/**
 * Alias to ModelId mapping for backwards compatibility
 * Maps old alias names to new model IDs
 */
export const ALIAS_TO_MODEL_ID: Record<string, ModelId> = {
  'llama-8b': '@cf/meta/llama-3.1-8b-instruct',
  'llama-8b-fast': '@cf/meta/llama-3.1-8b-instruct-fast',
  'llama-3b': '@cf/meta/llama-3.2-3b-instruct',
  'llama-70b': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  'llama-scout': '@cf/meta/llama-4-scout-17b-16e-instruct',
  'qwq-32b': '@cf/qwen/qwq-32b',
  'qwen-coder': '@cf/qwen/qwen2.5-coder-32b-instruct',
  'qwen-30b': '@cf/qwen/qwen3-30b-a3b-fp8',
  'gemma-12b': '@cf/google/gemma-3-12b-it',
  'gpt-oss-120b': '@cf/openai/gpt-oss-120b',
  'gpt-oss-20b': '@cf/openai/gpt-oss-20b',
  'hermes-7b': '@hf/nousresearch/hermes-2-pro-mistral-7b',
  'granite-micro': '@cf/ibm/granite-4.0-h-micro',
}

/**
 * Resolve a model ID or alias to a valid ModelId
 * Handles both new full IDs and legacy aliases
 */
export function resolveModelId(modelOrAlias: string): ModelId {
  // Check if it's already a valid model ID
  if (modelOrAlias in MODEL_REGISTRY) {
    return modelOrAlias as ModelId
  }
  // Check if it's a legacy alias
  const aliasResult = ALIAS_TO_MODEL_ID[modelOrAlias]
  if (aliasResult) {
    return aliasResult
  }
  // Default fallback
  return DEFAULT_MODEL
}

/**
 * Get model configuration by ID
 */
export function getModel(modelId: ModelId): ModelConfig | undefined {
  return MODEL_REGISTRY[modelId as keyof typeof MODEL_REGISTRY]
}

/**
 * Check if a model supports reasoning (thinking tokens)
 */
export function isReasoningModel(modelId: ModelId): boolean {
  const model = MODEL_REGISTRY[modelId as keyof typeof MODEL_REGISTRY]
  return model?.isReasoning ?? false
}

/**
 * Check if a model supports tool/function calling
 * @deprecated Use supportsTools from providers.ts instead
 */
export function supportsToolsLegacy(modelId: ModelId): boolean {
  const model = MODEL_REGISTRY[modelId as keyof typeof MODEL_REGISTRY]
  return model?.supportsTools ?? false
}

/**
 * Get all models that support tool calling
 */
export function getToolCapableModels(): ModelConfig[] {
  return Object.values(MODEL_REGISTRY).filter((m) => m.supportsTools)
}

/**
 * Get recommended model for a use case
 */
export function getRecommendedModel(
  useCase:
    | 'general'
    | 'fast'
    | 'cheap'
    | 'quality'
    | 'reasoning'
    | 'code'
    | 'multilingual'
    | 'tools'
    | 'tools-fast'
    | 'tools-cheap'
): ModelId {
  switch (useCase) {
    case 'general':
      return '@cf/meta/llama-3.1-8b-instruct'
    case 'fast':
      return '@cf/meta/llama-3.1-8b-instruct-fast'
    case 'cheap':
      return '@cf/meta/llama-3.2-3b-instruct'
    case 'quality':
      return '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
    case 'reasoning':
      return '@cf/qwen/qwq-32b'
    case 'code':
      return '@cf/qwen/qwen2.5-coder-32b-instruct'
    case 'multilingual':
      return '@cf/google/gemma-3-12b-it'
    case 'tools':
      return '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
    case 'tools-fast':
      return '@cf/meta/llama-4-scout-17b-16e-instruct'
    case 'tools-cheap':
      return '@hf/nousresearch/hermes-2-pro-mistral-7b'
  }
}

/**
 * List all available models
 */
export function listModels(): ModelConfig[] {
  return Object.values(MODEL_REGISTRY)
}
