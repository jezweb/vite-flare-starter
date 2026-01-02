/**
 * AI Provider Registry
 *
 * Defines available AI providers and models for use via AI Gateway.
 * All providers use the same Compat endpoint - one code path for everything.
 *
 * - Workers AI: Free edge models (no API key needed)
 * - External: Via AI Gateway with BYOK (API keys in Cloudflare dashboard)
 *
 * @see https://developers.cloudflare.com/ai-gateway/
 */

import type { ModelTier } from './types'

/**
 * Provider information
 */
export interface ProviderInfo {
  name: string
  description: string
  models: string[]
  requiresApiKey: boolean
}

/**
 * Model metadata for display and capabilities
 */
export interface ProviderModelConfig {
  id: string
  displayName: string
  provider: string
  contextWindow: number
  isReasoning: boolean
  supportsStreaming: boolean
  supportsTools: boolean
  supportsVision: boolean
  defaultMaxTokens: number
  description: string
  tier: ModelTier
}

/**
 * Available AI providers
 *
 * Workers AI models use @cf/ prefix and run on the edge for free.
 * External providers require API keys configured in AI Gateway dashboard.
 */
export const PROVIDERS: Record<string, ProviderInfo> = {
  // Workers AI - Free edge models (no API key needed)
  'workers-ai': {
    name: 'Cloudflare Workers AI',
    description: 'Free edge AI models running on Cloudflare network',
    requiresApiKey: false,
    models: [
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/meta/llama-3.1-8b-instruct',
      '@cf/meta/llama-3.1-8b-instruct-fast',
      '@cf/meta/llama-3.2-3b-instruct',
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      '@cf/qwen/qwq-32b',
      '@cf/qwen/qwen2.5-coder-32b-instruct',
      '@cf/qwen/qwen3-30b-a3b-fp8',
      '@cf/google/gemma-3-12b-it',
      '@hf/nousresearch/hermes-2-pro-mistral-7b',
      '@cf/ibm/granite-4.0-h-micro',
    ],
  },

  // External providers via AI Gateway (require BYOK setup)
  openai: {
    name: 'OpenAI',
    description: 'GPT models via AI Gateway',
    requiresApiKey: true,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'],
  },

  anthropic: {
    name: 'Anthropic',
    description: 'Claude models via AI Gateway',
    requiresApiKey: true,
    models: [
      'claude-sonnet-4-5-20250929',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
    ],
  },

  'google-ai-studio': {
    name: 'Google AI Studio',
    description: 'Gemini models via AI Gateway',
    requiresApiKey: true,
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  },

  groq: {
    name: 'Groq',
    description: 'Fast inference via AI Gateway',
    requiresApiKey: true,
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  },

  mistral: {
    name: 'Mistral AI',
    description: 'Mistral models via AI Gateway',
    requiresApiKey: true,
    models: ['mistral-large-latest', 'mistral-small-latest'],
  },

  deepseek: {
    name: 'DeepSeek',
    description: 'DeepSeek models via AI Gateway',
    requiresApiKey: true,
    models: ['deepseek-chat', 'deepseek-coder'],
  },

  cohere: {
    name: 'Cohere',
    description: 'Cohere models via AI Gateway',
    requiresApiKey: true,
    models: ['command-r-plus', 'command-r'],
  },

  grok: {
    name: 'xAI (Grok)',
    description: 'Grok models via AI Gateway',
    requiresApiKey: true,
    models: ['grok-2', 'grok-2-mini'],
  },
}

/**
 * Model metadata for UI display and capability checking
 * Keys are the model IDs that work with AI Gateway
 */
