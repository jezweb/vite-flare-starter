/**
 * AI Model Registry — curated selection
 *
 * 4 Workers AI models (free, no key needed) + 3 external providers
 * (Claude, GPT, Gemini) activated when their API key is set in env.
 *
 * Fork-users can add more models by extending this registry.
 * resolveModel() auto-detects the provider from the model ID prefix.
 */
import type { ModelId, ModelConfig } from './types'

export const MODEL_REGISTRY: Record<string, ModelConfig> = {
  // ─── Workers AI (free, always available) ────────────────────────────────
  '@cf/moonshotai/kimi-k2.5': {
    id: '@cf/moonshotai/kimi-k2.5',
    displayName: 'Kimi K2.5',
    provider: 'moonshot',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 4096,
    description: 'Flagship 1T-param agentic model from Moonshot AI. Best for general chat, tools, reasoning.',
    tier: 'flagship',
  },
  '@cf/google/gemma-4-26b-a4b-it': {
    id: '@cf/google/gemma-4-26b-a4b-it',
    displayName: 'Gemma 4 26B',
    provider: 'google',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: false,
    defaultMaxTokens: 4096,
    description: 'Google Gemma 4 with vision. Strong multilingual performance.',
    tier: 'balanced',
  },
  '@cf/zai-org/glm-4.7-flash': {
    id: '@cf/zai-org/glm-4.7-flash',
    displayName: 'GLM 4.7 Flash',
    provider: 'zhipu',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 4096,
    description: 'Fast, tool-capable model from Zhipu AI. Good for high-throughput agents.',
    tier: 'fast',
  },
  '@cf/qwen/qwq-32b': {
    id: '@cf/qwen/qwq-32b',
    displayName: 'QwQ 32B',
    provider: 'qwen',
    contextWindow: 32768,
    isReasoning: true,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 4096,
    description: 'Reasoning model with step-by-step <think> tokens. Best for complex problems.',
    tier: 'reasoning',
  },

  // ─── Anthropic Claude (requires ANTHROPIC_API_KEY) ─────────────────────
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    contextWindow: 200000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: true,
    defaultMaxTokens: 8192,
    description: 'Anthropic Claude Sonnet 4.6 — balanced flagship. Requires ANTHROPIC_API_KEY.',
    tier: 'flagship',
  },

  // ─── OpenAI (requires OPENAI_API_KEY) ───────────────────────────────────
  'gpt-4o': {
    id: 'gpt-4o',
    displayName: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: false,
    defaultMaxTokens: 4096,
    description: 'OpenAI GPT-4o — multimodal flagship. Requires OPENAI_API_KEY.',
    tier: 'flagship',
  },

  // ─── Google Gemini (requires GOOGLE_AI_API_KEY) ─────────────────────────
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    provider: 'google',
    contextWindow: 1000000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: true,
    defaultMaxTokens: 8192,
    description: 'Google Gemini 2.5 Pro — 1M context, vision + PDF. Requires GOOGLE_AI_API_KEY.',
    tier: 'flagship',
  },
}

export const DEFAULT_MODEL: ModelId = '@cf/moonshotai/kimi-k2.5'

export const ALIAS_TO_MODEL_ID: Record<string, ModelId> = {
  kimi: '@cf/moonshotai/kimi-k2.5',
  gemma: '@cf/google/gemma-4-26b-a4b-it',
  glm: '@cf/zai-org/glm-4.7-flash',
  qwq: '@cf/qwen/qwq-32b',
  claude: 'claude-sonnet-4-6',
  gpt: 'gpt-4o',
  gemini: 'gemini-2.5-pro',
}

export function resolveModelId(alias: string): ModelId {
  return ALIAS_TO_MODEL_ID[alias] ?? alias
}

export function getModel(modelId: ModelId): ModelConfig | undefined {
  return MODEL_REGISTRY[modelId]
}

export function isReasoningModel(modelId: ModelId): boolean {
  return MODEL_REGISTRY[modelId]?.isReasoning ?? false
}

export function getToolCapableModels(): ModelConfig[] {
  return Object.values(MODEL_REGISTRY).filter((m) => m.supportsTools)
}

export function getRecommendedModel(useCase: 'general' | 'fast' | 'reasoning' | 'vision' | 'tools'): ModelId {
  switch (useCase) {
    case 'general':
    case 'tools':
      return '@cf/moonshotai/kimi-k2.5'
    case 'fast':
      return '@cf/zai-org/glm-4.7-flash'
    case 'reasoning':
      return '@cf/qwen/qwq-32b'
    case 'vision':
      return '@cf/google/gemma-4-26b-a4b-it'
  }
}

export function listModels(): ModelConfig[] {
  return Object.values(MODEL_REGISTRY)
}
