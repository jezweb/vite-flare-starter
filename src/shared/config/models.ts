/**
 * Curated model list.
 *
 * THIS is the file fork-users edit to add/remove AI models. Everything else
 * (metadata, context windows, pricing, capability tags) is pulled live from
 * https://models.flared.au/json — a small API that stays current with the
 * OpenRouter catalogue. If flared.au is unreachable the list below still
 * works, it just won't have enriched metadata.
 *
 * Format:
 * - `@cf/...`  → free Cloudflare Workers AI (no API key required)
 * - `provider/model` (e.g. `anthropic/claude-sonnet-5`) → routed through
 *   OpenRouter. Requires OPENROUTER_API_KEY secret.
 *
 * Browse the full catalogue at https://models.flared.au/ and just paste the
 * `id` field of any model you want.
 */

/** Free Workers AI models (always available). */
export const WORKERS_AI_MODELS = [
  '@cf/moonshotai/kimi-k2.6', // 262K ctx, tools, flagship
  '@cf/google/gemma-4-26b-a4b-it', // 256K ctx, tools, flagship — also multimodal (vision)
  '@cf/zai-org/glm-4.7-flash', // 131K ctx, tools, flagship
  '@cf/zai-org/glm-5.2', // 262K ctx, tools + reasoning, flagship — Z.ai agentic coding. Reasoner-role candidate (MODEL_ROLE_REASONER)
  '@cf/qwen/qwq-32b', // reasoning flagship
  '@cf/openai/gpt-oss-120b', // 128K ctx, tools, flagship — OpenAI open-weights
  '@cf/openai/gpt-oss-20b', // 128K ctx, tools, flagship — smaller GPT-OSS
] as const

/**
 * OpenRouter-routed models (require OPENROUTER_API_KEY).
 *
 * IDs match https://models.flared.au/json — the `id` field verbatim.
 * To add a model: open models.flared.au, find it, paste its `id` here.
 */
export const OPENROUTER_MODELS = [
  // Anthropic
  'anthropic/claude-opus-5', // 1M ctx; $5/$25 per Mtok (replaced opus-4.8, dropped from catalogue 2026-08)
  'anthropic/claude-sonnet-5', // 1M ctx; $2/$10 per Mtok (replaced sonnet-4.6, dropped from catalogue 2026-07)
  'anthropic/claude-haiku-4.5',

  // OpenAI
  'openai/gpt-5.5', // 1.05M ctx; $5/$30 per Mtok (replaced gpt-5.4, dropped from catalogue 2026-07)
  'openai/gpt-5.4-mini',

  // Google
  'google/gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview',

  // DeepSeek — the whole V4 line (pro + flash) left the catalogue 2026-07 with no
  // V5 successor, so this is down to one slot. V3.2 is the survivor worth curating:
  // cheapest tools+reasoning model in the list. (R1 is still catalogued but is a
  // 2025-01 model — add it back only if you specifically want it.)
  'deepseek/deepseek-v3.2', // 164K ctx; $0.269/$0.40 per Mtok

  // Qwen
  'qwen/qwen3.7-plus', // 1M ctx; $0.32/$1.28 per Mtok (replaced qwen3.6-plus, dropped 2026-07)

  // Mistral
  'mistralai/mistral-large-2512',

  // xAI
  'x-ai/grok-4.6', // 500K ctx; $2/$6 per Mtok (replaced grok-4.3, dropped from catalogue 2026-08)

  // Z.AI
  'z-ai/glm-5',
] as const

/** Every enabled model ID — used by the chat model selector. */
export const ENABLED_MODEL_IDS: readonly string[] = [...WORKERS_AI_MODELS, ...OPENROUTER_MODELS]

/**
 * Default model when the user hasn't picked one. Kimi is free and handles
 * tools, so it's a good starter. Change to a paid model if OPENROUTER_API_KEY
 * is always set in your deployment.
 */
export const DEFAULT_MODEL_ID = '@cf/moonshotai/kimi-k2.6'

/** flared.au API endpoint — cached at the edge, automatically OpenRouter-synced. */
export const MODELS_CATALOGUE_URL = 'https://models.flared.au/json'

/** Shape returned by models.flared.au/json. */
export interface CatalogueModel {
  id: string
  name: string
  /** Clean display name without provider prefix, e.g. "Claude Opus 4.6". */
  short_name?: string
  provider: string
  api_id: string
  context_length: number
  max_output: number
  pricing: { input: number; output: number }
  modality: string
  capabilities?: {
    tools: boolean
    vision: boolean
    pdf: boolean
    reasoning: boolean
    structured_outputs: boolean
    streaming: boolean
  }
  tier?: 'flagship' | 'balanced' | 'fast' | 'reasoning'
  released?: string
  knowledge_cutoff?: string
  sunset_date?: string | null
  flagship?: boolean
}
