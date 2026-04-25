/**
 * Web/places search tool renderers. Wraps the existing WebSearchResults
 * component so web_search gets summary-on-pill treatment without a rewrite.
 */
import { Globe } from 'lucide-react'
import type { ToolRenderer } from './_shared'
import {
  WebSearchResults,
  isWebSearchOutput,
} from '../chat-ui/WebSearchResults'

export const webSearchRenderer: ToolRenderer = {
  // Match by BOTH tool name and shape — covers `web_search`, `search`, and
  // MCP-registered search variants that return the same duck-typed output.
  match: (toolName, output) =>
    (toolName === 'web_search' || toolName === 'search') && isWebSearchOutput(output),
  icon: Globe,
  displayName: 'Web Search',
  // bare: WebSearchResults owns its own header + collapsible chrome (globe
  // icon, query as title, "N results" count, expand chevron). Wrapping it
  // in a ToolCard Collapsible would create a redundant outer pill. Matches
  // claude.ai's flat single-level treatment of inline search results.
  bare: true,
  expanded: ({ output }) => {
    if (!isWebSearchOutput(output)) return null
    return <WebSearchResults output={output} />
  },
}
