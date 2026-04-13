/**
 * AI SDK Middleware
 *
 * Wraps Workers AI models with AI SDK middleware based on capabilities.
 * Currently applies extractReasoningMiddleware for reasoning models.
 */
import { wrapLanguageModel, extractReasoningMiddleware } from 'ai'
import { isReasoningModel } from './models'
import type { ModelId } from './types'

/**
 * Build a model instance with appropriate middleware applied.
 *
 * - Reasoning models (QwQ 32B): extracts <think> tokens into reasoning parts
 * - All other models: returned as-is
 */
export function buildModel(baseModel: Parameters<typeof wrapLanguageModel>[0]['model'], modelId: ModelId) {
  if (isReasoningModel(modelId)) {
    return wrapLanguageModel({
      model: baseModel,
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    })
  }
  return baseModel
}
