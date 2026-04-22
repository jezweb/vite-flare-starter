/**
 * Google Workspace token management — OAuth 2.0 authorization code flow,
 * encrypted refresh tokens, lazy refresh on expiry.
 *
 * Call `getAccessToken(env, userId)` from any agent tool to get a live
 * access token — it handles refresh transparently if the current one is
 * within 5 minutes of expiry. On refresh failure (Google rejected the
 * refresh_token) the connection is marked `error` and the tool call
 * returns a friendly "re-authorize" message.
 */
import type { D1Database } from '@cloudflare/workers-types'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { googleWorkspaceTokens } from './db/schema'
import { encrypt, decrypt } from '@/server/lib/crypto'

export const GOOGLE_WORKSPACE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
] as const

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo'
export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

export interface GoogleWorkspaceEnv {
  DB: D1Database
  GOOGLE_WORKSPACE_CLIENT_ID?: string
  GOOGLE_WORKSPACE_CLIENT_SECRET?: string
  BETTER_AUTH_URL?: string
  TOKEN_ENCRYPTION_KEY?: string
}

/** Has the fork configured Google Workspace OAuth? */
export function isGoogleWorkspaceEnabled(env: GoogleWorkspaceEnv): boolean {
  return !!(env.GOOGLE_WORKSPACE_CLIENT_ID && env.GOOGLE_WORKSPACE_CLIENT_SECRET)
}

/** Callback URL — must match the Google Cloud OAuth client config exactly. */
export function redirectUri(env: GoogleWorkspaceEnv): string {
  return new URL('/api/google-workspace/callback', env.BETTER_AUTH_URL).toString()
}

/**
 * Fetch a live access token for the user, refreshing if within 5 min of
 * expiry. Returns null if the user has no connection or refresh failed.
 */
export async function getAccessToken(
  env: GoogleWorkspaceEnv,
  userId: string,
): Promise<string | null> {
  const db = drizzle(env.DB)
  const [row] = await db
    .select()
    .from(googleWorkspaceTokens)
    .where(eq(googleWorkspaceTokens.userId, userId))
    .limit(1)

  if (!row) return null
  if (row.status !== 'active') return null

  // 5-minute refresh window so API calls never fail on a stale token.
  const expiresMs = new Date(row.expiresAt).getTime()
  const fiveMinFromNow = Date.now() + 5 * 60_000

  if (expiresMs > fiveMinFromNow) {
    // Still valid — decrypt and return.
    return await decrypt(row.accessToken, env.TOKEN_ENCRYPTION_KEY)
  }

  // Refresh needed.
  try {
    const refreshToken = await decrypt(row.refreshToken, env.TOKEN_ENCRYPTION_KEY)
    if (!refreshToken) throw new Error('Missing refresh token')

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.GOOGLE_WORKSPACE_CLIENT_ID!,
      client_secret: env.GOOGLE_WORKSPACE_CLIENT_SECRET!,
    })
    const resp = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`Google refresh failed: ${resp.status} ${errText.slice(0, 200)}`)
    }
    const json = (await resp.json()) as {
      access_token: string
      expires_in: number
      scope?: string
    }
    const newAccessEnc = await encrypt(json.access_token, env.TOKEN_ENCRYPTION_KEY)
    const newExpiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString()

    await db
      .update(googleWorkspaceTokens)
      .set({
        accessToken: newAccessEnc,
        expiresAt: newExpiresAt,
        scope: json.scope ?? row.scope,
        status: 'active',
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(googleWorkspaceTokens.userId, userId))

    return json.access_token
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(googleWorkspaceTokens)
      .set({
        status: 'error',
        lastError: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(googleWorkspaceTokens.userId, userId))
    console.error(
      JSON.stringify({ event: 'google_workspace_refresh_failed', userId, error: message }),
    )
    return null
  }
}

/**
 * Exchange the authorization code for tokens + the user's Google email.
 * Called from the OAuth callback.
 */
export async function exchangeAuthCode(
  env: GoogleWorkspaceEnv,
  code: string,
): Promise<{
  accessToken: string
  refreshToken: string | null
  expiresIn: number
  scope: string
  email: string | null
}> {
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: env.GOOGLE_WORKSPACE_CLIENT_ID!,
    client_secret: env.GOOGLE_WORKSPACE_CLIENT_SECRET!,
    redirect_uri: redirectUri(env),
  })
  const tokenResp = await fetch(GOOGLE_TOKEN_ENDPOINT, {
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
  }

  // Fetch the user's email for display. Best-effort — if this fails, we
  // still have the tokens and can proceed without the display email.
  let email: string | null = null
  try {
    const userInfoResp = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    })
    if (userInfoResp.ok) {
      const info = (await userInfoResp.json()) as { email?: string }
      email = info.email ?? null
    }
  } catch {
    // ignore — email is nice-to-have
  }

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token ?? null,
    expiresIn: tokenJson.expires_in,
    scope: tokenJson.scope,
    email,
  }
}

/**
 * Revoke the refresh token upstream at Google, then delete our D1 row.
 * Called from the /disconnect endpoint.
 */
export async function revokeAndDelete(env: GoogleWorkspaceEnv, userId: string): Promise<void> {
  const db = drizzle(env.DB)
  const [row] = await db
    .select()
    .from(googleWorkspaceTokens)
    .where(eq(googleWorkspaceTokens.userId, userId))
    .limit(1)

  if (row) {
    // Fire-and-forget revocation — Google returns 200 on success but we
    // still delete our row even if revocation fails (user's wishes matter).
    try {
      const refreshToken = await decrypt(row.refreshToken, env.TOKEN_ENCRYPTION_KEY)
      if (refreshToken) {
        await fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(refreshToken)}`, {
          method: 'POST',
        })
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'google_workspace_revoke_failed',
          userId,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }

  await db.delete(googleWorkspaceTokens).where(eq(googleWorkspaceTokens.userId, userId))
}
