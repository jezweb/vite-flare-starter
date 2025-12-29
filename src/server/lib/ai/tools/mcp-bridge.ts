/**
 * MCP Bridge
 *
 * Bridges MCP (Model Context Protocol) servers to the tool calling system.
 * Allows using remote or local MCP tools with Workers AI.
 */

import type {
  Tool,
  ToolContext,
  ToolRegistry,
  MCPToolDefinition,
  MCPClientLike,
  JSONSchema,
} from './types'
import { createToolRegistry } from './registry'

/**
 * Options for creating MCP tools
 */
export interface MCPBridgeOptions {
  /** Prefix for tool names (e.g., "mcp_enquiries_") */
  namePrefix?: string
  /** Tags to add to all tools */
  tags?: string[]
  /** MCP server URL (for metadata) */
  serverUrl?: string
}

/**
 * Convert an MCP tool definition to our Tool format
 */
export function mcpToolToTool(
  mcpTool: MCPToolDefinition,
  client: MCPClientLike,
  options: MCPBridgeOptions = {}
): Tool {
  const name = options.namePrefix
    ? `${options.namePrefix}${mcpTool.name}`
    : mcpTool.name

  return {
    name,
    description: mcpTool.description,
    parameters: mcpTool.inputSchema as JSONSchema,
    execute: async (params: Record<string, unknown>, _context: ToolContext) => {
      const result = await client.callTool(mcpTool.name, params)

      // MCP returns content array, extract text
      const textContent = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n')

      // Try to parse as JSON if it looks like JSON
      if (textContent.startsWith('{') || textContent.startsWith('[')) {
        try {
          return JSON.parse(textContent)
        } catch {
          return textContent
        }
      }

      return textContent
    },
    metadata: {
      source: 'mcp',
      mcpServerUrl: options.serverUrl,
      tags: options.tags,
    },
  }
}

/**
 * Create a tool registry from an MCP client
 *
 * Fetches all tools from the MCP server and converts them to our Tool format.
 */
export async function createMCPToolRegistry(
  client: MCPClientLike,
  options: MCPBridgeOptions = {}
): Promise<ToolRegistry> {
  const registry = createToolRegistry()

  // Fetch available tools from MCP server
  const { tools: mcpTools } = await client.listTools()

  for (const mcpTool of mcpTools) {
    const tool = mcpToolToTool(mcpTool, client, options)
    registry.register(tool)
  }

  return registry
}

/**
 * Create tools from multiple MCP clients
 */
export async function createMCPToolRegistryFromMany(
  clients: Array<{ client: MCPClientLike; options?: MCPBridgeOptions }>
): Promise<ToolRegistry> {
  const registry = createToolRegistry()

  for (const { client, options } of clients) {
    const { tools: mcpTools } = await client.listTools()

    for (const mcpTool of mcpTools) {
      const tool = mcpToolToTool(mcpTool, client, options || {})
      registry.register(tool)
    }
  }

  return registry
}

/**
 * MCP Client wrapper for local MCP servers
 *
 * Use this to call your own MCP servers that are part of the same codebase.
 * This avoids HTTP overhead for local calls.
 */
export interface LocalMCPServer {
  listTools(): Promise<{ tools: MCPToolDefinition[] }>
  callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text?: string }> }>
}

/**
 * Create a local MCP client from server functions
 */
export function createLocalMCPClient(server: LocalMCPServer): MCPClientLike {
  return {
    listTools: () => server.listTools(),
    callTool: (name, args) => server.callTool(name, args),
  }
}

/**
 * OAuth token refresh callback type
 */
export type OAuthTokenRefresher = () => Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn?: number
} | null>

/**
 * Create an MCP client that calls your local MCP HTTP endpoints
 *
 * This is useful for testing or when you want to use your MCP servers
 * through the HTTP transport.
 */
export function createHTTPMCPClient(
  baseUrl: string,
  options: {
    headers?: Record<string, string>
    timeout?: number
  } = {}
): MCPClientLike {
  const { headers = {}, timeout = 30000 } = options

  return {
    async listTools() {
      const response = await fetch(`${baseUrl}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: crypto.randomUUID(),
        }),
        signal: AbortSignal.timeout(timeout),
      })

      if (!response.ok) {
        throw new Error(`MCP request failed: ${response.status}`)
      }

      const data = (await response.json()) as any
      if (data.error) {
        throw new Error(`MCP error: ${data.error.message}`)
      }

      return { tools: data.result.tools }
    },

    async callTool(name: string, args: Record<string, unknown>) {
      const response = await fetch(`${baseUrl}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name, arguments: args },
          id: crypto.randomUUID(),
        }),
        signal: AbortSignal.timeout(timeout),
      })

      if (!response.ok) {
        throw new Error(`MCP request failed: ${response.status}`)
      }

      const data = (await response.json()) as any
      if (data.error) {
        throw new Error(`MCP error: ${data.error.message}`)
      }

      return data.result
    },
  }
}

