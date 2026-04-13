/**
 * AI Provider Registry
 *
 * Uses AI SDK's createProviderRegistry for unified model access.
 * Supports language models, embedding models, and image models
 * across all configured providers.
 *
 * @example
 * import { resolveModel, buildRegistry } from '@/server/lib/ai'
 *
 * // Language models (backward compat — auto-detects provider)
 * const model = resolveModel(env, '@cf/moonshotai/kimi-k2.5')
 * const model = resolveModel(env, 'claude-sonnet-4-6')
 *
 * // Registry format (explicit provider:model)
 * const registry = buildRegistry(env)
 * const model = registry.languageModel('anthropic:claude-sonnet-4-6')
 * const embedder = registry.embeddingModel('cf:@cf/baai/bge-base-en-v1.5')
 * const imager = registry.imageModel('openai:gpt-image-1')
 */
import { createProviderRegistry } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export interface ProviderEnv {
  AI: Ai
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  OPENROUTER_API_KEY?: string
}

/**
 * Build a provider registry from environment bindings.
 * Workers AI is always available. Other providers added when keys are set.
 */
export function buildRegistry(env: ProviderEnv) {
  const providers: Record<string, unknown> = {
    cf: createWorkersAI({ binding: env.AI }),
  }

  if (env.ANTHROPIC_API_KEY) {
    providers['anthropic'] = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  if (env.OPENAI_API_KEY) {
    providers['openai'] = createOpenAI({ apiKey: env.OPENAI_API_KEY })
  }
  if (env.GOOGLE_AI_API_KEY) {
    providers['google'] = createGoogleGenerativeAI({ apiKey: env.GOOGLE_AI_API_KEY })
  }
  if (env.OPENROUTER_API_KEY) {
    providers['openrouter'] = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createProviderRegistry(providers as any)
}

/**
 * Resolve a model string to a provider model instance.
 * Backward-compatible: accepts @cf/, claude-, gpt-, gemini-, openrouter/ prefixes.
 * Also accepts registry format: provider:modelId
 *
 * @example
 * resolveModel(env, '@cf/moonshotai/kimi-k2.5')      // Workers AI
 * resolveModel(env, 'claude-sonnet-4-6')               // Anthropic
 * resolveModel(env, 'gpt-4o')                          // OpenAI
 * resolveModel(env, 'gemini-2.5-pro')                  // Google
 * resolveModel(env, 'openrouter/anthropic/claude-...')  // OpenRouter
 */
export function resolveModel(env: ProviderEnv, modelId: string) {
  const registry = buildRegistry(env)

  // Workers AI — native binding, free
  if (modelId.startsWith('@cf/') || modelId.startsWith('@hf/')) {
    return registry.languageModel(`cf:${modelId}`)
  }

  // Anthropic — Claude models
  if (modelId.startsWith('claude-')) {
    if (!env.ANTHROPIC_API_KEY) throw new Error(`ANTHROPIC_API_KEY required for model: ${modelId}`)
    return registry.languageModel(`anthropic:${modelId}`)
  }

  // OpenAI — GPT and o-series models
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.startsWith('o3-') || modelId.startsWith('o4-')) {
    if (!env.OPENAI_API_KEY) throw new Error(`OPENAI_API_KEY required for model: ${modelId}`)
    return registry.languageModel(`openai:${modelId}`)
  }

  // Google — Gemini models
  if (modelId.startsWith('gemini-')) {
    if (!env.GOOGLE_AI_API_KEY) throw new Error(`GOOGLE_AI_API_KEY required for model: ${modelId}`)
    return registry.languageModel(`google:${modelId}`)
  }

  // OpenRouter — explicit prefix
  if (modelId.startsWith('openrouter/')) {
    if (!env.OPENROUTER_API_KEY) throw new Error(`OPENROUTER_API_KEY required for model: ${modelId}`)
    return registry.languageModel(`openrouter:${modelId.replace('openrouter/', '')}`)
  }

  // Registry format: provider:model
  if (modelId.includes(':')) {
    return registry.languageModel(modelId as `${string}:${string}`)
  }

  // Fallback: try OpenRouter, then Workers AI
  if (env.OPENROUTER_API_KEY) {
    return registry.languageModel(`openrouter:${modelId}`)
  }

  console.warn(`Unknown model "${modelId}" — falling back to Workers AI`)
  return registry.languageModel(`cf:${modelId}`)
}

/**
 * List available providers based on which API keys are configured
 */
export function getAvailableProviders(env: ProviderEnv): string[] {
  const providers = ['workers-ai']
  if (env.ANTHROPIC_API_KEY) providers.push('anthropic')
  if (env.OPENAI_API_KEY) providers.push('openai')
  if (env.GOOGLE_AI_API_KEY) providers.push('google')
  if (env.OPENROUTER_API_KEY) providers.push('openrouter')
  return providers
}
