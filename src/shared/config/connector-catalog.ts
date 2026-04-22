/**
 * MCP Connector catalog — a small set of public/example MCP servers
 * users can connect in one click.
 *
 * ## Philosophy
 *
 * The starter's value in the Connectors feature is the *infrastructure* —
 * OAuth 2.1 + PKCE + DCR, bearer token fallback, per-tool policies,
 * encrypted at-rest tokens. The catalogue is intentionally small: it
 * exists as a "this works end-to-end" example and a template to extend.
 *
 * ## For forkers: three ways to get tools into your chat
 *
 * 1. **Add custom connector** — the main path. Paste any MCP server URL
 *    from the community (Smithery, Anthropic reference servers, your own
 *    Cloudflare Workers MCP). The Connectors UI handles OAuth or bearer
 *    auth automatically after a probe.
 * 2. **Extend this catalogue** — append entries below and ship them with
 *    your fork. Suits teams running their own MCP servers for a known
 *    user base.
 * 3. **Native agent tools** — for services where MCP indirection is
 *    overkill (e.g. Google Workspace), build direct OAuth integrations
 *    in `src/server/modules/chat/tools/`. See the email, places, or
 *    audio tools for reference.
 *
 * See `docs/mcp-connectors.md` for public MCP server URLs and a
 * self-hosting guide.
 */

export type ConnectorCategory =
  | 'productivity'
  | 'developer'
  | 'analytics'
  | 'communication'
  | 'example'

export interface CatalogEntry {
  id: string
  name: string
  description: string
  category: ConnectorCategory
  /** Lucide icon name (rendered via ICON_MAP on the client) */
  icon: string
  url: string
  transport: 'http' | 'sse'
  prefersOAuth: boolean
  scopes?: string[]
  popularity?: number
  tagline?: string
}

export const MCP_CATALOG: CatalogEntry[] = [
  // Live example — no-auth public API. Safe to connect in any fork; gives
  // users something that actually works when they explore the Connectors
  // UI for the first time.
  {
    id: 'australian-business',
    name: 'Australian Business Register',
    description: 'Lookup ABN, ACN, or business names from the public ABR. Handy example of a no-auth MCP connector.',
    category: 'example',
    icon: 'Building2',
    url: 'https://australian-business.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: false,
    popularity: 50,
    tagline: 'ABN/ACN lookup',
  },
]

/** Lookup helper for server-side validation. */
export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.id === id)
}

/** Group entries by category for the browse modal. */
export function catalogByCategory(): Record<ConnectorCategory, CatalogEntry[]> {
  const groups = {} as Record<ConnectorCategory, CatalogEntry[]>
  for (const entry of MCP_CATALOG) {
    if (!groups[entry.category]) groups[entry.category] = []
    groups[entry.category]!.push(entry)
  }
  for (const key of Object.keys(groups) as ConnectorCategory[]) {
    groups[key].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
  }
  return groups
}
