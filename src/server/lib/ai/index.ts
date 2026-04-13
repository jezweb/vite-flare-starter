/**
 * AI Module
 *
 * Model registry and utilities for Workers AI via AI SDK.
 *
 * @example
 * import { DEFAULT_MODEL, getModel, listModels } from '@/server/lib/ai'
 * import { createWorkersAI } from 'workers-ai-provider'
 * import { streamText } from 'ai'
 *
 * const workersai = createWorkersAI({ binding: c.env.AI })
 * const result = streamText({
 *   model: workersai(DEFAULT_MODEL),
 *   messages,
 * })
 */

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
