/**
 * Microsoft Workspace token management — OAuth 2.0 authorization-code flow
 * against the Microsoft identity platform (Azure AD v2.0 endpoints).
 *
 * Mirrors the shape of `google-workspace/tokens.ts`:
 *   getAccessToken(env, userId) — returns a live bearer (refreshing if within
 *     5 min of expiry), null if not connected / refresh failed.
 *   exchangeAuthCode(env, code) — OAuth callback handler helper.
 *   revokeAndDelete(env, userId) — disconnect: revoke upstream + drop row.
 *
 * Scope choices — `offline_access` is REQUIRED for a refresh token. The
 * rest mirror the Google default set (mail read/send, files read + write,
 * calendar read/write) so the tool surface lines up 1:1 with Google.
 */
import type { D1Database } from '@cloudflare/workers-types'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { microsoftWorkspaceTokens } from './db/schema'
import { encrypt, decrypt } from '@/server/lib/crypto'

/**
 * Default scopes the connect flow requests. Covers mail, files, calendar.
 * Forks wanting Teams / Word / Excel / Contacts can add more scopes here.
 *
 * Scopes use the Microsoft Graph permission names, not full URLs — Microsoft
 * accepts `Mail.Read` AND `https://graph.microsoft.com/Mail.Read`. We use
 * short names for brevity; the consent screen resolves them correctly.
 */
export const MICROSOFT_WORKSPACE_SCOPES = [
  // Identity (User.Read gets profile + email for display).
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  // Mail — read inbox, search, send.
  'Mail.Read',
  'Mail.Send',
  // OneDrive / SharePoint — read files user can see, write to user's drive.
  'Files.Read',
  'Files.ReadWrite',
  // Calendar — read + write events.
  'Calendars.ReadWrite',
] as const

/**
 * Using `/common` lets both work + personal (MSA) Microsoft accounts sign
 * in. Set to a specific tenant id if you want to restrict to one org.
 * The env var MICROSOFT_WORKSPACE_TENANT overrides this at runtime.
 */
export function authorityBase(env: MicrosoftWorkspaceEnv): string {
  const tenant = env.MICROSOFT_WORKSPACE_TENANT?.trim() || 'common'
  return `https://login.microsoftonline.com/${tenant}`
}
export function authEndpoint(env: MicrosoftWorkspaceEnv): string {
  return `${authorityBase(env)}/oauth2/v2.0/authorize`
}
export function tokenEndpoint(env: MicrosoftWorkspaceEnv): string {
  return `${authorityBase(env)}/oauth2/v2.0/token`
}
/** Microsoft Graph "me" endpoint — read the signed-in user's profile. */
export const GRAPH_ME_ENDPOINT = 'https://graph.microsoft.com/v1.0/me'

export interface MicrosoftWorkspaceEnv {
  DB: D1Database
  MICROSOFT_WORKSPACE_CLIENT_ID?: string
  MICROSOFT_WORKSPACE_CLIENT_SECRET?: string
  /**
   * Tenant id or the literal `common` / `organizations` / `consumers`.
   * Defaults to `common` — supports both work and personal MS accounts.
   */
  MICROSOFT_WORKSPACE_TENANT?: string
  BETTER_AUTH_URL?: string
  BETTER_AUTH_SECRET?: string
  TOKEN_ENCRYPTION_KEY?: string
}

/** Has the fork configured Microsoft Workspace OAuth? */
export function isMicrosoftWorkspaceEnabled(env: MicrosoftWorkspaceEnv): boolean {
  return !!(env.MICROSOFT_WORKSPACE_CLIENT_ID && env.MICROSOFT_WORKSPACE_CLIENT_SECRET)
}

/** Callback URL — must match the Azure app registration exactly. */
export function redirectUri(env: MicrosoftWorkspaceEnv): string {
  return new URL('/api/microsoft-workspace/callback', env.BETTER_AUTH_URL).toString()
}

/**
 * Fetch a live access token for the user, refreshing if within 5 min of
 * expiry. Returns null if the user has no connection or refresh failed.
 *
 * Same contract as google-workspace's `getAccessToken` so agent tools can
 * follow an identical pattern.
 */
