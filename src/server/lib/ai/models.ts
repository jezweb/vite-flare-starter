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
  models: (CatalogueModel & { source?: 'openrouter' | 'workers-ai' })[]
}

const CATALOGUE = new Map((snapshot as Snapshot).models.map((m) => [m.id, m] as const))

/** Convert a CatalogueModel (from flared.au) into our ModelConfig shape. */
/**
 * Bucket input-token price ($ per million tokens) into the 4-tier UI indicator
 * shown on the model picker. Thresholds tuned against the current flared.au
 * catalogue so the three paid tiers are non-empty:
 * - free: Workers AI
 * - low:  cheap chat-tier models (Haiku, GPT mini, Gemini Flash)
 * - mid:  balanced flagships (Sonnet)
 * - high: top-end / expensive (Opus, GPT-5 full, Gemini Pro)
 */
function costTierFor(priceIn: number, isFree: boolean): ModelConfig['costTier'] {
  if (isFree || priceIn === 0) return 'free'
  if (priceIn <= 0.5) return 'low'
  if (priceIn <= 2.5) return 'mid'
  return 'high'
}

/**
 * Output-token fallback when the catalogue reports `max_output: null`.
 * EVERY Workers AI (`@cf/`) entry in the flared.au feed reports null, so they
 * all hit this. 16384 was too tight — on a reasoning model the hidden thinking
 * eats the budget and the visible answer truncates or comes back empty (the
 * Kimi `reasoning_content`-only failure in coerce.ts). The curated Workers AI
 * set are all large-context flagships that comfortably emit 32K, so floor them
 * higher; non-Workers-AI models with a null max keep the conservative default.
 */
const WORKERS_AI_FALLBACK_MAX_TOKENS = 32768
const GENERIC_FALLBACK_MAX_TOKENS = 16384

/**
 * Stale-catalogue corrections. The flared.au / Workers AI capability feed is
 * occasionally wrong for `@cf/` models — same class as the stale `vision`
 * flags noted in the workers-ai-gotchas rule. Patch the curated set here so
 * the registry reflects reality. Applied LAST, so it wins over the catalogue.
 *
 * `@cf/moonshotai/kimi-k2.6` (our default) ships with `reasoning: false` and
 * `max_output: null` despite being a thinking model with a 262K context — so
 * without this it was treated as non-reasoning AND capped at 16384, which is
 * exactly why the default chat felt limited. See the dep-review investigation
 * 2026-06-09.
 */
const MODEL_OVERRIDES: Record<string, Partial<ModelConfig>> = {
  '@cf/moonshotai/kimi-k2.6': { isReasoning: true, defaultMaxTokens: 32768 },
}

function fromCatalogue(m: CatalogueModel & { source?: 'openrouter' | 'workers-ai' }): ModelConfig {
  const caps = m.capabilities
  const priceIn = m.pricing?.input ?? 0
  const isFree = m.source === 'workers-ai' || priceIn === 0
  const ctxK = m.context_length ? (m.context_length / 1000).toFixed(0) : '?'
  return {
    id: m.id,
    displayName: m.short_name ?? m.name?.replace(/^.*?: /, '') ?? m.id,
    provider: (m.provider as ModelConfig['provider']) ?? 'openai',
    contextWindow: m.context_length ?? 128_000,
    isReasoning: caps?.reasoning ?? false,
    supportsStreaming: caps?.streaming ?? true,
    supportsTools: caps?.tools ?? true,
    supportsVision: caps?.vision ?? m.modality?.includes('image') ?? false,
    supportsPdf: caps?.pdf ?? false,
    defaultMaxTokens:
      m.max_output ??
      (m.source === 'workers-ai' ? WORKERS_AI_FALLBACK_MAX_TOKENS : GENERIC_FALLBACK_MAX_TOKENS),
    description:
      `${m.short_name ?? m.name ?? m.id} — ${ctxK}K ctx` +
      (isFree ? ', free via Workers AI' : priceIn > 0 ? `, $${priceIn}/M in` : ''),
    tier: (m.tier as ModelTier) ?? 'balanced',
    costTier: costTierFor(priceIn, isFree),
  }
}

/** Materialise the enabled registry once at module load. */
export const MODEL_REGISTRY: Record<string, ModelConfig> = (() => {
  const out: Record<string, ModelConfig> = {}
  for (const id of ENABLED_MODEL_IDS) {
    const cat = CATALOGUE.get(id)
    if (cat) {
      out[id] = { ...fromCatalogue(cat), ...MODEL_OVERRIDES[id] }
    } else {
      // Enabled but missing from both catalogues — show a stub so the
      // selector still works. Run `pnpm models:refresh` to pick up new models.
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
        defaultMaxTokens: 16384,
        description: `${id} (not in catalogue — run pnpm models:refresh)`,
        tier: 'balanced',
        // Stubs come from ENABLED_MODEL_IDS with no catalogue match — assume
        // free since the only models that hit this path are pre-release or
        // experimental entries added before the catalogue refresh.
        costTier: id.startsWith('@cf/') || id.startsWith('@hf/') ? 'free' : 'low',
        ...MODEL_OVERRIDES[id],
      }
    }
  }
  return out
})()

export const DEFAULT_MODEL: ModelId = DEFAULT_MODEL_ID

/** Shortcut aliases for use in URLs / tool calls. Extend freely. */
export const ALIAS_TO_MODEL_ID: Record<string, ModelId> = {
  kimi: '@cf/moonshotai/kimi-k2.6',
  gemma: '@cf/google/gemma-4-26b-a4b-it',
  glm: '@cf/zai-org/glm-4.7-flash',
  qwq: '@cf/qwen/qwq-32b',
  opus: 'anthropic/claude-opus-4.8',
  sonnet: 'anthropic/claude-sonnet-4.6',
  haiku: 'anthropic/claude-haiku-4.5',
  gpt: 'openai/gpt-5.4',
  'gpt-mini': 'openai/gpt-5.4-mini',
  gemini: 'google/gemini-3.1-pro-preview',
  'gemini-flash': 'google/gemini-3-flash-preview',
  deepseek: 'deepseek/deepseek-v4-pro',
  qwen: 'qwen/qwen3.6-plus',
  grok: 'x-ai/grok-4.20',
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

export function listModels(): ModelConfig[] {
  return Object.values(MODEL_REGISTRY)
}

// Re-exports so consumers don't need to know about the config file.
export { WORKERS_AI_MODELS, OPENROUTER_MODELS }
