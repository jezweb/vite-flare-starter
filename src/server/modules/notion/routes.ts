/**
 * Notion OAuth routes — status / connect / callback / disconnect.
 *
 * Notion's OAuth is a "public integration" (user-authorised) — token
 * endpoint returns `access_token` + `workspace_id` + `workspace_name` +
 * `bot_id`. Scopes are implicit from the integration's capabilities;
 * the authorize URL doesn't take a `scope` param (Notion ignores it).
 *
 * Notion does NOT include `redirect_uri` in the token exchange — sending
 * it triggers "invalid_grant". That's handled by the stub helper's
 * `includeRedirectUriInTokenExchange: false` option.
 *
 * Note: `owner=user` is sometimes added to select individual vs. workspace
 * auth; we omit to let Notion pick based on what the user has.
 */
import { buildStubRoutes } from '@/server/modules/connectors/stub-provider'
import { notionTokens } from './db/schema'

export default buildStubRoutes({
  providerId: 'notion',
  tokenTable: notionTokens,
  envVars: {
    clientId: 'NOTION_CLIENT_ID',
    clientSecret: 'NOTION_CLIENT_SECRET',
  },
  authorizeEndpoint: 'https://api.notion.com/v1/oauth/authorize',
  tokenEndpoint: 'https://api.notion.com/v1/oauth/token',
  // Notion doesn't consume `scope` on authorize, but we keep it for
  // display consistency — read/write is granted via the integration
  // capability config at api.notion.com, not via OAuth scope params.
  scopes: [],
  // Critical: Notion rejects redirect_uri in the token exchange body.
  includeRedirectUriInTokenExchange: false,
  // Required by Notion's API: bearer is stored, subsequent calls include
  // `Notion-Version: 2022-06-28` (tool implementations handle that).
  fetchAccountInfo: async (token) => {
    try {
      const resp = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
        },
      })
      if (!resp.ok) return {}
      const json = (await resp.json()) as {
        name?: string
        person?: { email?: string }
        bot?: { workspace_name?: string; owner?: { user?: { name?: string } } }
      }
      // For bot users (integration), workspace_name is the useful label.
      const workspace = json.bot?.workspace_name
      const label = json.person?.email ?? json.name ?? workspace ?? 'Notion'
      return { accountLabel: label, accountIdentifier: workspace }
    } catch {
      return {}
    }
  },
})
