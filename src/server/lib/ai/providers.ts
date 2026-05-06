/**
 * AI Provider Factory — picks the cheapest correct path for a model id.
 *
 * Routing rules (first match wins):
 *
 *   1. Workers AI binding         — model id starts with `@cf/` or `@hf/`.
 *   2. Forced OpenRouter          — id starts with `openrouter/`.
 *                                   Explicit escape hatch for "I want
 *                                   OpenRouter even though the direct key
 *                                   is set" (rare; useful for billing
 *                                   consolidation testing).
 *   3. Direct provider SDK        — `provider/model` shape where the
 *                                   matching direct key is present.
 *                                   `anthropic/...`  → @ai-sdk/anthropic
 *                                   `openai/...`     → @ai-sdk/openai
 *                                   `google/...`     → @ai-sdk/google
 *                                   `deepseek/...`   → @ai-sdk/deepseek
 *                                   `mistralai/...`  → @ai-sdk/mistral
 *                                   `x-ai/...`       → @ai-sdk/xai
 *                                   The `provider/` prefix is stripped
 *                                   before forwarding.
 *   4. OpenRouter fallback        — `provider/model` shape and
 *                                   OPENROUTER_API_KEY is set.
 *   5. Bare-id direct provider    — `claude-*`, `gpt-*` / `o3-*`,
 *                                   `gemini-*`, `deepseek-*`,
 *                                   `mistral-*`/`codestral-*`/`pixtral-*`,
 *                                   or `grok-*` with the matching key.
 *   6. Unknown id                 — fall through to OpenRouter or
 *                                   Workers AI as last-resort.
 *
 * Net effect: a fork that sets BOTH `ANTHROPIC_API_KEY` and
 * `OPENROUTER_API_KEY` automatically uses direct Anthropic for
 * `anthropic/...` ids while still routing DeepSeek, Qwen, etc. through
 * OpenRouter. No configuration toggle needed — keys are the signal.
 */
import { createWorkersAI } from 'workers-ai-provider'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createMistral } from '@ai-sdk/mistral'
import { createXai } from '@ai-sdk/xai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { getServiceKey, type CredentialEnv, type CredentialOwner } from '@/server/lib/credentials'

export interface ProviderEnv {
  AI: Ai
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  MISTRAL_API_KEY?: string
  XAI_API_KEY?: string
  OPENROUTER_API_KEY?: string
}

/**
 * Modelid → provider id (matches credentials.ts `SUPPORTED_PROVIDERS`).
 * Returns null for Workers AI (no key) and unknown patterns.
 */
function providerIdForModel(modelId: string): string | null {
  if (modelId.startsWith('@cf/') || modelId.startsWith('@hf/')) return null
  if (modelId.startsWith('openrouter/')) return 'openrouter'
  if (modelId.startsWith('anthropic/') || modelId.startsWith('claude-')) return 'anthropic'
  if (
    modelId.startsWith('openai/') ||
    modelId.startsWith('gpt-') ||
    modelId.startsWith('o1-') ||
    modelId.startsWith('o3-') ||
    modelId.startsWith('o4-')
  ) return 'openai'
  if (modelId.startsWith('google/') || modelId.startsWith('gemini-')) return 'google_ai'
  if (modelId.startsWith('deepseek/') || modelId.startsWith('deepseek-')) return 'deepseek'
  if (
    modelId.startsWith('mistralai/') ||
    modelId.startsWith('mistral-') ||
    modelId.startsWith('codestral-') ||
    modelId.startsWith('pixtral-')
  ) return 'mistral'
  if (modelId.startsWith('x-ai/') || modelId.startsWith('grok-')) return 'xai'
  return null
}

/**
 * Build a ProviderEnv overlay where the key for THIS modelId's
 * provider is BYOK-resolved (user → org → env). All other keys come
 * from env unchanged. Lets resolveModel stay sync without duplicating
 * its routing rules.
 *
 * Workers AI ids return env unchanged (no key needed).
 */
async function buildBYOKEnv(
  baseEnv: ProviderEnv & CredentialEnv,
  owner: CredentialOwner,
  modelId: string,
): Promise<ProviderEnv> {
  const provider = providerIdForModel(modelId)
  if (!provider) return baseEnv
  const key = await getServiceKey(baseEnv, owner, provider)
  if (key === null) return baseEnv
  // Map provider id → ProviderEnv slot
  const slotMap: Record<string, keyof ProviderEnv> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google_ai: 'GOOGLE_AI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    xai: 'XAI_API_KEY',
  }
  const slot = slotMap[provider]
  if (!slot) return baseEnv
  return { ...baseEnv, [slot]: key }
}

/**
 * BYOK-aware resolveModel. Use this from agents that have user
 * context (chat module, AutonomousAgent). Falls back to env keys
 * when the user/org has no credential set.
 *
 * Sync `resolveModel` is preserved for callers without user context
 * (e.g. background scheduled tasks running as the operator).
 */
