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
  DASHSCOPE_API_KEY?: string
  HUGGINGFACE_API_KEY?: string
}

/**
 * Alibaba DashScope — international endpoint, OpenAI-compatible mode.
 * China-region keys should override via `DASHSCOPE_BASE_URL` (not yet wired).
 */
const DASHSCOPE_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'

/**
 * HuggingFace Inference Providers router — OpenAI-compatible, fans out to the
 * cheapest available provider for each model (Sambanova, Together, Fireworks…).
 */
const HUGGINGFACE_BASE_URL = 'https://router.huggingface.co/v1'

export function resolveModel(env: ProviderEnv, modelId: string) {
  // Workers AI — native binding, free.
  if (modelId.startsWith('@cf/') || modelId.startsWith('@hf/')) {
    const workersai = createWorkersAI({ binding: env.AI })
    return workersai(modelId)
  }

  // Explicit `openrouter/provider/model` prefix — strip and forward.
  if (modelId.startsWith('openrouter/')) {
    if (!env.OPENROUTER_API_KEY) throw new Error(`OPENROUTER_API_KEY required for model: ${modelId}`)
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
    return openrouter(modelId.replace('openrouter/', ''))
  }

  // Alibaba Qwen direct via DashScope (OpenAI-compatible). Must be checked
  // before the generic `provider/model → openrouter` rule below.
  if (modelId.startsWith('dashscope/')) {
    if (!env.DASHSCOPE_API_KEY) throw new Error(`DASHSCOPE_API_KEY required for model: ${modelId}`)
    const dashscope = createOpenAI({ apiKey: env.DASHSCOPE_API_KEY, baseURL: DASHSCOPE_BASE_URL })
    return dashscope(modelId.replace('dashscope/', ''))
  }

  // HuggingFace Inference Providers direct. The downstream model ID can itself
  // contain a slash (e.g. `meta-llama/Llama-3.3-70B-Instruct`), so we strip
  // only the `huggingface/` prefix and forward the rest verbatim.
  if (modelId.startsWith('huggingface/')) {
    if (!env.HUGGINGFACE_API_KEY) throw new Error(`HUGGINGFACE_API_KEY required for model: ${modelId}`)
    const hf = createOpenAI({ apiKey: env.HUGGINGFACE_API_KEY, baseURL: HUGGINGFACE_BASE_URL })
    return hf(modelId.replace('huggingface/', ''))
  }

  // `provider/model` shape (e.g. `anthropic/claude-sonnet-4.6`) → OpenRouter.
  // This is the new default for non-Workers-AI models and lets one key unlock
  // the full OpenRouter catalogue.
  if (modelId.includes('/') && !modelId.startsWith('@')) {
    if (!env.OPENROUTER_API_KEY) throw new Error(`OPENROUTER_API_KEY required for model: ${modelId}`)
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
    return openrouter(modelId)
  }

  // Direct-provider fallbacks kept for users who prefer native SDKs per provider.
  if (modelId.startsWith('claude-')) {
    if (!env.ANTHROPIC_API_KEY) throw new Error(`ANTHROPIC_API_KEY required for model: ${modelId}`)
    return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(modelId)
  }
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.startsWith('o3-') || modelId.startsWith('o4-')) {
    if (!env.OPENAI_API_KEY) throw new Error(`OPENAI_API_KEY required for model: ${modelId}`)
    return createOpenAI({ apiKey: env.OPENAI_API_KEY })(modelId)
  }
  if (modelId.startsWith('gemini-')) {
    if (!env.GOOGLE_AI_API_KEY) throw new Error(`GOOGLE_AI_API_KEY required for model: ${modelId}`)
    return createGoogleGenerativeAI({ apiKey: env.GOOGLE_AI_API_KEY })(modelId)
  }

  // Last-chance fallback: OpenRouter if key is set, else Workers AI.
  if (env.OPENROUTER_API_KEY) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
    return openrouter(modelId)
  }
  console.warn(`Unknown model "${modelId}" — falling back to Workers AI`)
  return createWorkersAI({ binding: env.AI })(modelId)
}

export function getAvailableProviders(env: ProviderEnv): string[] {
  const providers = ['workers-ai']
  if (env.ANTHROPIC_API_KEY) providers.push('anthropic')
  if (env.OPENAI_API_KEY) providers.push('openai')
  if (env.GOOGLE_AI_API_KEY) providers.push('google')
  if (env.DASHSCOPE_API_KEY) providers.push('dashscope')
  if (env.HUGGINGFACE_API_KEY) providers.push('huggingface')
  if (env.OPENROUTER_API_KEY) providers.push('openrouter')
  return providers
}

/** Legacy — kept for embedding/rerank which used the registry. No-op for now. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRegistry(_env: ProviderEnv): any {
  throw new Error('buildRegistry removed — use resolveModel() or createWorkersAI() directly for embeddings.')
}
