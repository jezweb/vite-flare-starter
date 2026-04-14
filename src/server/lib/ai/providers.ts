/**
 * AI Provider Factory — direct call pattern (registry was unreliable for Workers AI).
 */
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

export function resolveModel(env: ProviderEnv, modelId: string) {
  // Workers AI — native binding, free
  if (modelId.startsWith('@cf/') || modelId.startsWith('@hf/')) {
    const workersai = createWorkersAI({ binding: env.AI })
    return workersai(modelId)
  }

  // Anthropic — Claude models
  if (modelId.startsWith('claude-')) {
    if (!env.ANTHROPIC_API_KEY) throw new Error(`ANTHROPIC_API_KEY required for model: ${modelId}`)
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })
    return anthropic(modelId)
  }

  // OpenAI — GPT and o-series models
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.startsWith('o3-') || modelId.startsWith('o4-')) {
    if (!env.OPENAI_API_KEY) throw new Error(`OPENAI_API_KEY required for model: ${modelId}`)
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
    return openai(modelId)
  }

  // Google — Gemini models
  if (modelId.startsWith('gemini-')) {
    if (!env.GOOGLE_AI_API_KEY) throw new Error(`GOOGLE_AI_API_KEY required for model: ${modelId}`)
    const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_AI_API_KEY })
    return google(modelId)
  }

  // OpenRouter — explicit prefix or fallback
  if (modelId.startsWith('openrouter/')) {
    if (!env.OPENROUTER_API_KEY) throw new Error(`OPENROUTER_API_KEY required for model: ${modelId}`)
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
    return openrouter(modelId.replace('openrouter/', ''))
  }

  // Fallback: try OpenRouter, else Workers AI
  if (env.OPENROUTER_API_KEY) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
    return openrouter(modelId)
  }
  console.warn(`Unknown model "${modelId}" — falling back to Workers AI`)
  const workersai = createWorkersAI({ binding: env.AI })
  return workersai(modelId)
}

export function getAvailableProviders(env: ProviderEnv): string[] {
  const providers = ['workers-ai']
  if (env.ANTHROPIC_API_KEY) providers.push('anthropic')
  if (env.OPENAI_API_KEY) providers.push('openai')
  if (env.GOOGLE_AI_API_KEY) providers.push('google')
  if (env.OPENROUTER_API_KEY) providers.push('openrouter')
  return providers
}

/** Legacy — kept for embedding/rerank which used the registry. No-op for now. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRegistry(_env: ProviderEnv): any {
  throw new Error('buildRegistry removed — use resolveModel() or createWorkersAI() directly for embeddings.')
}