export const MODEL_CONFIGS: Record<string, ProviderModelConfig> = {
  // Workers AI - Free edge models
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': {
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    displayName: 'Llama 3.3 70B',
    provider: 'workers-ai',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    defaultMaxTokens: 2000,
    description: 'High quality with tool calling support',
    tier: 'flagship',
  },
  '@cf/meta/llama-3.1-8b-instruct': {
    id: '@cf/meta/llama-3.1-8b-instruct',
    displayName: 'Llama 3.1 8B',
    provider: 'workers-ai',
    contextWindow: 7968,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    defaultMaxTokens: 1000,
    description: 'General purpose, stable production model',
    tier: 'balanced',
  },
  '@cf/meta/llama-3.1-8b-instruct-fast': {
    id: '@cf/meta/llama-3.1-8b-instruct-fast',
    displayName: 'Llama 3.1 8B Fast',
    provider: 'workers-ai',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    defaultMaxTokens: 1000,
    description: 'Large context, optimized for speed',
    tier: 'balanced',
  },
  '@cf/meta/llama-3.2-3b-instruct': {
    id: '@cf/meta/llama-3.2-3b-instruct',
    displayName: 'Llama 3.2 3B',
    provider: 'workers-ai',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    defaultMaxTokens: 500,
    description: 'Budget-friendly, quick tasks',
    tier: 'fast',
  },
  '@cf/meta/llama-4-scout-17b-16e-instruct': {
    id: '@cf/meta/llama-4-scout-17b-16e-instruct',
    displayName: 'Llama 4 Scout 17B',
    provider: 'workers-ai',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    defaultMaxTokens: 2000,
    description: 'Llama 4 Scout - multimodal with tool calling',
    tier: 'balanced',
  },
  '@cf/qwen/qwq-32b': {
    id: '@cf/qwen/qwq-32b',
    displayName: 'QwQ 32B',
    provider: 'workers-ai',
    contextWindow: 24000,
    isReasoning: true,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    defaultMaxTokens: 2000,
    description: 'Step-by-step reasoning with thinking tokens',
    tier: 'reasoning',
  },
  '@cf/qwen/qwen2.5-coder-32b-instruct': {
    id: '@cf/qwen/qwen2.5-coder-32b-instruct',
    displayName: 'Qwen 2.5 Coder 32B',
    provider: 'workers-ai',
    contextWindow: 32000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    defaultMaxTokens: 2000,
    description: 'State-of-the-art code generation',
    tier: 'balanced',
  },
  '@cf/qwen/qwen3-30b-a3b-fp8': {
    id: '@cf/qwen/qwen3-30b-a3b-fp8',
    displayName: 'Qwen 3 30B',
    provider: 'workers-ai',
    contextWindow: 32000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    defaultMaxTokens: 2000,
    description: 'Qwen 3 with function calling',
    tier: 'balanced',
  },
  '@cf/google/gemma-3-12b-it': {
    id: '@cf/google/gemma-3-12b-it',
    displayName: 'Gemma 3 12B',
    provider: 'workers-ai',
    contextWindow: 80000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: true,
    defaultMaxTokens: 1000,
    description: 'Multilingual (140+ languages), vision-capable',
    tier: 'balanced',
  },
  '@hf/nousresearch/hermes-2-pro-mistral-7b': {
    id: '@hf/nousresearch/hermes-2-pro-mistral-7b',
    displayName: 'Hermes 2 Pro 7B',
    provider: 'workers-ai',
    contextWindow: 8000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    defaultMaxTokens: 1000,
    description: 'Hermes 2 Pro - optimized for tool use',
    tier: 'fast',
  },
  '@cf/ibm/granite-4.0-h-micro': {
    id: '@cf/ibm/granite-4.0-h-micro',
    displayName: 'Granite 4.0 Micro',
    provider: 'workers-ai',
    contextWindow: 8000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    defaultMaxTokens: 1000,
    description: 'IBM Granite - compact with tool calling',
    tier: 'fast',
  },

  // OpenAI models
  'gpt-4o': {
    id: 'gpt-4o',
    displayName: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    defaultMaxTokens: 4096,
    description: 'OpenAI flagship multimodal model',
    tier: 'flagship',
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    defaultMaxTokens: 4096,
    description: 'Fast and affordable OpenAI model',
    tier: 'fast',
  },

  // Anthropic models
  'claude-sonnet-4-5-20250929': {
    id: 'claude-sonnet-4-5-20250929',
    displayName: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    contextWindow: 200000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    defaultMaxTokens: 8192,
    description: 'Latest Claude with extended thinking',
    tier: 'flagship',
  },
  'claude-3-5-sonnet-20241022': {
    id: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    defaultMaxTokens: 8192,
    description: 'Balanced Claude model',
    tier: 'balanced',
  },

  // Google models
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    provider: 'google-ai-studio',
    contextWindow: 1000000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    defaultMaxTokens: 8192,
    description: 'Fast Gemini with massive context',
    tier: 'fast',
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    provider: 'google-ai-studio',
    contextWindow: 1000000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    defaultMaxTokens: 8192,
    description: 'Google flagship with 1M context',
    tier: 'flagship',
  },

  // Groq models
  'llama-3.3-70b-versatile': {
    id: 'llama-3.3-70b-versatile',
    displayName: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    defaultMaxTokens: 4096,
    description: 'Llama 3.3 with ultra-fast Groq inference',
    tier: 'flagship',
  },
}

