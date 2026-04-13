/**
 * Workers AI Model Registry
 *
 * A curated selection of Workers AI models for different use cases.
 * All models are hosted on Cloudflare Workers AI - no external API keys needed.
 *
 * @see https://developers.cloudflare.com/workers-ai/models/
 * @updated 2026-04-13
 */

import type { ModelId, ModelConfig } from './types'

/**
 * Model registry keyed by official Cloudflare Workers AI model IDs.
 *
 * Organised by tier:
 * - Flagship: Best quality, largest models
 * - Balanced: Good quality/speed trade-off, tool-capable
 * - Fast: Lightweight, low latency
 * - Reasoning: Step-by-step thinking with <think> tokens
 */
export const MODEL_REGISTRY: Record<ModelId, ModelConfig> = {
  // ============================================================================
  // FLAGSHIP MODELS — Best quality, largest parameter counts
  // ============================================================================

  '@cf/moonshotai/kimi-k2.5': {
    id: '@cf/moonshotai/kimi-k2.5',
    displayName: 'Kimi K2.5',
    provider: 'moonshot',
    contextWindow: 256000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: false,
    defaultMaxTokens: 4000,
    description: 'Frontier-scale MoE — 256k context, vision, tools, structured output',
    tier: 'flagship',
  },

  '@cf/nvidia/nemotron-3-120b-a12b': {
    id: '@cf/nvidia/nemotron-3-120b-a12b',
    displayName: 'Nemotron 3 Super 120B',
    provider: 'nvidia',
    contextWindow: 128000,
    isReasoning: true,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 4000,
    description: 'NVIDIA hybrid MoE — 120B total, 12B active, multi-agent capable',
    tier: 'flagship',
  },

  '@cf/openai/gpt-oss-120b': {
    id: '@cf/openai/gpt-oss-120b',
    displayName: 'GPT-OSS 120B',
    provider: 'openai',
    contextWindow: 128000,
    isReasoning: true,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 2000,
    description: 'OpenAI open-source flagship with reasoning and tools',
    tier: 'flagship',
  },

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
    description: 'High quality dense model with tool calling',
    tier: 'flagship',
  },

  // ============================================================================
  // BALANCED MODELS — Good quality/speed, most support tools + vision
  // ============================================================================

  '@cf/google/gemma-4-26b-a4b-it': {
    id: '@cf/google/gemma-4-26b-a4b-it',
    displayName: 'Gemma 4 26B',
    provider: 'google',
    contextWindow: 256000,
    isReasoning: true,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: false,
    defaultMaxTokens: 4000,
    description: 'Google MoE — 26B/4B active, 256k context, vision, reasoning, tools',
    tier: 'balanced',
  },

  '@cf/meta/llama-4-scout-17b-16e-instruct': {
    id: '@cf/meta/llama-4-scout-17b-16e-instruct',
    displayName: 'Llama 4 Scout 17B',
    provider: 'meta',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: false,
    defaultMaxTokens: 2000,
    description: 'Meta MoE — multimodal with tool calling, 16 experts',
    tier: 'balanced',
  },

  '@cf/zai-org/glm-4.7-flash': {
    id: '@cf/zai-org/glm-4.7-flash',
    displayName: 'GLM 4.7 Flash',
    provider: 'zhipu',
    contextWindow: 131072,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 2000,
    description: 'Zhipu AI — fast multilingual, optimised for tool calling',
    tier: 'balanced',
  },

  '@cf/mistralai/mistral-small-3.1-24b-instruct': {
    id: '@cf/mistralai/mistral-small-3.1-24b-instruct',
    displayName: 'Mistral Small 3.1 24B',
    provider: 'mistral',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: false,
    defaultMaxTokens: 2000,
    description: 'Mistral Small — efficient tool calling with vision',
    tier: 'balanced',
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
    description: 'Alibaba MoE — 30B/3B active, function calling',
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
    supportsVision: true,
    supportsPdf: false,
    defaultMaxTokens: 1000,
    description: 'Multilingual (140+ languages), vision-capable',
    tier: 'balanced',
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

  // ============================================================================
  // FAST MODELS — Lightweight, low latency
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
    description: 'General purpose, stable and fast',
    tier: 'fast',
  },

  '@cf/openai/gpt-oss-20b': {
    id: '@cf/openai/gpt-oss-20b',
    displayName: 'GPT-OSS 20B',
    provider: 'openai',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 1000,
    description: 'OpenAI lightweight, lower latency with tools',
    tier: 'fast',
  },

  '@cf/ibm-granite/granite-4.0-h-micro': {
    id: '@cf/ibm-granite/granite-4.0-h-micro',
    displayName: 'Granite 4.0 Micro',
    provider: 'ibm',
    contextWindow: 131000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 1000,
    description: 'IBM Granite — compact with tool calling',
    tier: 'fast',
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
    description: 'Ultra-lightweight, quick tasks',
    tier: 'fast',
  },

  // ============================================================================
  // REASONING MODELS — Step-by-step thinking with <think> tokens
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
    description: 'Dedicated reasoning with thinking tokens',
    tier: 'reasoning',
  },
} as const

