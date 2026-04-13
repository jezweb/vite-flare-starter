/**
 * Demo Tools for AI Chat
 *
 * AI SDK tool definitions that demonstrate agentic capabilities.
 * Only active when the selected model supports tool calling.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { getModel, listModels } from '@/server/lib/ai/models'
import type { ModelId } from '@/server/lib/ai/types'

export const chatTools = {
  /**
   * Returns the current server time in UTC
   */
  get_server_time: tool({
    description: 'Get the current server time in UTC. Use when the user asks about the current time or date.',
    inputSchema: z.object({}),
    execute: async () => ({
      utc: new Date().toISOString(),
      timestamp: Date.now(),
      timezone: 'UTC',
    }),
  }),

  /**
   * Looks up a Workers AI model's capabilities from the registry
   */
  get_model_info: tool({
    description: 'Get capabilities and metadata for a Workers AI model. Use when the user asks about available models or model features.',
    inputSchema: z.object({
      modelId: z.string().describe('The model ID to look up, e.g. @cf/meta/llama-4-scout-17b-16e-instruct'),
    }),
    execute: async ({ modelId }: { modelId: string }) => {
      const model = getModel(modelId as ModelId)
      if (!model) {
        const available = listModels().map(m => ({ id: m.id, name: m.displayName }))
        return { error: `Unknown model: ${modelId}`, availableModels: available }
      }
      return {
        id: model.id,
        name: model.displayName,
        provider: model.provider,
        contextWindow: model.contextWindow,
        supportsTools: model.supportsTools,
        supportsVision: model.supportsVision,
        isReasoning: model.isReasoning,
        tier: model.tier,
        description: model.description,
      }
    },
  }),

  /**
   * Evaluates a simple arithmetic expression safely
   */
  calculate: tool({
    description: 'Evaluate a simple arithmetic expression. Use for any math calculations.',
    inputSchema: z.object({
      expression: z.string().describe('Math expression like "2 + 2" or "100 / 4 * 3"'),
    }),
    execute: async ({ expression }: { expression: string }) => {
      if (!/^[\d\s+\-*/()%.]+$/.test(expression)) {
        return { error: 'Expression contains invalid characters. Only numbers and basic operators (+, -, *, /) are allowed.' }
      }
      try {
        const result = Function(`"use strict"; return (${expression})`)()
        if (typeof result !== 'number' || !isFinite(result)) {
          return { error: 'Expression did not evaluate to a valid number' }
        }
        return { expression, result }
      } catch {
        return { error: `Could not evaluate: ${expression}` }
      }
    },
  }),
}
