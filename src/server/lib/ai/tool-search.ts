/**
 * Tool Search — progressive tool disclosure for agents
 *
 * Pattern from Matt Carey's "Every API Is a Tool for Agents" talk
 * (Cloudflare AI Engineer 2026): instead of injecting all 60+ tool
 * definitions into the model's context every turn, expose a small
 * "core" set + a `find_tools(query)` search tool. The agent searches
 * for what it needs, and prepareStep activates discovered tools on
 * subsequent steps.
 *
 * Why it matters here: chat agents have ~60 tools (chat catalog) +
 * any per-user MCP connections. Each tool's name + description costs
 * input tokens every turn. Tool Search drops that to ~10 always-on
 * tools, with the rest loaded on demand. Typical savings: 8-12K
 * input tokens per turn on a fully-equipped chat session.
 *
 * Composition with the existing privileged-tool gating (PRIVILEGED_TOOL_NAMES
 * in `prepare-step.ts`) is straightforward — both contribute to the
 * `activeTools` set per step. Discovered + privileged-unlocked + core
 * = visible-to-LLM.
 *
 * Wired into the chat module's prepareStep (`agent.ts`). AutonomousAgent
 * doesn't use it yet; the fix is to thread the same prepareStep call
 * into AutonomousAgent.runOnce. Deferred since AutonomousAgent
 * subclasses tend to ship smaller curated tool catalogs (10-20 tools)
 * where the savings are marginal.
 */
import { z } from 'zod'
import { Search } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

/**
 * The core tool set — always visible to the agent regardless of search.
 *
 * Add a tool here when:
 *   - It's the entry point to discover others (find_tools)
 *   - It's a one-shot terminator the agent should always know about (done)
 *   - It's a UI tool whose output becomes part of the assistant's
 *     visible response (show_*)
 *   - It's cheap utility the agent uses often regardless of intent
 *     (get_server_time, calculate)
 *
 * Do NOT add specialised tools (Gmail send, image gen, web search).
 * Those should be searched + activated on demand.
 */
export const CORE_TOOL_NAMES = new Set<string>([
  // Discovery
  'find_tools',
  'list_tools',
  // Terminators / control
  'done',
  // Cheap utilities the model reaches for instinctively
  'get_server_time',
  'calculate',
  // UI tools — output IS the visible response, hide from search
  'show_link',
  'show_image',
  'show_image_card',
  'show_map',
  'show_business_card',
  // Skill loader (already an on-demand mechanism for skill bodies)
  'load_skill',
  // Memory + scratch — agent shouldn't have to "discover" how to remember
  'recall',
  'remember',
])

/**
 * The shape of a single tool surfaced by find_tools to the agent.
 * Keep this lean — every byte costs input tokens since it's returned
 * to the model.
 */
export interface SearchableTool {
  name: string
  description: string
}

/**
 * Build the find_tools tool from a snapshot of the full catalog.
 *
 * The snapshot is captured at call site (typically agent build time)
 * so find_tools doesn't close over a mutable record. Searching is a
 * lower-cased substring match on name + description; for richer
 * relevance scoring fork-users can swap in something heavier.
 *
 * Tools in CORE_TOOL_NAMES are excluded from search results — they're
 * already always-active, no point reminding the model they exist.
 */
export function buildFindToolsTool(
  catalog: SearchableTool[]
): ToolDefinition<
  { query: string; limit?: number },
  { matches: SearchableTool[]; total: number; truncated: boolean }
> {
  // Snapshot the searchable subset once. Filtering on every call
  // would do the work N times for the same input.
  const searchable = catalog.filter((t) => !CORE_TOOL_NAMES.has(t.name))

  return {
    name: 'find_tools',
    description:
      'Search the available tool registry by keyword. Returns matching tool names + descriptions you can then call directly. Use when you need a capability not already in your default toolkit (Gmail, Calendar, Drive, Notion, web_search, image generation, browser, etc). Cheaper than guessing — search for "email", "calendar", "image" rather than calling random tool names.',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(100)
        .describe(
          'Keyword(s) to search tool names + descriptions for (e.g. "email", "calendar event", "image gen").'
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Max matches to return. Default 8.'),
    }),
    outputSchema: z.object({
      matches: z.array(z.object({ name: z.string(), description: z.string() })),
      total: z.number(),
      truncated: z.boolean(),
    }),
    execute: async ({ query, limit = 8 }) => {
      const q = query.toLowerCase().trim()
      // Tokenise on whitespace so multi-word queries ("swarm batch task")
      // score against each token independently. Single-substring match
      // (the previous shape) returned 0 hits for any phrase the agent
      // tried with 2+ words. Tokens with <2 chars are dropped as noise.
      const tokens = q.split(/\s+/).filter((t) => t.length >= 2)
      if (tokens.length === 0) {
        return { matches: [], total: 0, truncated: false }
      }
      const scored: Array<{ tool: SearchableTool; score: number }> = []
      for (const tool of searchable) {
        const nameLower = tool.name.toLowerCase()
        const descLower = tool.description.toLowerCase()
        let score = 0
        // Exact whole-query name match wins big — preserved from v1.
        if (nameLower === q) score += 200
        // Per-token scoring across name + description + word parts.
        for (const tok of tokens) {
          if (nameLower === tok) score += 100
          else if (nameLower.includes(tok)) score += 30
          if (descLower.includes(tok)) score += 10
          for (const part of nameLower.split(/[_\-/]/)) {
            if (part === tok) score += 25
            else if (part.startsWith(tok)) score += 15
          }
        }
        if (score > 0) scored.push({ tool, score })
      }
      scored.sort((a, b) => b.score - a.score)
      const matches = scored.slice(0, limit).map((s) => s.tool)
      return {
        matches,
        total: scored.length,
        truncated: scored.length > limit,
      }
    },
    render: { icon: Search, displayName: 'Find Tools' },
  }
}

