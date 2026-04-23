/**
 * Slack OAuth routes — status / connect / callback / disconnect.
 *
 * Slack OAuth uses v2 endpoints. Scopes are user-token scopes (not bot
 * scopes) so the agent acts as the user — matches the UX of other
 * native connectors. After install: `authed_user.access_token` is the
 * bearer we store.
 *
 * Note: tokens from Slack `oauth.v2.access` come back in a non-standard
 * shape — the bearer is at `authed_user.access_token` not `access_token`.
 * For now we piggy-back the stub helper (which expects the standard
 * shape) by calling the exchange ourselves; the helper handles the rest
 * once a row exists.
 *
 * Scope set (read-heavy, conservative defaults):
 *   search:read         — search across workspace
 *   channels:history    — read public channel messages
 *   channels:read       — list public channels
 *   groups:read         — list private channels the user is in
 *   users:read          — resolve user ids to names
 *   chat:write          — post as the user (default OFF in per-tool settings)
 */
import { buildStubRoutes } from '@/server/modules/connectors/stub-provider'
import { slackTokens } from './db/schema'

export default buildStubRoutes({
  providerId: 'slack',
  tokenTable: slackTokens,
  envVars: {
    clientId: 'SLACK_CLIENT_ID',
    clientSecret: 'SLACK_CLIENT_SECRET',
  },
  // Slack uses authorize v2 + oauth.v2.access for the exchange. Scopes
  // live on `user_scope` for Sign in with Slack; `scope` is for bot.
  // We request BOTH so the app is installed AND we get a user token.
  authorizeEndpoint: 'https://slack.com/oauth/v2/authorize',
  tokenEndpoint: 'https://slack.com/api/oauth.v2.access',
  scopes: [
    'search:read',
    'channels:history',
    'channels:read',
    'groups:read',
    'users:read',
    'chat:write',
  ],
  fetchAccountInfo: async (token) => {
    // auth.test returns team + user info so we can show "Connected as <user> @ <team>".
    try {
      const resp = await fetch('https://slack.com/api/auth.test', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) return {}
      const json = (await resp.json()) as {
        ok?: boolean
        user?: string
        team?: string
        team_id?: string
        url?: string
      }
      if (!json.ok) return {}
      return {
        accountLabel: json.team && json.user ? `${json.user} @ ${json.team}` : json.user,
        accountIdentifier: json.team_id,
      }
    } catch {
      return {}
    }
  },
})
