/**
 * Connector catalog — a small starter set of public MCP servers users
 * can connect in one click.
 *
 * ## Philosophy
 *
 * The starter's value in the Connectors feature is the *infrastructure* —
 * OAuth 2.1 + PKCE + DCR, bearer token fallback, per-tool policies,
 * encrypted at-rest tokens. The catalogue is a curated starter set:
 * enough credible entries that a first-time user immediately sees the
 * value, but small enough that maintenance is realistic.
 *
 * ## ⚠️ For forkers — verify URLs before relying on them
 *
 * The illustrative entries below use Smithery's standard URL pattern
 * (`https://server.smithery.ai/{handle}/mcp`). Smithery is a community
 * MCP server registry; specific server URLs and auth requirements change
 * over time. Before shipping a fork:
 *
 *   1. Visit https://smithery.ai and confirm each URL is current
 *   2. Replace any that have moved or been deprecated
 *   3. Drop entries that aren't actually relevant to your audience
 *   4. Add your own — paste any HTTP MCP server URL with optional auth
 *
 * The connector probe (`mcp-connections/probe.ts`) tests every URL
 * before connecting, so a dead entry surfaces as a clear "this connector
 * is unavailable" rather than a silent failure. Users can still see and
 * try entries even if some need updating.
 *
 * ## Three ways to get tools into your chat
 *
 * 1. **Workspace integrations** (Google, Microsoft) — first-class
 *    OAuth flows wired into `src/server/modules/google-workspace/` and
 *    `microsoft-workspace/`. Sign-in is two clicks.
 * 2. **Catalog entries** (this file) — one-click connect for popular
 *    public MCP servers. Add to the array below.
 * 3. **Custom URL** — power-user paste-any-MCP-URL flow, OAuth or
 *    bearer auth detected automatically by `probe.ts`.
 *
 * See `docs/mcp-connectors.md` for the full guide.
 */

export type ConnectorCategory =
  | 'productivity'
  | 'developer'
  | 'analytics'
  | 'communication'
  | 'finance'
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
  /**
   * Bullet points describing what your AI can do once connected. Shown
   * in the Browse modal so users know what they're enabling. Match the
   * pattern used by the Workspace integration cards (e.g. "Read Gmail",
   * "Create Drive files").
   */
  capabilities?: string[]
  /**
   * Source attribution shown below the card name (e.g. "via Smithery",
   * "Anthropic reference"). Optional but helps set expectations on
   * support model and uptime.
   */
  source?: string
}

export const MCP_CATALOG: CatalogEntry[] = [
  // ─── Communication ────────────────────────────────────────────
  {
    id: 'slack-via-smithery',
    name: 'Slack',
    description: 'Read channels, post messages, search history, manage files.',
    category: 'communication',
    icon: 'MessageCircle',
    url: 'https://server.smithery.ai/@modelcontextprotocol/slack/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 95,
    tagline: 'Team chat — read + post',
    source: 'via Smithery',
    capabilities: [
      'Read messages from any channel',
      'Post updates and replies',
      'Search history by keyword or user',
      'Find files shared in conversations',
    ],
  },
  {
    id: 'notion-via-smithery',
    name: 'Notion',
    description: 'Search pages and databases, create new pages, append content.',
    category: 'productivity',
    icon: 'BookText',
    url: 'https://server.smithery.ai/@makenotion/notion/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 90,
    tagline: 'Docs + databases',
    source: 'via Smithery',
    capabilities: [
      'Search across your workspace',
      'Read pages and databases',
      'Create new pages from chat',
      'Append blocks to existing pages',
    ],
  },

  // ─── Developer ────────────────────────────────────────────────
  {
    id: 'github-via-smithery',
    name: 'GitHub',
    description: 'Browse repositories, search code, manage issues and pull requests.',
    category: 'developer',
    icon: 'Github',
    url: 'https://server.smithery.ai/@modelcontextprotocol/github/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 100,
    tagline: 'Repos + issues + PRs',
    source: 'via Smithery',
    capabilities: [
      'Search code across repositories',
      'List, comment, and update issues',
      'Read pull request diffs and comments',
      'Browse files at any branch or commit',
    ],
  },
  {
    id: 'linear-via-smithery',
    name: 'Linear',
    description: 'Search issues, create tickets, update status, comment on threads.',
    category: 'developer',
    icon: 'GitBranch',
    url: 'https://server.smithery.ai/@linear/linear/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 80,
    tagline: 'Issue tracking',
    source: 'via Smithery',
    capabilities: [
      'Search issues by status, assignee, or label',
      'Create tickets from chat',
      'Update status and priority',
      'Post comments on threads',
    ],
  },

  // ─── Finance ──────────────────────────────────────────────────
  {
    id: 'stripe-via-smithery',
    name: 'Stripe',
    description: 'Read customer details, charges, subscriptions, and refunds.',
    category: 'finance',
    icon: 'CreditCard',
    url: 'https://server.smithery.ai/@stripe/stripe/mcp',
    transport: 'http',
    prefersOAuth: false,
    popularity: 75,
    tagline: 'Payments + customers',
    source: 'via Smithery',
    capabilities: [
      'Look up customers and their charges',
      'List subscriptions and renewal dates',
      'Search recent payment activity',
      'Read refund and dispute details',
    ],
  },

  // ─── Productivity ─────────────────────────────────────────────
  {
    id: 'airtable-via-smithery',
    name: 'Airtable',
    description: 'Search bases and tables, read records, create + update rows.',
    category: 'productivity',
    icon: 'Grid3x3',
    url: 'https://server.smithery.ai/@airtable/airtable/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 70,
    tagline: 'Spreadsheet + database',
    source: 'via Smithery',
    capabilities: [
      'Search records across bases',
      'Read fields with filters and sorts',
      'Create new rows from chat',
      'Update existing records',
    ],
  },

  // ─── Example (no-auth, always works) ──────────────────────────
  {
    id: 'australian-business',
    name: 'Australian Business Register',
    description: 'Lookup ABN, ACN, or business names from the public ABR.',
    category: 'example',
    icon: 'Building2',
    url: 'https://australian-business.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: false,
    popularity: 30,
    tagline: 'ABN/ACN lookup — no auth',
    source: 'public · no auth',
    capabilities: [
      'Search businesses by ABN, ACN, or name',
      'Read GST registration status',
      'No sign-in required',
    ],
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
