/**
 * AI Model Registry — curated + live from flared.au
 *
 * Fork-users edit `src/shared/config/models.ts` to add or remove models.
 * Model metadata (context window, pricing, capability tags) is pulled from
 * a bundled snapshot of https://models.flared.au/json, which you can refresh
 * with `pnpm models:refresh` whenever new models ship.
 *
 * Model IDs:
 * - `@cf/...`   → Workers AI (free, no key)
 * - `provider/model` (e.g. `anthropic/claude-sonnet-4.6`) → OpenRouter
 *   (requires OPENROUTER_API_KEY)
 */
import type { ModelId, ModelConfig, ModelTier } from './types'
import {
  ENABLED_MODEL_IDS,
  DEFAULT_MODEL_ID,
  WORKERS_AI_MODELS,
  OPENROUTER_MODELS,
  type CatalogueModel,
} from '@/shared/config/models'
import snapshot from '@/shared/data/models-snapshot.json'

interface Snapshot {
  updated: string
  total: number
  models: CatalogueModel[]
}

const CATALOGUE = new Map(
  (snapshot as Snapshot).models.map((m) => [m.id, m] as const),
)

/** Workers AI model metadata — the one thing flared.au doesn't yet cover. */
const WORKERS_AI_CONFIGS: Record<string, ModelConfig> = {
  '@cf/moonshotai/kimi-k2.5': {
    id: '@cf/moonshotai/kimi-k2.5',
    displayName: 'Kimi K2.5',
    provider: 'moonshot',
    contextWindow: 128_000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 4096,
    description: 'Moonshot AI Kimi K2.5 — 1T-param flagship. Free via Workers AI.',
    tier: 'flagship',
  },
  '@cf/google/gemma-4-26b-a4b-it': {
    id: '@cf/google/gemma-4-26b-a4b-it',
    displayName: 'Gemma 4 26B',
    provider: 'google',
    contextWindow: 128_000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsPdf: false,
    defaultMaxTokens: 4096,
    description: 'Google Gemma 4 with vision. Free via Workers AI.',
    tier: 'balanced',
  },
  '@cf/zai-org/glm-4.7-flash': {
    id: '@cf/zai-org/glm-4.7-flash',
    displayName: 'GLM 4.7 Flash',
    provider: 'zhipu',
    contextWindow: 128_000,
    isReasoning: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 4096,
    description: 'Z.AI GLM 4.7 Flash — fast tool-capable. Free via Workers AI.',
    tier: 'fast',
  },
  '@cf/qwen/qwq-32b': {
    id: '@cf/qwen/qwq-32b',
    displayName: 'QwQ 32B',
    provider: 'qwen',
    contextWindow: 32_768,
    isReasoning: true,
    supportsStreaming: true,
    supportsTools: false,
    supportsVision: false,
    supportsPdf: false,
    defaultMaxTokens: 4096,
    description: 'Qwen QwQ 32B reasoning model. Free via Workers AI.',
    tier: 'reasoning',
  },
}

/** Convert a CatalogueModel (from flared.au) into our ModelConfig shape. */
function fromCatalogue(m: CatalogueModel): ModelConfig {
  const supportsVision = m.modality.includes('image')
  const priceIn = m.pricing?.input ?? 0
  // Cheap heuristic tiers while we wait for flared.au to expose them explicitly.
  let tier: ModelTier = 'balanced'
  if (m.flagship && priceIn >= 2) tier = 'flagship'
  else if (priceIn < 0.3) tier = 'fast'
  return {
    id: m.id,
    displayName: m.name.replace(/^.*?: /, ''),
    provider: (m.provider as ModelConfig['provider']) ?? 'openai',
    contextWindow: m.context_length,
    isReasoning: /reason|think|r1|o1|o3|qwq/i.test(m.id),
    supportsStreaming: true,
    supportsTools: true,
    supportsVision,
    supportsPdf: false,
    defaultMaxTokens: Math.min(m.max_output ?? 4096, 8192),
    description:
      `${m.name} — ${(m.context_length / 1000).toFixed(0)}K ctx` +
      (priceIn > 0 ? `, $${priceIn.toFixed(2)}/M in` : ''),
    tier,
  }
}

/** Materialise the enabled registry once at module load. */
export const MODEL_REGISTRY: Record<string, ModelConfig> = (() => {
  const out: Record<string, ModelConfig> = {}
  for (const id of ENABLED_MODEL_IDS) {
    if (id.startsWith('@cf/') || id.startsWith('@hf/')) {
      const cfg = WORKERS_AI_CONFIGS[id]
      if (cfg) out[id] = cfg
      continue
    }
    const cat = CATALOGUE.get(id)
    if (cat) out[id] = fromCatalogue(cat)
    else {
      // Enabled but not in snapshot — keep a stub so selection still works.
      out[id] = {
        id,
        displayName: id.split('/').pop() ?? id,
        provider: (id.split('/')[0] as ModelConfig['provider']) ?? 'openai',
        contextWindow: 128_000,
        isReasoning: false,
        supportsStreaming: true,
        supportsTools: true,
        supportsVision: false,
        supportsPdf: false,
        defaultMaxTokens: 4096,
        description: `${id} (not in catalogue — run pnpm models:refresh)`,
        tier: 'balanced',
      }
    }
  }
  return out
})()

export const DEFAULT_MODEL: ModelId = DEFAULT_MODEL_ID

/** Shortcut aliases for use in URLs / tool calls. Extend freely. */
export const ALIAS_TO_MODEL_ID: Record<string, ModelId> = {
  kimi: '@cf/moonshotai/kimi-k2.5',
  gemma: '@cf/google/gemma-4-26b-a4b-it',
  glm: '@cf/zai-org/glm-4.7-flash',
  qwq: '@cf/qwen/qwq-32b',
  opus: 'anthropic/claude-opus-4.6',
  sonnet: 'anthropic/claude-sonnet-4.6',
  haiku: 'anthropic/claude-haiku-4.5',
  gpt: 'openai/gpt-5.4',
  'gpt-mini': 'openai/gpt-5.4-mini',
  gemini: 'google/gemini-3.1-pro-preview',
  'gemini-flash': 'google/gemini-3-flash-preview',
  deepseek: 'deepseek/deepseek-v3.2-speciale',
  qwen: 'qwen/qwen3.6-plus',
  grok: 'x-ai/grok-4.1-fast',
  mistral: 'mistralai/mistral-large-2512',
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

export function getRecommendedModel(
  useCase: 'general' | 'fast' | 'reasoning' | 'vision' | 'tools',
): ModelId {
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

// Re-exports so consumers don't need to know about the config file.
export { WORKERS_AI_MODELS, OPENROUTER_MODELS }
