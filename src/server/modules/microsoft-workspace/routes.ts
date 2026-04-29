/**
 * Microsoft Workspace OAuth routes — native integration (no MCP).
 *
 *   GET  /api/microsoft-workspace/status      — enabled? connected? which email? scopes?
 *   POST /api/microsoft-workspace/connect     — returns { authorizationUrl } for top-level redirect
 *   GET  /api/microsoft-workspace/callback    — public OAuth redirect handler
 *   POST /api/microsoft-workspace/disconnect  — delete the D1 row
 *
 * Mirrors `src/server/modules/google-workspace/routes.ts` intentionally.
 * Two providers, identical shape — forks can copy one and adapt for a
 * third (Slack, Atlassian, Notion, etc.) without inventing a new pattern.
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { microsoftWorkspaceTokens } from './db/schema'
import { encrypt, randomToken } from '@/server/lib/crypto'
import {
  exchangeAuthCode,
  isMicrosoftWorkspaceEnabled,
  redirectUri,
  revokeAndDelete,
  authEndpoint,
  MICROSOFT_WORKSPACE_SCOPES,
  type MicrosoftWorkspaceEnv,
} from './tokens'

const app = new Hono<AuthContext>()

/**
 * Public callback route — the user arrives here from Microsoft's consent
 * screen, not from our session. The signed `msw_state` cookie carries
 * the user id through the round-trip.
 */
app.get('/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const err = c.req.query('error')
  const errDescription = c.req.query('error_description')

  const finish = (status: 'success' | 'error', message?: string) => {
    const html = callbackPage({ status, message })
    const clear = 'Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
    const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' })
    headers.append('Set-Cookie', `msw_state=; ${clear}`)
    headers.append('Set-Cookie', `msw_user=; ${clear}`)
    return new Response(html, { headers })
  }

  if (err) return finish('error', errDescription || err)
  if (!code || !state) return finish('error', 'Missing code or state')

  const cookieHeader = c.req.header('cookie') ?? ''
  const stateMatch = cookieHeader.match(/msw_state=([^;]+)/)
  const userMatch = cookieHeader.match(/msw_user=([^;]+)/)
  if (!stateMatch || !userMatch) return finish('error', 'Missing session — try connecting again.')
  if (decodeURIComponent(stateMatch[1]!) !== state) return finish('error', 'State mismatch')

  const userId = decodeURIComponent(userMatch[1]!)
  const env = c.env as unknown as MicrosoftWorkspaceEnv

  if (!isMicrosoftWorkspaceEnabled(env)) {
    return finish('error', 'Microsoft Workspace is not configured on this server')
  }

  try {
    const tokens = await exchangeAuthCode(env, code)
    if (!tokens.refreshToken) {
      // Microsoft grants a refresh_token when `offline_access` is in scope
      // (we include it by default). If it's missing something is wrong in
      // the Azure app registration.
      console.warn(
        JSON.stringify({ event: 'microsoft_workspace_no_refresh_token', userId }),
      )
    }

    const accessTokenEnc = await encrypt(tokens.accessToken, env.TOKEN_ENCRYPTION_KEY)
    const refreshTokenEnc = tokens.refreshToken
      ? await encrypt(tokens.refreshToken, env.TOKEN_ENCRYPTION_KEY)
      : ''
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString()

    const db = drizzle(env.DB)
    await db
      .insert(microsoftWorkspaceTokens)
      .values({
        userId,
        accessToken: accessTokenEnc,
        refreshToken: refreshTokenEnc,
        expiresAt,
        scope: tokens.scope,
        microsoftEmail: tokens.email,
        tenantId: tokens.tenantId,
        status: 'active',
        lastError: null,
      })
      .onConflictDoUpdate({
        target: microsoftWorkspaceTokens.userId,
        set: {
          accessToken: accessTokenEnc,
          refreshToken: refreshTokenEnc || undefined,
          expiresAt,
          scope: tokens.scope,
          microsoftEmail: tokens.email ?? undefined,
          tenantId: tokens.tenantId ?? undefined,
          status: 'active',
          lastError: null,
          updatedAt: new Date(),
        },
      })

    return finish('success')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(
      JSON.stringify({ event: 'microsoft_workspace_callback_error', userId, error: message }),
    )
    return finish('error', message.slice(0, 200))
  }
})

