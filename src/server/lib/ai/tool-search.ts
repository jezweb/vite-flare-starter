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
export function buildFindToolsTool(catalog: SearchableTool[]): ToolDefinition<
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
        .describe('Keyword(s) to search tool names + descriptions for (e.g. "email", "calendar event", "image gen").'),
      limit: z.number().int().min(1).max(20).optional().describe('Max matches to return. Default 8.'),
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
 * Extract tool names that have been "discovered" by prior find_tools
 * calls in this run. Walks the agent's step history looking at
 * find_tools tool results.
 *
 * Returns the union across all calls — once discovered, a tool stays
 * activated for the rest of the run. Forgetting would require the
 * agent to re-search for the same tool every step, which defeats the
 * purpose.
 */
export function extractDiscoveredToolNames(
  steps: Array<{
    toolCalls?: ReadonlyArray<{ toolName: string }>
    toolResults?: ReadonlyArray<{ toolName: string; output?: unknown }>
  }>,
): Set<string> {
  const discovered = new Set<string>()
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      if (result.toolName !== 'find_tools') continue
      const out = result.output as { matches?: Array<{ name?: string }> } | undefined
      if (!out?.matches) continue
      for (const m of out.matches) {
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
