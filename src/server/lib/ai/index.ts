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
 * const model = resolveModel(c.env, '@cf/moonshotai/kimi-k2.6') // Workers AI
 * const model = resolveModel(c.env, 'claude-sonnet-4-6')         // Anthropic
 * const model = resolveModel(c.env, 'gpt-4o')                    // OpenAI
 *
 * const result = streamText({ model, messages })
 */

// Provider registry + factory
export { resolveModel, getAvailableProviders, buildRegistry, routeFor } from './providers'

// Model middleware (reasoning extraction, etc.)
export { buildModel } from './middleware'

// Context builder (system prompt assembly)
export { buildSystemPrompt } from './context'

// MCP client integration (full spec: tools, resources, prompts, elicitation)
export { createMCPManager, getMCPTools } from './mcp'
export type { MCPServerConfig, MCPManager } from './mcp'

// Embeddings (semantic search, RAG)
export { embedText, embedBatch, findSimilar, cosineSimilarity } from './embeddings'

// Document conversion (PDF, images, text → markdown)
export { convertToMarkdown, isConvertible } from './documents'
export type { ConvertOptions } from './documents'

// MCP-UI server helpers — re-exported from @mcp-ui/server.
// Use createUIResource() in your own MCP server tools to return interactive
// HTML/URL/remote-DOM resources that the chat renders via UIResourceRenderer.
// See SEP-1865 (MCP Apps spec) for the full content model.
export { createUIResource } from '@mcp-ui/server'

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