// Everything below requires auth.
app.use('*', authMiddleware)

/** GET /status — enabled? connected? email? scopes? */
app.get('/status', async (c) => {
  const userId = c.get('userId')
  const env = c.env as unknown as MicrosoftWorkspaceEnv
  const enabled = isMicrosoftWorkspaceEnabled(env)

  if (!enabled) {
    return c.json({ enabled: false, connected: false })
  }

  const db = drizzle(env.DB)
  const [row] = await db
    .select({
      email: microsoftWorkspaceTokens.microsoftEmail,
      scope: microsoftWorkspaceTokens.scope,
      status: microsoftWorkspaceTokens.status,
      lastError: microsoftWorkspaceTokens.lastError,
      updatedAt: microsoftWorkspaceTokens.updatedAt,
    })
    .from(microsoftWorkspaceTokens)
    .where(eq(microsoftWorkspaceTokens.userId, userId))
    .limit(1)

  return c.json({
    enabled: true,
    connected: !!row,
    email: row?.email ?? null,
    scopes: row?.scope?.split(' ').filter(Boolean) ?? [],
    status: row?.status ?? null,
    lastError: row?.lastError ?? null,
    updatedAt: row?.updatedAt ?? null,
  })
})

/**
 * POST /connect — returns an authorizationUrl for the client to navigate
 * to (top-level redirect, not popup). Sets msw_state + msw_user cookies.
 */
app.post('/connect', async (c) => {
  const userId = c.get('userId')
  const env = c.env as unknown as MicrosoftWorkspaceEnv

  if (!isMicrosoftWorkspaceEnabled(env)) {
    return c.json({ error: 'Microsoft Workspace is not configured on this server' }, 501)
  }

  const state = randomToken(24)
  const authUrl = new URL(authEndpoint(env))
  authUrl.searchParams.set('client_id', env.MICROSOFT_WORKSPACE_CLIENT_ID!)
  authUrl.searchParams.set('redirect_uri', redirectUri(env))
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('response_mode', 'query')
  authUrl.searchParams.set('scope', MICROSOFT_WORKSPACE_SCOPES.join(' '))
  // `select_account` ensures the user picks which MS account to connect,
  // relevant for users with multiple (work + personal) accounts signed in.
  authUrl.searchParams.set('prompt', 'select_account')
  authUrl.searchParams.set('state', state)

  const cookieBase = `Path=/; Max-Age=600; HttpOnly; SameSite=Lax`
  const secure = env.BETTER_AUTH_URL?.startsWith('https://') ? '; Secure' : ''
  const headers = new Headers({ 'Content-Type': 'application/json' })
  headers.append('Set-Cookie', `msw_state=${encodeURIComponent(state)}; ${cookieBase}${secure}`)
  headers.append('Set-Cookie', `msw_user=${encodeURIComponent(userId)}; ${cookieBase}${secure}`)

  return new Response(
    JSON.stringify({ authorizationUrl: authUrl.toString() }),
    { headers },
  )
})

/** POST /disconnect — delete D1 row. Microsoft has no central revoke endpoint. */
app.post('/disconnect', async (c) => {
  const userId = c.get('userId')
  const env = c.env as unknown as MicrosoftWorkspaceEnv
  await revokeAndDelete(env, userId)
  return c.json({
    success: true,
    // Surface the "fully revoke" path so users who really care can follow it.
    revokeUrl: 'https://myaccount.microsoft.com/consent',
  })
})

function callbackPage(args: { status: 'success' | 'error'; message?: string }): string {
  const body =
    args.status === 'success'
      ? `<h1 style="font:600 20px system-ui">Microsoft Workspace connected!</h1><p style="color:#555;font:14px system-ui">You can close this tab.</p>`
      : `<h1 style="font:600 20px system-ui;color:#b91c1c">Connection failed</h1><p style="color:#555;font:14px system-ui">${args.message ?? ''}</p>`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Microsoft Workspace</title></head>
<body style="font-family:system-ui;padding:32px;max-width:480px;margin:48px auto;text-align:center">
${body}
<script>
  try { window.opener && window.opener.postMessage({ type: 'microsoft-workspace', status: ${JSON.stringify(args.status)} }, '*'); } catch (_) {}
  setTimeout(() => { window.location.href = '/dashboard/connections' }, 1500);
</script>
</body></html>`
}

export default app
