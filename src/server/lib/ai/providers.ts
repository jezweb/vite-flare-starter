/**
 * AI Provider Factory
 *
 * Resolves any model string to the correct AI SDK provider instance.
 * Just pass a model ID — the factory figures out which provider to use.
 *
 * @example
 * import { resolveModel } from '@/server/lib/ai'
 *
 * // Workers AI (free, no key needed)
 * const model = resolveModel(env, '@cf/moonshotai/kimi-k2.5')
 *
 * // Anthropic
 * const model = resolveModel(env, 'claude-sonnet-4-6')
 *
 * // OpenAI
 * const model = resolveModel(env, 'gpt-4o')
 *
 * // Google
 * const model = resolveModel(env, 'gemini-2.5-pro')
 *
 * // OpenRouter (prefix with openrouter/)
 * const model = resolveModel(env, 'openrouter/anthropic/claude-sonnet-4-6')
 *
 * // Then use with any AI SDK function — they're all interchangeable:
 * const result = streamText({ model, messages, tools })
 */
import { createWorkersAI } from 'workers-ai-provider'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

interface ProviderEnv {
  AI: Ai
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  OPENROUTER_API_KEY?: string
}

/**
 * Detect which provider a model ID belongs to and return the AI SDK model instance.
 *
 * Detection rules:
 * - `@cf/` or `@hf/` prefix → Workers AI (free, uses env.AI binding)
 * - `claude-` prefix → Anthropic
 * - `gpt-` or `o1-` or `o3-` prefix → OpenAI
 * - `gemini-` prefix → Google AI
 * - `openrouter/` prefix → OpenRouter (strips prefix)
 * - Anything else → tries OpenRouter if key is set, otherwise Workers AI fallback
 */
export function resolveModel(env: ProviderEnv, modelId: string) {
  // Workers AI — native binding, free
  if (modelId.startsWith('@cf/') || modelId.startsWith('@hf/')) {
    const workersai = createWorkersAI({ binding: env.AI })
    return workersai(modelId)
  }

  // Anthropic — Claude models
  if (modelId.startsWith('claude-')) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(`ANTHROPIC_API_KEY required for model: ${modelId}`)
    }
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })
    return anthropic(modelId)
  }

  // OpenAI — GPT and o-series models
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.startsWith('o3-') || modelId.startsWith('o4-')) {
    if (!env.OPENAI_API_KEY) {
      throw new Error(`OPENAI_API_KEY required for model: ${modelId}`)
    }
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
    return openai(modelId)
  }

  // Google — Gemini models
  if (modelId.startsWith('gemini-')) {
    if (!env.GOOGLE_AI_API_KEY) {
      throw new Error(`GOOGLE_AI_API_KEY required for model: ${modelId}`)
    }
    const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_AI_API_KEY })
    return google(modelId)
  }

  // OpenRouter — explicit prefix or fallback
  if (modelId.startsWith('openrouter/')) {
    if (!env.OPENROUTER_API_KEY) {
      throw new Error(`OPENROUTER_API_KEY required for model: ${modelId}`)
    }
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
    return openrouter(modelId.replace('openrouter/', ''))
  }

  // Fallback: try OpenRouter (any model), then Workers AI default
  if (env.OPENROUTER_API_KEY) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
    return openrouter(modelId)
  }

  // Final fallback: Workers AI with the default model
  console.warn(`Unknown model "${modelId}" — falling back to Workers AI`)
  const workersai = createWorkersAI({ binding: env.AI })
  return workersai(modelId)
}

/**
 * List available providers based on which API keys are configured
 */
export function getAvailableProviders(env: ProviderEnv): string[] {
  const providers = ['workers-ai'] // Always available
  if (env.ANTHROPIC_API_KEY) providers.push('anthropic')
  if (env.OPENAI_API_KEY) providers.push('openai')
  if (env.GOOGLE_AI_API_KEY) providers.push('google')
  if (env.OPENROUTER_API_KEY) providers.push('openrouter')
  return providers
}
