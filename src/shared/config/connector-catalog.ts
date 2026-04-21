/**
 * MCP Connector catalog — curated list of known MCP servers users can
 * connect in one click. Shared by the client (UI) and server (validation).
 *
 * To add a new connector:
 *  1. Append an entry here
 *  2. Confirm the URL speaks OAuth or accepts a bearer token
 *  3. Optionally set `scopes` for better UI disclosure
 *
 * Fork tip: most of these are Jezweb-hosted (*.mcpserver.au). Replace
 * with your own endpoints or remove entries you don't want in the catalog.
 */

export type ConnectorCategory =
  | 'google'
  | 'productivity'
  | 'developer'
  | 'analytics'
  | 'communication'
  | 'jezweb'

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
  // ── Google Workspace ──────────────────────────────────────────────
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Browse, upload, and search files in Google Drive.',
    category: 'google',
    icon: 'FolderOpen',
    url: 'https://drive.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: true,
    scopes: ['drive.file', 'drive.readonly'],
    popularity: 95,
    tagline: 'Files & folders',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Read, send, and search email across Gmail accounts.',
    category: 'google',
    icon: 'Mail',
    url: 'https://gmail.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: true,
    scopes: ['gmail.readonly', 'gmail.send'],
    popularity: 100,
    tagline: 'Inbox + send',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Create, read, and update calendar events.',
    category: 'google',
    icon: 'CalendarDays',
    url: 'https://calendar.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: true,
    scopes: ['calendar.events'],
    popularity: 90,
    tagline: 'Events & free-busy',
  },
  {
    id: 'google-docs',
    name: 'Google Docs',
    description: 'Create and edit Google Docs, insert formatted content.',
    category: 'google',
    icon: 'FileText',
    url: 'https://docs.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 80,
    tagline: 'Write & edit docs',
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Read and write cells in Sheets; apply formatting and formulas.',
    category: 'google',
    icon: 'Table',
    url: 'https://sheets.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 85,
    tagline: 'Tabular data',
  },
  {
    id: 'google-slides',
    name: 'Google Slides',
    description: 'Create presentations and manage slide content.',
    category: 'google',
    icon: 'Presentation',
    url: 'https://slides.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 50,
    tagline: 'Presentations',
  },
  {
    id: 'google-tasks',
    name: 'Google Tasks',
    description: 'Manage task lists and reminders.',
    category: 'google',
    icon: 'ListChecks',
    url: 'https://tasks.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 40,
    tagline: 'To-do lists',
  },
  {
    id: 'google-contacts',
    name: 'Google Contacts',
    description: 'Search and update contacts.',
    category: 'google',
    icon: 'Users',
    url: 'https://contacts.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 30,
    tagline: 'People lookup',
  },

  // ── Developer / analytics ─────────────────────────────────────────
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repos, issues, pull requests, and search across your repositories.',
    category: 'developer',
    icon: 'Github',
    url: 'https://github.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: true,
    scopes: ['repo', 'issues', 'pull_requests'],
    popularity: 95,
    tagline: 'Repos + issues + PRs',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Manage DNS, Workers, D1, R2, KV, and other Cloudflare resources.',
    category: 'developer',
    icon: 'Cloud',
    url: 'https://cloudflare.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 70,
    tagline: 'Edge infrastructure',
  },

  // ── Jezweb platform ───────────────────────────────────────────────
  {
    id: 'jezpress',
    name: 'JezPress',
    description: 'Manage the JezPress WordPress fleet — sites, domains, tickets, uptime.',
    category: 'jezweb',
    icon: 'Server',
    url: 'https://jezpress.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: true,
    popularity: 20,
    tagline: 'WordPress fleet',
  },
  {
    id: 'australian-business',
    name: 'Australian Business Register',
    description: 'Lookup ABN, ACN, or business names from the ABR.',
    category: 'productivity',
    icon: 'Building2',
    url: 'https://australian-business.mcpserver.au/mcp',
    transport: 'http',
    prefersOAuth: false, // No auth needed for public lookups
    popularity: 25,
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