/**
 * Create an MCP client with OAuth support
 *
 * This client automatically handles OAuth token refresh when tokens expire.
 * Use this for external MCP servers that require OAuth authentication.
 */
export function createOAuthHTTPMCPClient(
  baseUrl: string,
  options: {
    getAccessToken: () => Promise<string | null>
    refreshToken?: OAuthTokenRefresher
    onTokenRefreshed?: (tokens: { accessToken: string; refreshToken?: string; expiresIn?: number }) => Promise<void>
    additionalHeaders?: Record<string, string>
    timeout?: number
  }
): MCPClientLike {
  const { getAccessToken, refreshToken, onTokenRefreshed, additionalHeaders = {}, timeout = 30000 } = options

  async function makeAuthenticatedRequest(endpoint: string, body: unknown): Promise<any> {
    let accessToken = await getAccessToken()

    if (!accessToken) {
      // Try to refresh if no access token
      if (refreshToken) {
        const newTokens = await refreshToken()
        if (newTokens && onTokenRefreshed) {
          await onTokenRefreshed(newTokens)
          accessToken = newTokens.accessToken
        }
      }
      if (!accessToken) {
        throw new Error('No access token available')
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      ...additionalHeaders,
    }

    let response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })

    // If 401 Unauthorized, try to refresh token and retry
    if (response.status === 401 && refreshToken) {
      const newTokens = await refreshToken()
      if (newTokens) {
        if (onTokenRefreshed) {
          await onTokenRefreshed(newTokens)
        }
        headers['Authorization'] = `Bearer ${newTokens.accessToken}`
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        })
      }
    }

    if (!response.ok) {
      throw new Error(`MCP request failed: ${response.status}`)
    }

    const data = await response.json()
    if ((data as any).error) {
      throw new Error(`MCP error: ${(data as any).error.message}`)
    }

    return data
  }

  return {
    async listTools() {
      const data = await makeAuthenticatedRequest(`${baseUrl}/message`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: crypto.randomUUID(),
      })
      return { tools: data.result.tools }
    },

    async callTool(name: string, args: Record<string, unknown>) {
      const data = await makeAuthenticatedRequest(`${baseUrl}/message`, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name, arguments: args },
        id: crypto.randomUUID(),
      })
      return data.result
    },
  }
}

// Note: createRemoteMCPClient requires @modelcontextprotocol/sdk which is optional.
// Install with: pnpm add @modelcontextprotocol/sdk
// Then uncomment the function below.

// /**
//  * Create an MCP client from the official SDK
//  *
//  * Use this for connecting to remote MCP servers using the official transport.
//  */
// export async function createRemoteMCPClient(
//   url: string,
//   options: {
//     name?: string
//     version?: string
//   } = {}
// ): Promise<MCPClientLike> {
//   const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
//   const { StreamableHTTPClientTransport } = await import(
//     '@modelcontextprotocol/sdk/client/streamableHttp.js'
//   )
//
//   const transport = new StreamableHTTPClientTransport(new URL(url))
//   const client = new Client(
//     {
//       name: options.name || 'vite-flare-starter',
//       version: options.version || '1.0.0',
//     },
//     { capabilities: {} }
//   )
//
//   await client.connect(transport)
//
//   return {
//     async listTools() {
//       const result = await client.listTools()
//       return { tools: result.tools as MCPToolDefinition[] }
//     },
//
//     async callTool(name: string, args: Record<string, unknown>) {
//       const result = await client.callTool({ name, arguments: args })
//       const content = result.content as Array<{ type: string; text?: string }>
//       return {
//         content: content.map((c: { type: string; text?: string }) => ({
//           type: c.type,
//           text: c.type === 'text' ? c.text : undefined,
//         })),
//       }
//     },
//   }
// }

/**
 * Adapter to use your existing MCP server registrations as tools
 *
 * This bridges your existing MCP server code (like registerEnquiryTools)
 * to the tool calling system without HTTP overhead.
 */
export function createMCPServerAdapter(
  toolsConfig: Array<{
    name: string
    description: string
    inputSchema: JSONSchema
    handler: (params: Record<string, unknown>) => Promise<any>
  }>,
  options: MCPBridgeOptions = {}
): ToolRegistry {
  const registry = createToolRegistry()

  for (const config of toolsConfig) {
    const name = options.namePrefix
      ? `${options.namePrefix}${config.name}`
      : config.name

    registry.register({
      name,
      description: config.description,
      parameters: config.inputSchema,
      execute: async (params: Record<string, unknown>, _context) => {
        return config.handler(params)
      },
      metadata: {
        source: 'mcp',
        mcpServerUrl: options.serverUrl,
        tags: options.tags,
      },
    })
  }

  return registry
}
