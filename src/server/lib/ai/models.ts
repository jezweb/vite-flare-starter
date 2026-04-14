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
  'claude-opus-4-6-fast': {
    id: 'claude-opus-4-6-fast',
    displayName: 'Claude Opus 4.6',
    provider: 'anthropic',
    contextWindow: 1000000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: true,
    defaultMaxTokens: 8192,
    description: 'Anthropic Claude Opus 4.6 (fast) — 1M context flagship. Requires ANTHROPIC_API_KEY.',
    tier: 'flagship',
  },
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    contextWindow: 1000000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: true,
    defaultMaxTokens: 8192,
    description: 'Anthropic Claude Sonnet 4.6 — 1M context, balanced flagship. Requires ANTHROPIC_API_KEY.',
    tier: 'flagship',
  },
  'claude-haiku-4-5': {
    id: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: true,
    defaultMaxTokens: 8192,
    description: 'Anthropic Claude Haiku 4.5 — fast + cheap, 200K context. Requires ANTHROPIC_API_KEY.',
    tier: 'fast',
  },

  // ─── OpenAI (requires OPENAI_API_KEY) ───────────────────────────────────
  'gpt-5.4-pro': {
    id: 'gpt-5.4-pro',
    displayName: 'GPT-5.4 Pro',
    provider: 'openai',
    contextWindow: 1100000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: true,
    defaultMaxTokens: 8192,
    description: 'OpenAI GPT-5.4 Pro — 1.1M context multimodal flagship. Requires OPENAI_API_KEY.',
    tier: 'flagship',
  },
  'gpt-5.4-mini': {
    id: 'gpt-5.4-mini',
    displayName: 'GPT-5.4 mini',
    provider: 'openai',
    contextWindow: 400000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: false,
    defaultMaxTokens: 8192,
    description: 'OpenAI GPT-5.4 mini — fast + cheap, 400K context. Requires OPENAI_API_KEY.',
    tier: 'fast',
  },

  // ─── Google Gemini (requires GOOGLE_AI_API_KEY) ─────────────────────────
  'gemini-3.1-pro-preview': {
    id: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro',
    provider: 'google',
    contextWindow: 1000000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: true,
    defaultMaxTokens: 8192,
    description: 'Google Gemini 3.1 Pro (preview) — 1M context flagship, vision + PDF. Requires GOOGLE_AI_API_KEY.',
    tier: 'flagship',
  },
  'gemini-3.1-flash-lite-preview': {
    id: 'gemini-3.1-flash-lite-preview',
    displayName: 'Gemini 3.1 Flash Lite',
    provider: 'google',
    contextWindow: 1000000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: false,
    defaultMaxTokens: 8192,
    description: 'Google Gemini 3.1 Flash Lite (preview) — fast, 1M context. Requires GOOGLE_AI_API_KEY.',
    tier: 'fast',
  },
}

export const DEFAULT_MODEL: ModelId = '@cf/moonshotai/kimi-k2.5'

export const ALIAS_TO_MODEL_ID: Record<string, ModelId> = {
  kimi: '@cf/moonshotai/kimi-k2.5',
  gemma: '@cf/google/gemma-4-26b-a4b-it',
  glm: '@cf/zai-org/glm-4.7-flash',
  qwq: '@cf/qwen/qwq-32b',
  opus: 'claude-opus-4-6-fast',
  claude: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
  gpt: 'gpt-5.4-pro',
  'gpt-mini': 'gpt-5.4-mini',
  gemini: 'gemini-3.1-pro-preview',
  'gemini-flash': 'gemini-3.1-flash-lite-preview',
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
