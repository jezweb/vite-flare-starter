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
 * - `provider/model` (e.g. `anthropic/claude-sonnet-4.6`) → routed through
 *   OpenRouter. Requires OPENROUTER_API_KEY secret.
 *
 * Browse the full catalogue at https://models.flared.au/ and just paste the
 * `id` field of any model you want.
 */

/** Free Workers AI models (always available). */
export const WORKERS_AI_MODELS = [
  '@cf/moonshotai/kimi-k2.6',          // 262K ctx, tools, flagship
  '@cf/google/gemma-4-26b-a4b-it',     // 256K ctx, tools, flagship — also multimodal (vision)
  '@cf/zai-org/glm-4.7-flash',         // 131K ctx, tools, flagship
  '@cf/qwen/qwq-32b',                  // reasoning flagship
  '@cf/openai/gpt-oss-120b',           // 128K ctx, tools, flagship — OpenAI open-weights
  '@cf/openai/gpt-oss-20b',            // 128K ctx, tools, flagship — smaller GPT-OSS
] as const

/**
 * OpenRouter-routed models (require OPENROUTER_API_KEY).
 *
 * IDs match https://models.flared.au/json — the `id` field verbatim.
 * To add a model: open models.flared.au, find it, paste its `id` here.
 */
export const OPENROUTER_MODELS = [
  // Anthropic
  'anthropic/claude-opus-4.6',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-haiku-4.5',

  // OpenAI
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini',

  // Google
  'google/gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview',

  // DeepSeek — V4 dropped 2026-04-24, MIT license, 1M context.
  // V3.2-speciale retired (deepseek-chat/reasoner endpoints sunset 2026-07-24).
  'deepseek/deepseek-v4-pro',     // 1.6T MoE, 49B active; $1.74/$3.48 per Mtok
  'deepseek/deepseek-v4-flash',   // 284B MoE, 13B active; $0.14/$0.28 per Mtok

  // Qwen
  'qwen/qwen3.6-plus',

  // Mistral
  'mistralai/mistral-large-2512',

  // xAI
  'x-ai/grok-4.1-fast',

  // Z.AI
  'z-ai/glm-5',
] as const

/** Every enabled model ID — used by the chat model selector. */
export const ENABLED_MODEL_IDS: readonly string[] = [
  ...WORKERS_AI_MODELS,
  ...OPENROUTER_MODELS,
]

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
