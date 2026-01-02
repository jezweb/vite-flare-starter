/**
 * AI Tools Module
 *
 * Modular tool calling system for Workers AI.
 * Supports local tools, MCP servers, and future providers.
 *
 * @example Basic usage with local tools
 * ```typescript
 * import { createToolRegistry, defineTool, runWithTools } from '@/server/lib/ai/tools'
 *
 * // Create a registry
 * const tools = createToolRegistry()
 *
 * // Define a tool
 * tools.register(defineTool({
 *   name: 'get_weather',
 *   description: 'Get current weather for a location',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       location: { type: 'string', description: 'City name' }
 *     },
 *     required: ['location']
 *   },
 *   execute: async ({ location }) => {
 *     return { temperature: 22, condition: 'sunny' }
 *   }
 * }))
 *
 * // Run with tools
 * const result = await runWithTools(
 *   env.AI,
 *   'What is the weather in Sydney?',
 *   tools,
 *   { model: 'llama-70b' }
 * )
 * console.log(result.response)
 * ```
 *
 * @example Using MCP servers
 * ```typescript
 * import { createHTTPMCPClient, createMCPToolRegistry, runWithTools } from '@/server/lib/ai/tools'
 *
 * // Connect to your MCP server
 * const mcpClient = createHTTPMCPClient('http://localhost:5173/api/mcp', {
 *   headers: { 'Authorization': 'Bearer token' }
 * })
 *
 * // Create tools from MCP
 * const tools = await createMCPToolRegistry(mcpClient, {
 *   namePrefix: 'enquiry_',
 *   tags: ['crm']
 * })
 *
 * // Run with MCP tools
 * const result = await runWithTools(env.AI, 'List recent enquiries', tools)
 * ```
 *
 * @example Combining local and MCP tools
 * ```typescript
 * import { createToolRegistry, mergeRegistries, createMCPToolRegistry } from '@/server/lib/ai/tools'
 *
 * const localTools = createToolRegistry()
 * // ... register local tools
 *
 * const mcpTools = await createMCPToolRegistry(mcpClient)
 *
 * const allTools = mergeRegistries(localTools, mcpTools)
 * ```
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Core tool types
  Tool,
  ToolContext,
  ToolMetadata,
  ToolRegistry,
  ToolDefinition,
  // Tool calling
  ToolCallRequest,
  ToolCallResult,
  ToolExecutor,
  // Run with tools
  RunWithToolsOptions,
  RunWithToolsResult,
  // JSON Schema
  JSONSchema,
  JSONSchemaProperty,
  // MCP types
  MCPToolDefinition,
  MCPClientLike,
  // Provider types
  ToolProvider,
  WorkersAIBinding,
} from './types'

// =============================================================================
// REGISTRY EXPORTS
// =============================================================================

export {
  // Registry creation
  createToolRegistry,
  // Tool definition helpers
  defineTool,
  defineToolWithZod,
  // Registry utilities
  mergeRegistries,
  filterRegistry,
  filterByTags,
  filterBySource,
} from './registry'

// =============================================================================
// EXECUTOR EXPORTS
// =============================================================================

export {
  // Main execution functions
  runWithTools,
  chatWithTools,
  streamWithTools,
  // Executor creation
  createExecutor,
} from './executor'

// =============================================================================
// MCP BRIDGE EXPORTS
// =============================================================================

export {
  // MCP tool conversion
  mcpToolToTool,
  createMCPToolRegistry,
  createMCPToolRegistryFromMany,
  // MCP clients
  createLocalMCPClient,
  createHTTPMCPClient,
  createOAuthHTTPMCPClient,
  // Note: createRemoteMCPClient requires @modelcontextprotocol/sdk (optional)
  // MCP server adapter
  createMCPServerAdapter,
} from './mcp-bridge'

export type { MCPBridgeOptions, LocalMCPServer } from './mcp-bridge'

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

// Re-export model helpers for tool-capable models
export { supportsTools, getToolCapableModels } from '../providers'
