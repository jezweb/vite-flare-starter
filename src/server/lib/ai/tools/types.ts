/**
 * Tool Types and Interfaces
 *
 * Modular type definitions for the tool calling system.
 * Designed to work with:
 * - Cloudflare Workers AI (@cloudflare/ai-utils)
 * - MCP servers (@modelcontextprotocol/sdk)
 * - Future providers (Google Gemini, OpenAI, etc.)
 */

import type { z } from 'zod'

// =============================================================================
// CORE TOOL DEFINITION
// =============================================================================

/**
 * JSON Schema for tool parameters
 * Compatible with OpenAI function calling spec
 */
export interface JSONSchema {
  type: 'object'
  properties: Record<string, JSONSchemaProperty>
  required?: string[]
  description?: string
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
  items?: JSONSchemaProperty
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  format?: string
}

/**
 * Tool definition - the core interface for all tools
 */
export interface Tool<TParams = Record<string, unknown>, TResult = unknown> {
  /** Unique identifier for the tool */
  name: string
  /** Human-readable description (shown to LLM) */
  description: string
  /** JSON Schema defining the parameters */
  parameters: JSONSchema
  /** Optional Zod schema for validation */
  zodSchema?: z.ZodType<TParams>
  /** The function to execute when tool is called */
  execute: (params: TParams, context: ToolContext) => Promise<TResult>
  /** Optional metadata */
  metadata?: ToolMetadata
}

/**
 * Context passed to tool execution
 */
export interface ToolContext {
  /** User ID if authenticated */
  userId?: string
  /** Request ID for tracing */
  requestId?: string
  /** Environment bindings */
  env?: Record<string, unknown>
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

/**
 * Optional metadata for tools
 */
export interface ToolMetadata {
  /** Tool version */
  version?: string
  /** Tool author/source */
  source?: 'local' | 'mcp' | 'openapi' | 'custom'
  /** MCP server URL if from MCP */
  mcpServerUrl?: string
  /** Tags for categorization */
  tags?: string[]
  /** Whether tool has side effects */
  hasSideEffects?: boolean
  /** Estimated cost per call (for budgeting) */
  estimatedCostUSD?: number
}

// =============================================================================
// TOOL CALLING REQUEST/RESPONSE
// =============================================================================

/**
 * Tool call request from the LLM
 */
export interface ToolCallRequest {
  /** Tool name to call */
  name: string
  /** Arguments as JSON object */
  arguments: Record<string, unknown>
  /** Unique ID for this call (for multi-tool responses) */
  id?: string
}

/**
 * Tool call result
 */
export interface ToolCallResult {
  /** Tool name that was called */
  name: string
  /** The result of the tool execution */
  result: unknown
  /** Whether execution was successful */
  success: boolean
  /** Error message if failed */
  error?: string
  /** Execution duration in ms */
  durationMs: number
  /** Call ID if provided */
  id?: string
}

// =============================================================================
// TOOL EXECUTION OPTIONS
// =============================================================================

/**
 * Options for running tools with an LLM
 */
export interface RunWithToolsOptions {
  /** Maximum number of tool call rounds (default: 5) */
  maxIterations?: number
  /** Whether to stream the response */
  stream?: boolean
  /** Custom tool executor (for testing/mocking) */
  executor?: ToolExecutor
  /** Callback for each tool call */
  onToolCall?: (call: ToolCallRequest) => void
  /** Callback for each tool result */
  onToolResult?: (result: ToolCallResult) => void
  /** Abort signal */
  signal?: AbortSignal
}

/**
 * Result from running tools with an LLM
 */
export interface RunWithToolsResult {
  /** Final response from the LLM */
  response: string
  /** All tool calls made during the interaction */
  toolCalls: ToolCallResult[]
  /** Number of iterations taken */
  iterations: number
  /** Total duration in ms */
  durationMs: number
  /** Model used */
  model: string
}

// =============================================================================
// TOOL EXECUTOR INTERFACE
// =============================================================================

/**
 * Interface for tool execution
 * Allows different execution strategies (local, MCP, etc.)
 */
export interface ToolExecutor {
  /** Execute a single tool call */
  execute(call: ToolCallRequest, context: ToolContext): Promise<ToolCallResult>
  /** Execute multiple tool calls (potentially in parallel) */
  executeMany?(
    calls: ToolCallRequest[],
    context: ToolContext
  ): Promise<ToolCallResult[]>
}

// =============================================================================
// TOOL REGISTRY INTERFACE
// =============================================================================

/**
 * Interface for tool registry
 */
export interface ToolRegistry {
  /** Register a tool */
  register<T, R>(tool: Tool<T, R>): void
  /** Unregister a tool */
  unregister(name: string): boolean
  /** Get a tool by name */
  get(name: string): Tool | undefined
  /** Get all registered tools */
  getAll(): Tool[]
  /** Get tools as JSON Schema for LLM */
  toJSONSchema(): ToolDefinition[]
  /** Check if a tool exists */
  has(name: string): boolean
  /** Clear all tools */
  clear(): void
}

/**
 * Tool definition in JSON Schema format (for LLM)
 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JSONSchema
  }
}

// =============================================================================
// MCP BRIDGE TYPES
// =============================================================================

/**
 * MCP Tool definition (from @modelcontextprotocol/sdk)
 */
export interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/**
 * MCP Client interface (subset we need)
 */
export interface MCPClientLike {
  listTools(): Promise<{ tools: MCPToolDefinition[] }>
  callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text?: string }> }>
}

// =============================================================================
// PROVIDER TYPES (for future extensibility)
// =============================================================================

/**
 * Provider interface for different AI services
 */
export interface ToolProvider {
  /** Provider name */
  name: string
  /** Whether provider supports tools */
  supportsTools: boolean
  /** Run prompt with tools */
  runWithTools(
    prompt: string,
    tools: Tool[],
    options?: RunWithToolsOptions
  ): Promise<RunWithToolsResult>
}

/**
 * Workers AI specific types
 */
export interface WorkersAIBinding {
  run(model: string, input: unknown): Promise<unknown>
}
