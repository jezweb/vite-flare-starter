/**
 * Workers AI Module
 *
 * A lightweight, type-safe wrapper around Cloudflare Workers AI.
 *
 * @example
 * import { createAIClient, getRecommendedModel } from '@/server/lib/ai'
 *
 * const ai = createAIClient(c.env.AI)
 *
 * // Simple generation
 * const result = await ai.generate('Hello, world!')
 *
 * // Chat with history
 * const chatResult = await ai.chat([
 *   { role: 'system', content: 'You are helpful.' },
 *   { role: 'user', content: 'Hi!' },
 * ])
 *
 * // JSON with validation
 * const { data, success } = await ai.generateJSON(prompt, zodSchema)
 *
 * // Streaming
 * const stream = await ai.generateStream('Write a poem...')
 */

// Client
export { AIClient, createAIClient } from './client'

// Models
export {
  MODEL_REGISTRY,
  DEFAULT_MODEL,
  ALIAS_TO_MODEL_ID,
  resolveModelId,
  getModel,
  isReasoningModel,
  supportsTools,
  getToolCapableModels,
  getRecommendedModel,
  listModels,
} from './models'

// Types
export type {
  ModelId,
  ModelAlias,
  APIFormat,
  ModelTier,
  ModelConfig,
  AIClientOptions,
  TokenUsage,
  GenerateResult,
  GenerateJSONResult,
  ChatMessage,
  TextContentPart,
  ImageUrlContentPart,
  AnthropicImageContentPart,
  AnthropicDocumentContentPart,
  OpenRouterFileContentPart,
  MessageContentPart,
  MultimodalMessage,
  MultimodalProvider,
  AttachmentData,
  AIRunParams,
  AIRunResponse,
  ZodSchema,
} from './types'

// Errors
export {
  AIErrorCode,
  AIError,
  isAIError,
  wrapError,
  withRetry,
} from './errors'
export type { RetryOptions } from './errors'

// Utilities
export {
  extractThinking,
  extractJSON,
  extractJSONArray,
  cleanResponse,
  truncateToTokens,
  estimateTokens,
  formatChatPrompt,
  buildJSONPrompt,
  safeStringify,
  estimateTokenUsage,
  estimateMessagesTokens,
} from './utils'
export type { ThinkingResult } from './utils'

// =============================================================================
// TOOLS MODULE (Re-exports for convenience)
// =============================================================================

// Tool registry and definition
export {
  createToolRegistry,
  defineTool,
  defineToolWithZod,
  mergeRegistries,
  filterRegistry,
  filterByTags,
  filterBySource,
} from './tools'

// Tool execution
export {
  runWithTools,
  chatWithTools,
  streamWithTools,
  createExecutor,
} from './tools'

// MCP bridge
export {
  mcpToolToTool,
  createMCPToolRegistry,
  createMCPToolRegistryFromMany,
  createLocalMCPClient,
  createHTTPMCPClient,
  createOAuthHTTPMCPClient,
  // Note: createRemoteMCPClient requires @modelcontextprotocol/sdk (optional)
  createMCPServerAdapter,
} from './tools'

// Tool types (re-export from tools module)
export type {
  Tool,
  ToolContext,
  ToolMetadata,
  ToolRegistry,
  ToolDefinition,
  ToolCallRequest,
  ToolCallResult,
  ToolExecutor,
  RunWithToolsOptions,
  RunWithToolsResult,
  JSONSchema,
  JSONSchemaProperty,
  MCPToolDefinition,
  MCPClientLike,
  ToolProvider,
  WorkersAIBinding,
  MCPBridgeOptions,
  LocalMCPServer,
} from './tools'
