/**
 * Atlassian OAuth routes — status / connect / callback / disconnect.
 *
 * Covers Jira + Confluence via Atlassian's shared OAuth 2.0 (3LO).
 * Scopes are granular per-product. The token response includes `scope`
 * as a space-joined string the user actually consented to.
 *
 * Atlassian requires:
 *   - `audience=api.atlassian.com` on the authorize URL
 *   - `prompt=consent` to show the consent screen (not doing so re-uses
 *     prior consent which skips scope updates)
 *
 * After the token exchange, we call `/oauth/token/accessible-resources`
 * to find the site(s) the user granted access to and pick the first one
 * as the default `accountIdentifier` (aka cloudId). Tool implementations
 * use this in their API paths: `/ex/jira/<cloudId>/rest/api/3/...`.
 */
import { buildStubRoutes } from '@/server/modules/connectors/stub-provider'
import { atlassianTokens } from './db/schema'

export default buildStubRoutes({
  providerId: 'atlassian',
  tokenTable: atlassianTokens,
  envVars: {
    clientId: 'ATLASSIAN_CLIENT_ID',
    clientSecret: 'ATLASSIAN_CLIENT_SECRET',
  },
  authorizeEndpoint: 'https://auth.atlassian.com/authorize',
  tokenEndpoint: 'https://auth.atlassian.com/oauth/token',
  scopes: [
    // Jira
    'read:jira-work',
    'read:jira-user',
    'write:jira-work',
    // Confluence
    'read:confluence-content.all',
    'read:confluence-space.summary',
    'write:confluence-content',
    // OAuth housekeeping
    'offline_access',
  ],
  extraAuthParams: {
    audience: 'api.atlassian.com',
    prompt: 'consent',
  },
  fetchAccountInfo: async (token) => {
    try {
      const resp = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
      if (!resp.ok) return {}
      const sites = (await resp.json()) as Array<{
        id?: string
        name?: string
        url?: string
      }>
      const first = sites[0]
      if (!first) return {}
      return {
        accountLabel: first.name ?? first.url,
        accountIdentifier: first.id,
      }
    } catch {
      return {}
    }
  },
})