/**
 * Default model — Kimi K2.5 is the most capable all-rounder
 * (256k context, tools, vision, structured output)
 */
export const DEFAULT_MODEL: ModelId = '@cf/moonshotai/kimi-k2.5'

/**
 * Alias to ModelId mapping for convenience
 */
export const ALIAS_TO_MODEL_ID: Record<string, ModelId> = {
  // Flagships
  'kimi': '@cf/moonshotai/kimi-k2.5',
  'nemotron': '@cf/nvidia/nemotron-3-120b-a12b',
  'gpt-oss': '@cf/openai/gpt-oss-120b',
  'llama-70b': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  // Balanced
  'gemma-4': '@cf/google/gemma-4-26b-a4b-it',
  'llama-scout': '@cf/meta/llama-4-scout-17b-16e-instruct',
  'glm': '@cf/zai-org/glm-4.7-flash',
  'mistral-small': '@cf/mistralai/mistral-small-3.1-24b-instruct',
  'qwen-30b': '@cf/qwen/qwen3-30b-a3b-fp8',
  'gemma-3': '@cf/google/gemma-3-12b-it',
  'qwen-coder': '@cf/qwen/qwen2.5-coder-32b-instruct',
  // Fast
  'llama-8b': '@cf/meta/llama-3.1-8b-instruct',
  'gpt-oss-20b': '@cf/openai/gpt-oss-20b',
  'granite': '@cf/ibm-granite/granite-4.0-h-micro',
  'llama-3b': '@cf/meta/llama-3.2-3b-instruct',
  // Reasoning
  'qwq': '@cf/qwen/qwq-32b',
}

/**
 * Resolve a model ID or alias to a valid ModelId
 */
export function resolveModelId(modelOrAlias: string): ModelId {
  if (modelOrAlias in MODEL_REGISTRY) {
    return modelOrAlias as ModelId
  }
  const aliasResult = ALIAS_TO_MODEL_ID[modelOrAlias]
  if (aliasResult) {
    return aliasResult
  }
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
    | 'vision'
): ModelId {
  switch (useCase) {
    case 'general':
      return '@cf/moonshotai/kimi-k2.5'
    case 'fast':
      return '@cf/meta/llama-3.1-8b-instruct'
    case 'cheap':
      return '@cf/meta/llama-3.2-3b-instruct'
    case 'quality':
      return '@cf/moonshotai/kimi-k2.5'
    case 'reasoning':
      return '@cf/nvidia/nemotron-3-120b-a12b'
    case 'code':
      return '@cf/qwen/qwen2.5-coder-32b-instruct'
    case 'multilingual':
      return '@cf/google/gemma-4-26b-a4b-it'
    case 'tools':
      return '@cf/moonshotai/kimi-k2.5'
    case 'tools-fast':
      return '@cf/zai-org/glm-4.7-flash'
    case 'vision':
      return '@cf/google/gemma-4-26b-a4b-it'
  }
}

/**
 * List all available models
 */
export function listModels(): ModelConfig[] {
  return Object.values(MODEL_REGISTRY)
}
