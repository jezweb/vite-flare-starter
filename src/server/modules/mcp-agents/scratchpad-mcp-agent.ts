/**
 * ScratchpadMcpAgent — agent-as-MCP-server worked example
 *
 * Demonstrates the inverse of the chat module's MCP **client** pattern:
 * here the agent itself IS an MCP server. External MCP clients
 * (other Claude Code sessions, Anthropic Workbench, custom tools)
 * connect over Streamable-HTTP and call our tools.
 *
 * Why expose your starter's data over MCP?
 *   - Other Claude Code sessions can use this app's data without a
 *     custom integration (e.g. Anthro reads / writes a shared
 *     scratchpad here)
 *   - The MCP protocol handles auth, tool discovery, and structured
 *     I/O — much less plumbing than rolling a REST API for every
 *     external integration
 *   - Each instance is a stateful Durable Object — clients reconnect
 *     to the SAME scratchpad, not a fresh one
 *
 * What this example exposes:
 *   - `get_scratchpad()` → current text
 *   - `set_scratchpad(text)` → replace
 *   - `append_to_scratchpad(text)` → append a section with timestamp
 *   - `clear_scratchpad()` → reset
 *
 * The point isn't the scratchpad — it's the MCP-server pattern. Forks
 * adapt this to expose whatever app data they want over MCP: notes,
 * todos, conversation history, R2 files, search indices.
 *
 * Connect to it from Claude Code:
 *   claude mcp add scratchpad https://your-worker.dev/mcp/scratchpad/<userId>
 *
 * Wired in src/server/index.ts via `ScratchpadMcpAgent.serve('/mcp/scratchpad', ...)`.
 *
 * **Auth note**: this worked example does NOT gate the MCP endpoint —
 * anyone with the URL can call it. Production forks MUST add an OAuth
 * provider (the SDK exports `AgentMcpOAuthProvider`) or wrap the path
 * in your auth middleware before exposing real data.
 */
import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

interface Env {
  // McpAgent extends Agent which extends Server — bindings flow
  // through but no specific deps for this example.
}

interface ScratchpadState {
  /** Current scratchpad text. Empty string when fresh. */
  text: string
  /** Last-modified timestamp (ms). For show in get_scratchpad output. */
  lastModified: number
  /** Modification counter — increments on every write. Useful for
   *  ETag-style conditional updates, not exposed yet. */
  revision: number
}

export class ScratchpadMcpAgent extends McpAgent<Env, ScratchpadState> {
  static readonly className = 'ScratchpadMcpAgent'

  override initialState: ScratchpadState = {
    text: '',
    lastModified: 0,
    revision: 0,
  }

  /**
   * The MCP server instance — the SDK uses this for protocol
   * negotiation. Created once per DO; tools are registered in init().
   */
  server = new McpServer({
    name: 'scratchpad',
    version: '1.0.0',
  })

  /**
   * Register tools on the McpServer. Called once when the DO wakes
   * up, before any client connects. Tool callbacks close over `this`
   * so they can read/write agent state.
   */
  async init(): Promise<void> {
    this.server.registerTool(
      'get_scratchpad',
      {
        description: 'Returns the current scratchpad text + metadata.',
        inputSchema: {},
        outputSchema: {
          text: z.string(),
          lastModified: z.number(),
          revision: z.number(),
        },
      },
      async () => ({
        content: [
          {
            type: 'text' as const,
            text: this.state.text || '(empty)',
          },
        ],
        structuredContent: {
          text: this.state.text,
          lastModified: this.state.lastModified,
          revision: this.state.revision,
        },
      })
    )

    this.server.registerTool(
      'set_scratchpad',
      {
        description: 'Replace the entire scratchpad with new text.',
        inputSchema: {
          text: z.string().max(50_000).describe('New scratchpad contents.'),
        },
        outputSchema: {
          revision: z.number(),
        },
      },
      async ({ text }) => {
        this.setState({
          text,
          lastModified: Date.now(),
          revision: this.state.revision + 1,
        })
        return {
          content: [{ type: 'text' as const, text: `Scratchpad set (${text.length} chars).` }],
          structuredContent: { revision: this.state.revision },
        }
      }
    )

    this.server.registerTool(
      'append_to_scratchpad',
      {
        description: 'Append a new section to the scratchpad (with a date heading).',
        inputSchema: {
          text: z.string().min(1).max(20_000).describe('Section content to append.'),
          heading: z.string().max(120).optional().describe('Optional section heading.'),
        },
        outputSchema: {
          revision: z.number(),
          totalChars: z.number(),
        },
      },
      async ({ text, heading }) => {
        const now = new Date().toISOString()
        const headingLine = heading ? `## ${heading} — ${now}` : `## ${now}`
        const separator = this.state.text ? '\n\n' : ''
        const next = `${this.state.text}${separator}${headingLine}\n\n${text}`
        this.setState({
          text: next,
          lastModified: Date.now(),
          revision: this.state.revision + 1,
        })
        return {
          content: [{ type: 'text' as const, text: `Appended (${text.length} chars).` }],
          structuredContent: {
            revision: this.state.revision,
            totalChars: next.length,
          },
        }
      }
    )

    this.server.registerTool(
      'clear_scratchpad',
      {
        description: 'Wipe the scratchpad. Cannot be undone.',
        inputSchema: {},
        outputSchema: {
          revision: z.number(),
        },
      },
      async () => {
        this.setState({
          text: '',
          lastModified: Date.now(),
          revision: this.state.revision + 1,
        })
        return {
          content: [{ type: 'text' as const, text: 'Scratchpad cleared.' }],
          structuredContent: { revision: this.state.revision },
        }
      }
    )
  }
}