/**
 * Models that support tool calling / function calling
 */
export const TOOL_CAPABLE_MODELS: string[] = [
  // Workers AI
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@hf/nousresearch/hermes-2-pro-mistral-7b',
  '@cf/ibm/granite-4.0-h-micro',
  // OpenAI
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  // Anthropic
  'claude-sonnet-4-5-20250929',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  // Google
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  // Groq
  'llama-3.3-70b-versatile',
  // Mistral
  'mistral-large-latest',
  'mistral-small-latest',
  // DeepSeek
  'deepseek-chat',
  // Cohere
  'command-r-plus',
  'command-r',
  // xAI
  'grok-2',
  'grok-2-mini',
]

/**
 * Default model (free Workers AI)
 */
export const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct'

/**
 * Default models by provider
 */
export const DEFAULT_MODELS: Record<string, string> = {
  'workers-ai': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5-20250929',
  'google-ai-studio': 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  mistral: 'mistral-large-latest',
  deepseek: 'deepseek-chat',
  cohere: 'command-r-plus',
  grok: 'grok-2',
}

/**
 * Parse a model ID to extract provider and model name
 *
 * Conventions:
 * - @cf/vendor/model-name → Workers AI (provider: workers-ai)
 * - @hf/vendor/model-name → Workers AI via HuggingFace (provider: workers-ai)
 * - provider/model-name → External via AI Gateway
 * - Just model-name → Assumes openai
 */
export function parseModelId(modelId: string): { provider: string; model: string } {
  // Workers AI models
  if (modelId.startsWith('@cf/') || modelId.startsWith('@hf/')) {
    return { provider: 'workers-ai', model: modelId }
  }

  // External provider format: provider/model
  if (modelId.includes('/')) {
    const parts = modelId.split('/')
    const provider = parts[0] || 'openai'
    const model = parts.slice(1).join('/')
    return { provider, model }
  }

  // Default to openai for bare model names
  return { provider: 'openai', model: modelId }
}

/**
 * Get model configuration by ID
 */
export function getModelConfig(modelId: string): ProviderModelConfig | undefined {
  return MODEL_CONFIGS[modelId]
}

/**
 * Check if a model supports tool calling
 */
export function supportsTools(modelId: string): boolean {
  return TOOL_CAPABLE_MODELS.includes(modelId)
}

/**
 * Get all available providers
 */
export function getAllProviders(): Array<{ id: string } & ProviderInfo> {
  return Object.entries(PROVIDERS).map(([id, info]) => ({ id, ...info }))
}

/**
 * Get providers that don't require API keys (can be used immediately)
 */
export function getFreeProviders(): Array<{ id: string } & ProviderInfo> {
  return getAllProviders().filter((p) => !p.requiresApiKey)
}

/**
 * List all available models (with metadata where available)
 */
export function listModels(): ProviderModelConfig[] {
  return Object.values(MODEL_CONFIGS)
}

/**
 * Get models that support tool calling
 */
export function getToolCapableModels(): ProviderModelConfig[] {
  return TOOL_CAPABLE_MODELS.map((id) => MODEL_CONFIGS[id]).filter(
    (config): config is ProviderModelConfig => config !== undefined
  )
}