export async function resolveModelForUser(
  env: ProviderEnv & CredentialEnv,
  owner: CredentialOwner,
  modelId: string,
) {
  const overlay = await buildBYOKEnv(env, owner, modelId)
  return resolveModel(overlay, modelId)
}

/**
 * Map a `provider/` prefix to its direct-SDK builder + env key check.
 * Returns null if the model id doesn't match a known direct provider OR
 * the matching key isn't set. The caller should then fall back to
 * OpenRouter (or fail if no OpenRouter key either).
 */
function tryDirectFromPrefix(env: ProviderEnv, modelId: string) {
  if (modelId.startsWith('anthropic/') && env.ANTHROPIC_API_KEY) {
    // Catalogue IDs use OpenRouter's dot format (`claude-sonnet-4.6`).
    // Anthropic's direct API rejects dots — it wants dashes (`claude-sonnet-4-6`).
    // Translate on the direct path; OpenRouter route still receives the
    // dotted form unchanged. See gh #58.
    const sub = modelId.slice('anthropic/'.length)
    const normalised = sub.replace(/(claude-(?:sonnet|opus|haiku)-\d+)\.(\d+)/, '$1-$2')
    return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(normalised)
  }
  if (modelId.startsWith('openai/') && env.OPENAI_API_KEY) {
    return createOpenAI({ apiKey: env.OPENAI_API_KEY })(modelId.slice('openai/'.length))
  }
  if (modelId.startsWith('google/') && env.GOOGLE_AI_API_KEY) {
    return createGoogleGenerativeAI({ apiKey: env.GOOGLE_AI_API_KEY })(modelId.slice('google/'.length))
  }
  if (modelId.startsWith('deepseek/') && env.DEEPSEEK_API_KEY) {
    return createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY })(modelId.slice('deepseek/'.length))
  }
  // Catalogue uses OpenRouter's `mistralai/` prefix; direct API drops it.
  if (modelId.startsWith('mistralai/') && env.MISTRAL_API_KEY) {
    return createMistral({ apiKey: env.MISTRAL_API_KEY })(modelId.slice('mistralai/'.length))
  }
  // Catalogue uses OpenRouter's `x-ai/` prefix; direct xAI API drops it.
  if (modelId.startsWith('x-ai/') && env.XAI_API_KEY) {
    return createXai({ apiKey: env.XAI_API_KEY })(modelId.slice('x-ai/'.length))
  }
  return null
}

export function resolveModel(env: ProviderEnv, modelId: string) {
  // 1. Workers AI — native binding, free.
  if (modelId.startsWith('@cf/') || modelId.startsWith('@hf/')) {
    const workersai = createWorkersAI({ binding: env.AI })
    return workersai(modelId)
  }

  // 2. Explicit `openrouter/...` prefix forces OpenRouter even when the
  //    matching direct key is set. Strip and forward.
  if (modelId.startsWith('openrouter/')) {
    if (!env.OPENROUTER_API_KEY) throw new Error(`OPENROUTER_API_KEY required for model: ${modelId}`)
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
    return openrouter(modelId.replace('openrouter/', ''))
  }

  // 3 + 4. `provider/model` shape — prefer direct, fall back to OpenRouter.
  if (modelId.includes('/') && !modelId.startsWith('@')) {
    const direct = tryDirectFromPrefix(env, modelId)
    if (direct) return direct
    if (env.OPENROUTER_API_KEY) {
      const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
      return openrouter(modelId)
    }
    throw new Error(
      `No route for model "${modelId}" — set OPENROUTER_API_KEY (or the direct key for the matching provider).`,
    )
  }

  // 5. Bare model ids — direct provider SDKs only.
  if (modelId.startsWith('claude-')) {
    if (!env.ANTHROPIC_API_KEY) throw new Error(`ANTHROPIC_API_KEY required for model: ${modelId}`)
    // Same dot→dash translation as the prefixed path. See gh #58.
    const normalised = modelId.replace(/(claude-(?:sonnet|opus|haiku)-\d+)\.(\d+)/, '$1-$2')
    return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(normalised)
  }
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.startsWith('o3-') || modelId.startsWith('o4-')) {
    if (!env.OPENAI_API_KEY) throw new Error(`OPENAI_API_KEY required for model: ${modelId}`)
    return createOpenAI({ apiKey: env.OPENAI_API_KEY })(modelId)
  }
  if (modelId.startsWith('gemini-')) {
    if (!env.GOOGLE_AI_API_KEY) throw new Error(`GOOGLE_AI_API_KEY required for model: ${modelId}`)
    return createGoogleGenerativeAI({ apiKey: env.GOOGLE_AI_API_KEY })(modelId)
  }
  if (modelId.startsWith('deepseek-')) {
    if (!env.DEEPSEEK_API_KEY) throw new Error(`DEEPSEEK_API_KEY required for model: ${modelId}`)
    return createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY })(modelId)
  }
  if (modelId.startsWith('mistral-') || modelId.startsWith('codestral-') || modelId.startsWith('pixtral-')) {
    if (!env.MISTRAL_API_KEY) throw new Error(`MISTRAL_API_KEY required for model: ${modelId}`)
    return createMistral({ apiKey: env.MISTRAL_API_KEY })(modelId)
  }
  if (modelId.startsWith('grok-')) {
    if (!env.XAI_API_KEY) throw new Error(`XAI_API_KEY required for model: ${modelId}`)
    return createXai({ apiKey: env.XAI_API_KEY })(modelId)
  }

  // 6. Last-chance fallback: OpenRouter if key set, else Workers AI.
  if (env.OPENROUTER_API_KEY) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
    return openrouter(modelId)
  }
  console.warn(`Unknown model "${modelId}" — falling back to Workers AI`)
  return createWorkersAI({ binding: env.AI })(modelId)
}

