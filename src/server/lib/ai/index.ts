/**
 * AI Module
 *
 * Multi-provider AI via AI SDK. Pass any model string to resolveModel()
 * and it picks the right provider automatically.
 *
 * @example
 * import { resolveModel, DEFAULT_MODEL } from '@/server/lib/ai'
 * import { streamText } from 'ai'
 *
 * const model = resolveModel(c.env, '@cf/moonshotai/kimi-k2.5') // Workers AI
 * const model = resolveModel(c.env, 'claude-sonnet-4-6')         // Anthropic
 * const model = resolveModel(c.env, 'gpt-4o')                    // OpenAI
 *
 * const result = streamText({ model, messages })
 */

// Provider factory — the main entry point
export { resolveModel, getAvailableProviders } from './providers'

// Model middleware (reasoning extraction, etc.)
export { buildModel } from './middleware'

// Model registry
export {
  MODEL_REGISTRY,
  DEFAULT_MODEL,
  ALIAS_TO_MODEL_ID,
  resolveModelId,
  getModel,
  isReasoningModel,
  getRecommendedModel,
  listModels,
  getToolCapableModels,
} from './models'

// Types
export type {
  ModelId,
  APIFormat,
  ModelTier,
  ModelConfig,
} from './types'

// Errors
export {
  AIErrorCode,
  AIError,
  isAIError,
} from './errors'
