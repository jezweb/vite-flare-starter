/**
 * MCP Utilities
 *
 * Shared utilities for building MCP (Model Context Protocol) servers.
 */

export {
  // Constants
  MCP_PROTOCOL_VERSION,

  // Types
  type ToolCallback,
  type RegisteredTool,
  type ToolRegistry,
  type MCPToolResult,
  type MCPServerInfo,
  type JsonRpcRequest,
  type JsonRpcResponse,

  // Tool Registry
  createToolRegistry,
  registerTool,

  // Response Builders
  successResponse,
  errorResponse,
  listResponse,

  // JSON-RPC Handler
  handleJsonRpcRequest,
  zodToJsonSchema,

  // SSE Helpers
  createSSEHandler,
  createServerInfoResponse,

  // Timestamp Helpers
  toISOString,
  toUnixMs,
  fromUnixMs,
} from './base'