export async function getAccessToken(
  env: MicrosoftWorkspaceEnv,
  userId: string
): Promise<string | null> {
  const db = drizzle(env.DB)
  const [row] = await db
    .select()
    .from(microsoftWorkspaceTokens)
    .where(eq(microsoftWorkspaceTokens.userId, userId))
    .limit(1)

  if (!row) return null
  if (row.status !== 'active') return null

  const expiresMs = new Date(row.expiresAt).getTime()
  const fiveMinFromNow = Date.now() + 5 * 60_000

  if (expiresMs > fiveMinFromNow) {
    return await decrypt(row.accessToken, env.TOKEN_ENCRYPTION_KEY)
  }

  // Refresh needed.
  try {
    const refreshToken = await decrypt(row.refreshToken, env.TOKEN_ENCRYPTION_KEY)
    if (!refreshToken) throw new Error('Missing refresh token')

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.MICROSOFT_WORKSPACE_CLIENT_ID!,
      client_secret: env.MICROSOFT_WORKSPACE_CLIENT_SECRET!,
      // Re-request the same scopes so the returned token is usable for the
      // same APIs. Microsoft will happily return a narrower set if the
      // original consent has since been trimmed.
      scope: MICROSOFT_WORKSPACE_SCOPES.join(' '),
    })
    const resp = await fetch(tokenEndpoint(env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`Microsoft refresh failed: ${resp.status} ${errText.slice(0, 200)}`)
    }
    const json = (await resp.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
      scope?: string
    }
    const newAccessEnc = await encrypt(json.access_token, env.TOKEN_ENCRYPTION_KEY)
    const newExpiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString()
    // Microsoft rotates the refresh token on each refresh — we must save
    // the new one or subsequent refreshes fail. Different from Google's
    // "same refresh_token forever" model. If Microsoft returns a new one,
    // re-encrypt and persist.
    const newRefreshEnc = json.refresh_token
      ? await encrypt(json.refresh_token, env.TOKEN_ENCRYPTION_KEY)
      : undefined

    await db
      .update(microsoftWorkspaceTokens)
      .set({
        accessToken: newAccessEnc,
        ...(newRefreshEnc ? { refreshToken: newRefreshEnc } : {}),
        expiresAt: newExpiresAt,
        scope: json.scope ?? row.scope,
        status: 'active',
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(microsoftWorkspaceTokens.userId, userId))

    return json.access_token
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(microsoftWorkspaceTokens)
      .set({
        status: 'error',
        lastError: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(microsoftWorkspaceTokens.userId, userId))
    console.error(
      JSON.stringify({ event: 'microsoft_workspace_refresh_failed', userId, error: message })
    )
    return null
  }
}

/**
 * Exchange the authorization code for tokens + the user's Microsoft email.
 * Called from the OAuth callback.
 */
export async function exchangeAuthCode(
  env: MicrosoftWorkspaceEnv,
  code: string
): Promise<{
  accessToken: string
  refreshToken: string | null
  expiresIn: number
  scope: string
  email: string | null
  tenantId: string | null
}> {
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: env.MICROSOFT_WORKSPACE_CLIENT_ID!,
    client_secret: env.MICROSOFT_WORKSPACE_CLIENT_SECRET!,
    redirect_uri: redirectUri(env),
    scope: MICROSOFT_WORKSPACE_SCOPES.join(' '),
  })
  const tokenResp = await fetch(tokenEndpoint(env), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody,
  })
  if (!tokenResp.ok) {
    const err = await tokenResp.text()
    throw new Error(`Token exchange failed: ${tokenResp.status} ${err.slice(0, 200)}`)
  }
  const tokenJson = (await tokenResp.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
    id_token?: string
  }

  // Pull email + tenant from the id_token (JWT) when present — saves a
  // Graph call. Fall back to /me if id_token is absent or malformed.
  let email: string | null = null
  let tenantId: string | null = null
  if (tokenJson.id_token) {
    try {
      const payload = JSON.parse(
        atob(tokenJson.id_token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))
      ) as { email?: string; preferred_username?: string; upn?: string; tid?: string }
      email = payload.email ?? payload.preferred_username ?? payload.upn ?? null
      tenantId = payload.tid ?? null
    } catch {
      // ignore — fall through to Graph
    }
  }
  if (!email) {
    try {
      const meResp = await fetch(GRAPH_ME_ENDPOINT, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      })
      if (meResp.ok) {
        const info = (await meResp.json()) as { mail?: string; userPrincipalName?: string }
        email = info.mail ?? info.userPrincipalName ?? null
      }
    } catch {
      // ignore — email is nice-to-have
    }
  }

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token ?? null,
    expiresIn: tokenJson.expires_in,
    scope: tokenJson.scope,
    email,
    tenantId,
  }
}

/**
 * Disconnect: delete the D1 row. Microsoft doesn't expose a token revoke
 * endpoint equivalent to Google's — the refresh token becomes orphaned
 * and expires naturally (default 90 days for work accounts). Users who
 * want to fully revoke can do so at
 * https://myaccount.microsoft.com/consent — we surface that URL in the
 * disconnect dialog so they can follow up if they care.
 */
export async function revokeAndDelete(env: MicrosoftWorkspaceEnv, userId: string): Promise<void> {
  const db = drizzle(env.DB)
  await db.delete(microsoftWorkspaceTokens).where(eq(microsoftWorkspaceTokens.userId, userId))
}
