/**
 * AI SDK Middleware Stack
 *
 * Wraps language models with a layered middleware stack:
 * 1. defaultSettingsMiddleware — standard temperature, etc.
 * 2. addToolInputExamplesMiddleware — improves tool selection accuracy
 * 3. extractReasoningMiddleware — extracts <think> tokens for reasoning models
 */
import {
  wrapLanguageModel,
  extractReasoningMiddleware,
  defaultSettingsMiddleware,
  addToolInputExamplesMiddleware,
} from 'ai'
import { isReasoningModel } from './models'
import type { ModelId } from './types'

/**
 * Build a model instance with the full middleware stack applied.
 */
export function buildModel(baseModel: Parameters<typeof wrapLanguageModel>[0]['model'], modelId: ModelId) {
  let model = baseModel

  // 1. Default settings — standardise temperature across providers
  model = wrapLanguageModel({
    model,
    middleware: defaultSettingsMiddleware({
      settings: { temperature: 0.7 },
    }),
  })

  // 2. Tool input examples — helps models pick the right tool
  model = wrapLanguageModel({
    model,
    middleware: addToolInputExamplesMiddleware(),
  })

  // 3. Reasoning extraction for thinking models (QwQ 32B, etc.)
  if (isReasoningModel(modelId)) {
    model = wrapLanguageModel({
      model,
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    })
  }

  return model
}
