/**
 * AI Module
 *
 * Unified AI client that works with all providers via AI Gateway.
 * One code path for Workers AI (free) and external providers (BYOK).
 *
 * @example
 * import { createAIGatewayClient } from '@/server/lib/ai'
 *
 * // Create client with AI Gateway (recommended)
 * const ai = createAIGatewayClient(c.env)
 *
 * // Works with any model - Workers AI or external
 * const result = await ai.generate('Hello, world!')
 * const result = await ai.chat(messages, { model: 'gpt-4o' })
 * const result = await ai.chat(messages, { model: '@cf/meta/llama-3.1-8b-instruct' })
 *
 * // JSON with validation
 * const { data, success } = await ai.generateJSON(prompt, zodSchema)
 *
 * // Streaming
 * const stream = await ai.chatStream(messages)
 */

// =============================================================================
// AI GATEWAY CLIENT (Recommended - works with all providers)
// =============================================================================
export { AIGatewayClient, createAIGatewayClient } from './gateway'
export type { AIGatewayEnv, AIGatewayOptions } from './gateway'

// =============================================================================
// PROVIDERS (Model registry for all providers)
// =============================================================================
export {
  PROVIDERS,
  MODEL_CONFIGS,
  TOOL_CAPABLE_MODELS,
  DEFAULT_MODEL,
  DEFAULT_MODELS,
  parseModelId,
  getModelConfig,
  supportsTools,
  getAllProviders,
  getFreeProviders,
  listModels,
  getToolCapableModels,
} from './providers'
export type { ProviderInfo, ProviderModelConfig } from './providers'

// =============================================================================
// LEGACY CLIENT (Direct Workers AI binding - kept for backwards compatibility)
// =============================================================================
export { AIClient, createAIClient } from './client'

// Legacy models (kept for backwards compatibility)
export {
  MODEL_REGISTRY,
  ALIAS_TO_MODEL_ID,
  resolveModelId,
  getModel,
  isReasoningModel,
  getRecommendedModel,
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
