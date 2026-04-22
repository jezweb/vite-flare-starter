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
  summary: (output) => {
    if (!isWebSearchOutput(output)) return null
    const n = output.count ?? output.results?.length ?? 0
    if (n === 0) return 'no results'
    return `${n} ${n === 1 ? 'result' : 'results'}`
  },
  expanded: ({ output }) => {
    if (!isWebSearchOutput(output)) return null
    // WebSearchResults already has its own header + collapsible body, so we
    // render it bare inside our expanded card. The user sees a consistent
    // outer shell now.
    return <WebSearchResults output={output} />
  },
}
