/**
 * MCP Client Integration (Full Spec)
 *
 * Connects to external MCP servers with full spec support:
 * - Tools (discovery + typed schemas + execution)
 * - Resources (list, read, templates)
 * - Prompts (list, get with arguments)
 * - Elicitation (server requesting input during tool execution)
 * - HTTP/SSE transport with OAuth or bearer token auth
 *
 * @example
 * import { createMCPManager } from '@/server/lib/ai/mcp'
 *
 * const mcp = await createMCPManager(env)
 * const tools = mcp.tools           // Spread into streamText({ tools })
 * const resources = await mcp.listResources()
 * const prompt = await mcp.getPrompt('code-review', { language: 'ts' })
 * await mcp.cleanup()               // Close all connections
 */
import { createMCPClient } from '@ai-sdk/mcp'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MCPServerConfig {
  /** Unique identifier for this server */
  id: string
  /** Display name */
  name: string
  /** Server URL (HTTP or SSE endpoint) */
  url: string
  /** Transport type */
  transport: 'http' | 'sse'
  /** Auth method */
  auth?:
    | {
        type: 'bearer'
        token: string
      }
    | {
        type: 'header'
        headers: Record<string, string>
      }
  /** Enable elicitation support */
  elicitation?: boolean
}

interface MCPClientInstance {
  config: MCPServerConfig
  client: Awaited<ReturnType<typeof createMCPClient>>
}

export interface MCPManager {
  /** All tools from all connected servers (spread into streamText) */
  tools: Record<string, unknown>
  /** List resources from all connected servers */
  listResources: () => Promise<
    Array<{ uri: string; name: string; description?: string; server: string }>
  >
  /** Read a specific resource by URI */
  readResource: (uri: string) => Promise<{ contents: unknown }>
  /** List available prompts from all servers */
  listPrompts: () => Promise<Array<{ name: string; description?: string; server: string }>>
  /** Get a specific prompt with arguments */
  getPrompt: (name: string, args?: Record<string, unknown>) => Promise<{ messages: unknown[] }>
  /** Connected server names */
  servers: string[]
  /** Close all connections */
  cleanup: () => Promise<void>
}

// ─── Server Configuration ────────────────────────────────────────────────────

/**
 * Build MCP server configs from environment variables.
 *
 * Convention: MCP_<ID>_URL, MCP_<ID>_TOKEN, MCP_<ID>_TRANSPORT
 *
 * Examples:
 *   MCP_WEATHER_URL=https://weather.mcp.example.com/mcp
 *   MCP_WEATHER_TOKEN=bearer-token-here
 *   MCP_WEATHER_TRANSPORT=http
 *
 *   MCP_BUSINESS_URL=https://business.mcp.example.com/sse
 *   MCP_BUSINESS_TOKEN=api-key-here
 *   MCP_BUSINESS_TRANSPORT=sse
 */
function discoverServers(env: Record<string, unknown>): MCPServerConfig[] {
  const servers: MCPServerConfig[] = []
  const seen = new Set<string>()

  for (const key of Object.keys(env)) {
    const match = key.match(/^MCP_(\w+)_URL$/)
    if (!match) continue

    const id = match[1]!.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)

    const url = env[key] as string
    const token = env[`MCP_${match[1]}_TOKEN`] as string | undefined
    const transport = ((env[`MCP_${match[1]}_TRANSPORT`] as string) || 'http') as 'http' | 'sse'

    servers.push({
      id,
      name: id.replace(/_/g, ' '),
      url,
      transport,
      auth: token ? { type: 'bearer', token } : undefined,
    })
  }

  return servers
}

// ─── MCP Manager ─────────────────────────────────────────────────────────────

/**
 * Create an MCP manager that connects to all configured servers.
 *
 * Returns a unified interface for tools, resources, and prompts
 * across all connected servers. Failed connections are logged
 * but don't prevent other servers from connecting.
 */
export async function createMCPManager(env: Record<string, unknown>): Promise<MCPManager> {
  const serverConfigs = discoverServers(env)
  const clients: MCPClientInstance[] = []
  const allTools: Record<string, unknown> = {}

  // Connect to each server
  for (const config of serverConfigs) {
    try {
      const headers: Record<string, string> = {}
      if (config.auth?.type === 'bearer') {
        headers['Authorization'] = `Bearer ${config.auth.token}`
      } else if (config.auth?.type === 'header') {
        Object.assign(headers, config.auth.headers)
      }

      const client = await createMCPClient({
        transport: {
          type: config.transport,
          url: config.url,
          headers,
        },
        capabilities: config.elicitation ? { elicitation: {} } : undefined,
      })

      clients.push({ config, client })

      // Collect tools
      // NOTE: MCP tool annotations (destructiveHint, readOnlyHint, etc.) are parsed
      // by @ai-sdk/mcp but only annotations.title is currently mapped. When AI SDK
      // adds needsApproval mapping from destructiveHint, it will work automatically.
      const tools = await client.tools()
      Object.assign(allTools, tools)

      console.log(
        JSON.stringify({
          event: 'mcp_connected',
          server: config.name,
          toolCount: Object.keys(tools).length,
        })
      )
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'mcp_connection_failed',
          server: config.name,
          url: config.url,
          error: error instanceof Error ? error.message : String(error),
        })
      )
    }
  }

  return {
    tools: allTools,
    servers: clients.map((c) => c.config.name),

    async listResources() {
      const results: Array<{ uri: string; name: string; description?: string; server: string }> = []
      for (const { config, client } of clients) {
        try {
          const res = await client.listResources()
          if (res?.resources) {
            for (const r of res.resources) {
              results.push({
                uri: r.uri,
                name: r.name,
                description: r.description,
                server: config.name,
              })
            }
          }
        } catch {
          /* server may not support resources */
        }
      }
      return results
    },

    async readResource(uri: string) {
      // Try each server until one responds
      for (const { client } of clients) {
        try {
          return await client.readResource({ uri })
        } catch {
          continue
        }
      }
      throw new Error(`Resource not found: ${uri}`)
    },

    async listPrompts() {
      const results: Array<{ name: string; description?: string; server: string }> = []
      for (const { config, client } of clients) {
        try {
          const res = await client.experimental_listPrompts()
          if (res?.prompts) {
            for (const p of res.prompts) {
              results.push({ name: p.name, description: p.description, server: config.name })
            }
          }
        } catch {
          /* server may not support prompts */
        }
      }
      return results
    },

    async getPrompt(name: string, args?: Record<string, unknown>) {
      for (const { client } of clients) {
        try {
          const result = await client.experimental_getPrompt({ name, arguments: args })
          if (result) return { messages: result.messages }
        } catch {
          continue
        }
      }
      throw new Error(`Prompt not found: ${name}`)
    },

    async cleanup() {
      await Promise.allSettled(clients.map(({ client }) => client.close()))
    },
  }
}

/**
 * Quick helper — just get tools from configured MCP servers.
 * For simple use cases where you only need tools, not resources/prompts.
 */
export async function getMCPTools(env: Record<string, unknown>): Promise<{
  tools: Record<string, unknown>
  cleanup: () => Promise<void>
}> {
  const manager = await createMCPManager(env)
  return { tools: manager.tools, cleanup: manager.cleanup }
}
