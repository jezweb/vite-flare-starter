/**
 * MCP Base Utilities
 *
 * Shared utilities for MCP (Model Context Protocol) servers.
 * Reduces duplication across all MCP server implementations.
 *
 * Features:
 * - Shared JSON-RPC request handler
 * - Tool registry pattern (avoids SDK internals)
 * - SSE transport helpers
 * - Standardized error responses
 * - Pagination metadata helpers
 */

import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

// MCP Protocol version
export const MCP_PROTOCOL_VERSION = '2024-11-05'

// ============================================
// TOOL REGISTRY TYPES
// ============================================

export type ToolCallback<T = Record<string, unknown>> = (
  params: T
) => Promise<MCPToolResult>

export interface RegisteredTool {
  name: string
  description: string
  inputSchema: z.ZodObject<any>
  callback: ToolCallback
}

export type ToolRegistry = Map<string, RegisteredTool>

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

// ============================================
// TOOL REGISTRY HELPERS
// ============================================

/**
 * Create a new tool registry
 */
export function createToolRegistry(): ToolRegistry {
  return new Map()
}

/**
 * Register a tool in the registry
 */
export function registerTool<T extends z.ZodRawShape>(
  registry: ToolRegistry,
  name: string,
  description: string,
  inputSchema: z.ZodObject<T>,
  callback: ToolCallback<z.infer<z.ZodObject<T>>>
): void {
  registry.set(name, {
    name,
    description,
    inputSchema,
    callback: callback as ToolCallback,
  })
}

// ============================================
// RESPONSE BUILDERS
// ============================================

/**
 * Build a successful MCP tool response
 */
export function successResponse<T>(data: T): MCPToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, ...data }),
      },
    ],
  }
}

/**
 * Build an error MCP tool response
 */
export function errorResponse(
  error: string,
  details?: Record<string, unknown>
): MCPToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error, ...details }),
      },
    ],
    isError: true,
  }
}

/**
 * Build a list response with pagination metadata
 */
export function listResponse<T>(
  items: T[],
  options: {
    itemKey?: string
    offset?: number
    limit?: number
    totalCount?: number
    query?: string
  } = {}
): MCPToolResult {
  const {
    itemKey = 'items',
    offset = 0,
    limit = items.length,
    totalCount,
    query,
  } = options

  const pagination =
    totalCount !== undefined
      ? {
          count: items.length,
          totalCount,
          offset,
          limit,
          hasMore: offset + items.length < totalCount,
        }
      : {
          count: items.length,
        }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          ...(query !== undefined ? { query } : {}),
          ...pagination,
          [itemKey]: items,
        }),
      },
    ],
  }
}

// ============================================
// JSON-RPC HANDLER
// ============================================

export interface MCPServerInfo {
  name: string
  version: string
  instructions: string
}

export interface JsonRpcRequest {
  jsonrpc: string
  method: string
  params?: Record<string, unknown>
  id?: string | number | null
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
  id: string | number | null
}

/**
 * Convert Zod schema to JSON Schema for MCP tools/list response
 */
