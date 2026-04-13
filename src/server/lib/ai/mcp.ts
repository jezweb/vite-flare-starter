/**
 * MCP Client Integration
 *
 * Connects to external MCP servers and makes their tools available
 * to the AI SDK streamText/generateText calls.
 *
 * MCP servers can provide domain-specific tools (weather, business lookup,
 * database queries, etc.) without writing tool code in your app.
 *
 * @example
 * import { getMCPTools } from '@/server/lib/ai/mcp'
 *
 * // In a route handler:
 * const mcpTools = await getMCPTools(env)
 * const result = streamText({
 *   model,
 *   tools: { ...localTools, ...mcpTools },
 *   messages,
 * })
 */
import { createMCPClient } from '@ai-sdk/mcp'

interface MCPServerConfig {
  /** Display name for the server */
  name: string
  /** Server URL (HTTP transport) */
  url: string
  /** Optional auth headers */
  headers?: Record<string, string>
}

/**
 * MCP server registry — add your MCP servers here.
 *
 * Each server provides tools that the AI can call during conversations.
 * Set the URL to your MCP server endpoint (HTTP Streamable transport).
 *
 * Environment variables for server URLs make it easy to configure per-environment.
 */
function getMCPServers(_env: Record<string, unknown>): MCPServerConfig[] {
  const servers: MCPServerConfig[] = []

  // Example: add MCP servers from environment variables
  // if (env.MCP_WEATHER_URL) {
  //   servers.push({
  //     name: 'weather',
  //     url: env.MCP_WEATHER_URL as string,
  //   })
  // }
  //
  // if (env.MCP_BUSINESS_URL) {
  //   servers.push({
  //     name: 'business',
  //     url: env.MCP_BUSINESS_URL as string,
  //     headers: { Authorization: `Bearer ${env.MCP_BUSINESS_TOKEN}` },
  //   })
  // }

  return servers
}

/**
 * Connect to all configured MCP servers and collect their tools.
 *
 * Returns a flat object of tools ready to spread into streamText({ tools }).
 * Handles connection errors gracefully — a failed server doesn't block others.
 *
 * Important: MCP clients should be closed after use. The returned `cleanup`
 * function closes all connections.
 */
export async function getMCPTools(env: Record<string, unknown>): Promise<{
  tools: Record<string, unknown>
  cleanup: () => Promise<void>
}> {
  const servers = getMCPServers(env)
  if (servers.length === 0) {
    return { tools: {}, cleanup: async () => {} }
  }

  const clients: Array<{ close: () => Promise<void> }> = []
  const allTools: Record<string, unknown> = {}

  for (const server of servers) {
    try {
      const client = await createMCPClient({
        transport: {
          type: 'http',
          url: server.url,
          headers: server.headers,
        },
      })
      clients.push(client)

      const tools = await client.tools()
      Object.assign(allTools, tools)

      console.log(JSON.stringify({
        event: 'mcp_connected',
        server: server.name,
        toolCount: Object.keys(tools).length,
      }))
    } catch (error) {
      console.error(JSON.stringify({
        event: 'mcp_connection_failed',
        server: server.name,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  return {
    tools: allTools,
    cleanup: async () => {
      await Promise.allSettled(clients.map((c) => c.close()))
    },
  }
}
