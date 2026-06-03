/**
 * ConnectorProvider registry — single source of truth for every native
 * OAuth connector shipped with the starter.
 *
 * Adding a new provider:
 *  1. Add an entry to `CONNECTOR_PROVIDERS` with its metadata.
 *  2. Create server module at `src/server/modules/<id>/` (tokens.ts,
 *     routes.ts, db/schema.ts) — mirror Google/Microsoft pattern.
 *  3. Create chat tool module at `src/server/modules/chat/tools/<id>.ts`
 *     with tools matching `toolNames` here.
 *  4. Create client panel at
 *     `src/client/modules/connectors/components/<Id>Panel.tsx`.
 *  5. Register routes in `src/server/index.ts`.
 *  6. Register tools in `src/server/modules/chat/tools/index.ts`.
 *  7. Mount panel in `ConnectorsPage.tsx`.
 *
 * The starter auto-hides any provider whose env client_id+secret aren't
 * configured — so the entry below is harmless for forks that never set
 * up that provider.
 *
 * Per-tool enablement + server-side filtering is wired through
 * `src/server/modules/connectors/settings.ts` which reads this table
 * and the `user_connector_settings` D1 table.
 */
export type ConnectorCategory =
  | 'productivity'
  | 'communication'
  | 'dev-tools'
  | 'crm'
  | 'finance'
  | 'other'

export interface ConnectorProvider {
  /** Stable machine id, used in URLs + DB rows. Lowercase kebab. */
  id: string
  /** User-facing label in cards, menus. */
  label: string
  /** One-sentence description shown on the connector card. */
  description: string
  /** Grouping for the connectors page sidebar (future). */
  category: ConnectorCategory
  /**
   * API base path prefix. Routes are mounted at:
   *   GET  /api/<apiPrefix>/status
   *   POST /api/<apiPrefix>/connect
   *   GET  /api/<apiPrefix>/callback
   *   POST /api/<apiPrefix>/disconnect
   */
  apiPrefix: string
  /**
   * Names of env vars this connector reads. Used by `isProviderConfigured`
   * to auto-hide the card on forks that haven't set them up.
   * Must include at least CLIENT_ID + CLIENT_SECRET equivalent.
   */
  envVars: { clientId: string; clientSecret: string }
  /**
   * Tool names this provider contributes to the agent toolkit. Each name
   * must match a ToolDefinition registered in the chat tools module.
   */
  toolNames: string[]
  /**
   * Tools enabled by default on first connect. Typically the read-only
   * subset — destructive (send/delete/create) default to OFF so users
   * opt in explicitly.
   */
  defaultEnabledTools: string[]
  /**
   * Whether this provider's status endpoint has been implemented. Set
   * `false` for stubs that have the card + OAuth but not yet the tool
   * implementations — they'll render as "Coming soon" with a disabled
   * Connect button.
   */
  stub?: boolean
  /**
   * Friendly link to the official developer portal where the fork owner
   * creates the OAuth app. Shown on the card in stub state.
   */
  developerPortalUrl?: string
}

/**
 * The full catalogue. Order is the render order on the Connectors page.
 * Categorise by use — productivity first, comms, dev-tools, etc.
 */