export function zodToJsonSchema(schema: z.ZodObject<any>): Record<string, any> {
  const shape = schema.shape
  const properties: Record<string, any> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny
    properties[key] = zodTypeToJsonSchema(zodType)

    // Check if field is required (not optional/nullable)
    if (!zodType.isOptional() && !zodType.isNullable()) {
      required.push(key)
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

function zodTypeToJsonSchema(zodType: z.ZodTypeAny): Record<string, any> {
  const def = zodType._def

  // Handle optional wrapper
  if (def.typeName === 'ZodOptional') {
    return zodTypeToJsonSchema(def.innerType)
  }

  // Handle nullable wrapper
  if (def.typeName === 'ZodNullable') {
    const inner = zodTypeToJsonSchema(def.innerType)
    return { ...inner, nullable: true }
  }

  // Handle default wrapper
  if (def.typeName === 'ZodDefault') {
    const inner = zodTypeToJsonSchema(def.innerType)
    return { ...inner, default: def.defaultValue() }
  }

  // Handle string
  if (def.typeName === 'ZodString') {
    const result: Record<string, any> = { type: 'string' }
    for (const check of def.checks || []) {
      if (check.kind === 'min') result['minLength'] = check.value
      if (check.kind === 'max') result['maxLength'] = check.value
      if (check.kind === 'email') result['format'] = 'email'
      if (check.kind === 'url') result['format'] = 'uri'
      if (check.kind === 'uuid') result['format'] = 'uuid'
    }
    if (zodType.description) result['description'] = zodType.description
    return result
  }

  // Handle number
  if (def.typeName === 'ZodNumber') {
    const result: Record<string, any> = { type: 'number' }
    for (const check of def.checks || []) {
      if (check.kind === 'min') result['minimum'] = check.value
      if (check.kind === 'max') result['maximum'] = check.value
      if (check.kind === 'int') result['type'] = 'integer'
    }
    if (zodType.description) result['description'] = zodType.description
    return result
  }

  // Handle boolean
  if (def.typeName === 'ZodBoolean') {
    const result: Record<string, any> = { type: 'boolean' }
    if (zodType.description) result['description'] = zodType.description
    return result
  }

  // Handle enum
  if (def.typeName === 'ZodEnum') {
    const result: Record<string, any> = {
      type: 'string',
      enum: def.values,
    }
    if (zodType.description) result['description'] = zodType.description
    return result
  }

  // Handle array
  if (def.typeName === 'ZodArray') {
    const result: Record<string, any> = {
      type: 'array',
      items: zodTypeToJsonSchema(def.type),
    }
    if (zodType.description) result['description'] = zodType.description
    return result
  }

  // Handle object
  if (def.typeName === 'ZodObject') {
    return zodToJsonSchema(zodType as z.ZodObject<any>)
  }

  // Fallback
  return { type: 'string' }
}

/**
 * Handle JSON-RPC request for MCP
 */
export async function handleJsonRpcRequest(
  request: JsonRpcRequest,
  toolRegistry: ToolRegistry,
  serverInfo: MCPServerInfo
): Promise<JsonRpcResponse | null> {
  const { jsonrpc, method, params, id } = request

  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid Request - must be JSON-RPC 2.0',
      },
      id: id ?? null,
    }
  }

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            serverInfo: {
              name: serverInfo.name,
              version: serverInfo.version,
            },
            capabilities: {
              tools: { listChanged: false },
              resources: { listChanged: false },
              prompts: { listChanged: false },
            },
            instructions: serverInfo.instructions,
          },
          id: id ?? null,
        }
      }

      case 'initialized':
      case 'notifications/cancelled':
        return null

      case 'tools/list': {
        const tools = Array.from(toolRegistry.values()).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: zodToJsonSchema(tool.inputSchema),
        }))

        return {
          jsonrpc: '2.0',
          result: { tools },
          id: id ?? null,
        }
      }

      case 'tools/call': {
        const { name, arguments: args } = params as {
          name: string
          arguments?: Record<string, unknown>
        }

        const result = await executeToolFromRegistry(
          toolRegistry,
          name,
          args || {}
        )

        return {
          jsonrpc: '2.0',
          result,
          id: id ?? null,
        }
      }

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          result: { resources: [] },
          id: id ?? null,
        }

      case 'resources/read':
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Resource not found' },
          id: id ?? null,
        }

      case 'prompts/list':
        return {
          jsonrpc: '2.0',
          result: { prompts: [] },
          id: id ?? null,
        }

      case 'prompts/get':
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Prompt not found' },
          id: id ?? null,
        }

      case 'ping':
        return {
          jsonrpc: '2.0',
          result: {},
          id: id ?? null,
        }

      default:
        return {
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id: id ?? null,
        }
    }
  } catch (error) {
    console.error(`MCP ${serverInfo.name} method ${method} error:`, error)
    return {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      },
      id: id ?? null,
    }
  }
}

/**
 * Execute a tool from the registry
 */
async function executeToolFromRegistry(
  toolRegistry: ToolRegistry,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const tool = toolRegistry.get(toolName)

  if (!tool) {
    return errorResponse(`Tool not found: ${toolName}`)
  }

  // Parse args through the tool's input schema
  let parsedArgs = args
  try {
    parsedArgs = tool.inputSchema.parse(args)
  } catch (parseError) {
    return errorResponse(`Invalid arguments: ${parseError}`)
  }

  // Execute the callback
  return tool.callback(parsedArgs)
}

// ============================================
// SSE TRANSPORT HELPERS
// ============================================

/**
 * Create SSE connection handler for MCP
 */
export function createSSEHandler(basePath: string) {
  return async (c: Context) => {
    const sessionId = crypto.randomUUID()
    const url = new URL(c.req.url)
    const postEndpoint = `${url.protocol}//${url.host}${basePath}/sse`

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'endpoint', data: postEndpoint })
      await stream.writeSSE({ event: 'session', data: sessionId })

      const keepAlive = setInterval(async () => {
        try {
          await stream.writeSSE({ event: 'ping', data: new Date().toISOString() })
        } catch {
          clearInterval(keepAlive)
        }
      }, 30000)

      await new Promise((resolve) => {
        stream.onAbort(() => {
          clearInterval(keepAlive)
          resolve(undefined)
        })
      })
    })
  }
}

/**
 * Create MCP server info endpoint response
 */
export function createServerInfoResponse(
  serverInfo: MCPServerInfo,
  basePath: string,
  tools: Array<{ name: string; description: string }>
) {
  return {
    name: serverInfo.name,
    version: serverInfo.version,
    description: `MCP server for ${serverInfo.name}`,
    transports: {
      streamableHttp: `${basePath}/message`,
      sse: `${basePath}/sse`,
    },
    tools,
    authentication: 'Bearer token required (create via /api/api-tokens)',
  }
}

// ============================================
// TIMESTAMP HELPERS
// ============================================

/**
 * Convert Date to ISO string for consistent API responses
 */
export function toISOString(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

/**
 * Convert Date to Unix timestamp (ms) for legacy compatibility
 */
export function toUnixMs(date: Date | null | undefined): number | null {
  return date ? date.getTime() : null
}

/**
 * Convert Unix timestamp (ms) to Date
 */
export function fromUnixMs(timestamp: number | null | undefined): Date | null {
  return timestamp ? new Date(timestamp) : null
}