/**
 * Build the list_tools tool — a sibling to find_tools that enumerates
 * the catalog by category prefix (or shows everything paginated). Use
 * cases:
 *   - "show me all gmail tools" → category='gmail_'
 *   - "what tools exist?" → no filter, paginate
 *
 * Returns tool name + description per match. Same activation contract
 * as find_tools — anything surfaced becomes callable on subsequent steps.
 */
export function buildListToolsTool(
  catalog: SearchableTool[]
): ToolDefinition<
  { category?: string; offset?: number; limit?: number },
  { tools: SearchableTool[]; total: number; offset: number; truncated: boolean }
> {
  const searchable = catalog.filter((t) => !CORE_TOOL_NAMES.has(t.name))

  return {
    name: 'list_tools',
    description:
      'Enumerate available tools by category prefix or paginate the full catalog. Use to explore "what tools do I have?" — e.g. category="gmail_" lists every Gmail tool. Returns name + description per tool. For keyword search, prefer find_tools.',
    inputSchema: z.object({
      category: z
        .string()
        .max(40)
        .optional()
        .describe(
          'Optional name prefix filter, e.g. "gmail_", "drive_", "calendar_", "image_". Omit for the full catalog.'
        ),
      offset: z.number().int().min(0).optional().describe('Pagination offset. Default 0.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Max tools to return. Default 20.'),
    }),
    outputSchema: z.object({
      tools: z.array(z.object({ name: z.string(), description: z.string() })),
      total: z.number(),
      offset: z.number(),
      truncated: z.boolean(),
    }),
    execute: async ({ category, offset = 0, limit = 20 }) => {
      const filter = category?.toLowerCase().trim()
      const filtered = filter
        ? searchable.filter((t) => t.name.toLowerCase().startsWith(filter))
        : searchable
      const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))
      const slice = sorted.slice(offset, offset + limit)
      return {
        tools: slice,
        total: sorted.length,
        offset,
        truncated: offset + slice.length < sorted.length,
      }
    },
    render: { icon: Search, displayName: 'List Tools' },
  }
}

/**
 * Extract tool names that have been "discovered" by prior find_tools or
 * list_tools calls in this run. Walks the agent's step history looking
 * at discovery-tool results.
 *
 * Returns the union across all calls — once discovered, a tool stays
 * activated for the rest of the run. Forgetting would require the
 * agent to re-search for the same tool every step, which defeats the
 * purpose.
 */
const DISCOVERY_TOOL_NAMES = new Set<string>(['find_tools', 'list_tools'])

export function extractDiscoveredToolNames(
  steps: Array<{
    toolCalls?: ReadonlyArray<{ toolName: string }>
    toolResults?: ReadonlyArray<{ toolName: string; output?: unknown }>
  }>
): Set<string> {
  const discovered = new Set<string>()
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      if (!DISCOVERY_TOOL_NAMES.has(result.toolName)) continue
      // Both find_tools and list_tools return arrays of {name, description};
      // the field name differs (matches vs tools).
      const out = result.output as
        | { matches?: Array<{ name?: string }>; tools?: Array<{ name?: string }> }
        | undefined
      const list = out?.matches ?? out?.tools
      if (!list) continue
      for (const m of list) {
        if (typeof m.name === 'string') discovered.add(m.name)
      }
    }
  }
  return discovered
}

// AgentContext is unused at module scope — it's exposed only as the
// 2nd arg to execute via the ToolDefinition contract. The import
// would otherwise be flagged as unused.
export type _ = AgentContext