export const CONNECTOR_PROVIDERS: ConnectorProvider[] = [
  {
    id: 'google-workspace',
    label: 'Google Workspace',
    description:
      'Direct access to Gmail, Drive, Calendar, Docs, Sheets, Tasks via native Google OAuth — no MCP server needed.',
    category: 'productivity',
    apiPrefix: 'google-workspace',
    envVars: {
      clientId: 'GOOGLE_WORKSPACE_CLIENT_ID',
      clientSecret: 'GOOGLE_WORKSPACE_CLIENT_SECRET',
    },
    toolNames: [
      'gmail_search',
      'gmail_get_message',
      'gmail_list_labels',
      'gmail_draft',
      'gmail_reply',
      'gmail_send',
      'drive_search',
      'drive_get_file',
      'drive_create_folder',
      'tasks_list',
      'tasks_create',
      'calendar_upcoming',
      'calendar_list_events',
      'calendar_get_event',
      'calendar_find_free_slot',
      'calendar_create',
      'calendar_update_event',
      'calendar_delete_event',
      'docs_search',
      'docs_get',
      'docs_create',
      'docs_append',
      'sheets_list_tabs',
      'sheets_read_range',
      'sheets_append_row',
      'sheets_write_range',
    ],
    defaultEnabledTools: [
      // Reads only by default — user opts in to sends/creates.
      'gmail_search',
      'gmail_get_message',
      'gmail_list_labels',
      'drive_search',
      'drive_get_file',
      'tasks_list',
      'calendar_upcoming',
      'calendar_list_events',
      'calendar_get_event',
      'calendar_find_free_slot',
      'docs_search',
      'docs_get',
      'sheets_list_tabs',
      'sheets_read_range',
    ],
    developerPortalUrl: 'https://console.cloud.google.com',
  },

  {
    id: 'microsoft-workspace',
    label: 'Microsoft 365',
    description:
      'Direct access to Outlook, OneDrive, and your calendar via native Microsoft Graph OAuth — with optional Teams meeting links.',
    category: 'productivity',
    apiPrefix: 'microsoft-workspace',
    envVars: {
      clientId: 'MICROSOFT_WORKSPACE_CLIENT_ID',
      clientSecret: 'MICROSOFT_WORKSPACE_CLIENT_SECRET',
    },
    toolNames: [
      'outlook_search',
      'outlook_get_message',
      'outlook_send',
      'onedrive_search',
      'onedrive_get_file',
      'msoffice_calendar_list',
      'msoffice_calendar_create',
    ],
    defaultEnabledTools: [
      'outlook_search',
      'outlook_get_message',
      'onedrive_search',
      'onedrive_get_file',
      'msoffice_calendar_list',
    ],
    developerPortalUrl: 'https://entra.microsoft.com',
  },

  {
    id: 'slack',
    label: 'Slack',
    description:
      'Read messages, list channels, post updates, and search conversations across your Slack workspace.',
    category: 'communication',
    apiPrefix: 'slack',
    envVars: {
      clientId: 'SLACK_CLIENT_ID',
      clientSecret: 'SLACK_CLIENT_SECRET',
    },
    toolNames: [
      'slack_search_messages',
      'slack_list_channels',
      'slack_get_channel_history',
      'slack_get_user',
      'slack_post_message',
    ],
    defaultEnabledTools: [
      'slack_search_messages',
      'slack_list_channels',
      'slack_get_channel_history',
      'slack_get_user',
    ],
    stub: true,
    developerPortalUrl: 'https://api.slack.com/apps',
  },

  {
    id: 'notion',
    label: 'Notion',
    description:
      'Search pages and databases, read content, append to pages, and create new entries in your Notion workspace.',
    category: 'productivity',
    apiPrefix: 'notion',
    envVars: {
      clientId: 'NOTION_CLIENT_ID',
      clientSecret: 'NOTION_CLIENT_SECRET',
    },
    toolNames: [
      'notion_search',
      'notion_get_page',
      'notion_get_database',
      'notion_query_database',
      'notion_create_page',
      'notion_append_blocks',
    ],
    defaultEnabledTools: [
      'notion_search',
      'notion_get_page',
      'notion_get_database',
      'notion_query_database',
    ],
    stub: true,
    developerPortalUrl: 'https://www.notion.so/my-integrations',
  },

  {
    id: 'atlassian',
    label: 'Atlassian (Jira + Confluence)',
    description:
      'Search and manage Jira issues, read Confluence pages, create issues and comments across your Atlassian Cloud site.',
    category: 'dev-tools',
    apiPrefix: 'atlassian',
    envVars: {
      clientId: 'ATLASSIAN_CLIENT_ID',
      clientSecret: 'ATLASSIAN_CLIENT_SECRET',
    },
    toolNames: [
      'jira_search_issues',
      'jira_get_issue',
      'jira_create_issue',
      'jira_add_comment',
      'jira_transition_issue',
      'confluence_search',
      'confluence_get_page',
      'confluence_create_page',
    ],
    defaultEnabledTools: [
      'jira_search_issues',
      'jira_get_issue',
      'confluence_search',
      'confluence_get_page',
    ],
    stub: true,
    developerPortalUrl: 'https://developer.atlassian.com/console/myapps/',
  },
]

/**
 * Fast lookup: tool name → provider id. Built once at module-load time.
 * Used by the chat toolkit builder to determine whether a tool belongs
 * to a connector (and thus subject to user-toggle filtering) vs. is a
 * built-in tool (always passes through).
 */
export const TOOL_TO_PROVIDER: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const provider of CONNECTOR_PROVIDERS) {
    for (const name of provider.toolNames) {
      map[name] = provider.id
    }
  }
  return map
})()

/**
 * Returns the provider id a tool belongs to, or `null` if the tool is a
 * built-in (core / memory / skills / etc.) and therefore not gated by
 * per-connector settings.
 */
export function providerForTool(toolName: string): string | null {
  return TOOL_TO_PROVIDER[toolName] ?? null
}

/**
 * Lookup a provider by id. Returns undefined for unknown ids (defensive
 * — lets the server silently skip stale rows in user_connector_settings
 * referencing removed connectors).
 */
export function getProvider(id: string): ConnectorProvider | undefined {
  return CONNECTOR_PROVIDERS.find((p) => p.id === id)
}

/**
 * Has the fork configured this provider's env vars?
 *
 * Used server-side to skip rendering the card + skip injecting tools
 * from providers the fork hasn't set up. Accepts a generic env record
 * to avoid coupling to Worker types here.
 */
export function isProviderConfigured(
  env: Record<string, string | undefined>,
  providerId: string
): boolean {
  const provider = getProvider(providerId)
  if (!provider) return false
  return !!(env[provider.envVars.clientId] && env[provider.envVars.clientSecret])
}