/**
 * Tells the caller WHICH path resolveModel() will pick. Useful for
 * the model picker UI ("via OpenRouter" / "direct") and logging
 * decisions. Returns:
 *   'workers-ai' | 'openrouter' | 'anthropic-direct' | 'openai-direct' | 'google-direct' | 'unknown'
 */
export function routeFor(env: ProviderEnv, modelId: string): string {
  if (modelId.startsWith('@cf/') || modelId.startsWith('@hf/')) return 'workers-ai'
  if (modelId.startsWith('openrouter/')) return 'openrouter'
  if (modelId.includes('/') && !modelId.startsWith('@')) {
    if (modelId.startsWith('anthropic/') && env.ANTHROPIC_API_KEY) return 'anthropic-direct'
    if (modelId.startsWith('openai/') && env.OPENAI_API_KEY) return 'openai-direct'
    if (modelId.startsWith('google/') && env.GOOGLE_AI_API_KEY) return 'google-direct'
    if (modelId.startsWith('deepseek/') && env.DEEPSEEK_API_KEY) return 'deepseek-direct'
    if (modelId.startsWith('mistralai/') && env.MISTRAL_API_KEY) return 'mistral-direct'
    if (modelId.startsWith('x-ai/') && env.XAI_API_KEY) return 'xai-direct'
    if (env.OPENROUTER_API_KEY) return 'openrouter'
    return 'unknown'
  }
  if (modelId.startsWith('claude-') && env.ANTHROPIC_API_KEY) return 'anthropic-direct'
  if (
    (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.startsWith('o3-') || modelId.startsWith('o4-')) &&
    env.OPENAI_API_KEY
  ) return 'openai-direct'
  if (modelId.startsWith('gemini-') && env.GOOGLE_AI_API_KEY) return 'google-direct'
  if (modelId.startsWith('deepseek-') && env.DEEPSEEK_API_KEY) return 'deepseek-direct'
  if (
    (modelId.startsWith('mistral-') || modelId.startsWith('codestral-') || modelId.startsWith('pixtral-')) &&
    env.MISTRAL_API_KEY
  ) return 'mistral-direct'
  if (modelId.startsWith('grok-') && env.XAI_API_KEY) return 'xai-direct'
  if (env.OPENROUTER_API_KEY) return 'openrouter'
  return 'workers-ai'
}

export function getAvailableProviders(env: ProviderEnv): string[] {
  const providers = ['workers-ai']
  if (env.ANTHROPIC_API_KEY) providers.push('anthropic')
  if (env.OPENAI_API_KEY) providers.push('openai')
  if (env.GOOGLE_AI_API_KEY) providers.push('google')
  if (env.DEEPSEEK_API_KEY) providers.push('deepseek')
  if (env.MISTRAL_API_KEY) providers.push('mistral')
  if (env.XAI_API_KEY) providers.push('xai')
  if (env.OPENROUTER_API_KEY) providers.push('openrouter')
  return providers
}

/** Legacy — kept for embedding/rerank which used the registry. No-op for now. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRegistry(_env: ProviderEnv): any {
  throw new Error('buildRegistry removed — use resolveModel() or createWorkersAI() directly for embeddings.')
}

/**
 * One-shot AI text completion against a model id. Wraps `resolveModel`
 * + `generateText` + the `.text.trim()` pattern that ran 3 times across
 * batch-tasks and with_review.
 *
 * Use for any non-streaming, non-tool-using single-prompt completion.
 * For streaming, tool-calling, or multi-turn chat, go straight through
 * `resolveModel(env, id)` + `streamText({ model, messages, tools })`.
 *
 * @param system - System prompt establishing role/format/constraints
 * @param prompt - User prompt; the actual task input
 * @returns Trimmed assistant text
 */
export async function runModelText(
  env: ProviderEnv,
  modelId: string,
  system: string,
  prompt: string,
): Promise<string> {
  const { generateText } = await import('ai')
  const model = resolveModel(env, modelId)
  const result = await generateText({
    model: model as Parameters<typeof generateText>[0]['model'],
    system,
    prompt,
  })
  return result.text.trim()
}
