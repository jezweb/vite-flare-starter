/**
 * Google Workspace OAuth routes — native integration (no MCP).
 *
 *   GET  /api/google-workspace/status      — enabled? connected? which email? scopes?
 *   POST /api/google-workspace/connect     — returns { authorizationUrl } for top-level redirect
 *   GET  /api/google-workspace/callback    — public OAuth redirect handler
 *   POST /api/google-workspace/disconnect  — revoke + delete the D1 row
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { googleWorkspaceTokens } from './db/schema'
import { encrypt, randomToken } from '@/server/lib/crypto'
import {
  exchangeAuthCode,
  isGoogleWorkspaceEnabled,
  redirectUri,
  revokeAndDelete,
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_WORKSPACE_SCOPES,
  type GoogleWorkspaceEnv,
} from './tokens'

const app = new Hono<AuthContext>()

/**
 * Public callback route — the user arrives here from Google's consent
 * screen, not from our session. The signed `gws_state` cookie carries
 * the user id through the round-trip.
 */
app.get('/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const err = c.req.query('error')

  const finish = (status: 'success' | 'error', message?: string) => {
    const html = callbackPage({ status, message })
    const clear = 'Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
    const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' })
    headers.append('Set-Cookie', `gws_state=; ${clear}`)
    headers.append('Set-Cookie', `gws_user=; ${clear}`)
    return new Response(html, { headers })
  }

  if (err) return finish('error', err)
  if (!code || !state) return finish('error', 'Missing code or state')

  const cookieHeader = c.req.header('cookie') ?? ''
  const stateMatch = cookieHeader.match(/gws_state=([^;]+)/)
  const userMatch = cookieHeader.match(/gws_user=([^;]+)/)
  if (!stateMatch || !userMatch) return finish('error', 'Missing session — try connecting again.')
  if (decodeURIComponent(stateMatch[1]!) !== state) return finish('error', 'State mismatch')

  const userId = decodeURIComponent(userMatch[1]!)
  const env = c.env as unknown as GoogleWorkspaceEnv

  if (!isGoogleWorkspaceEnabled(env)) {
    return finish('error', 'Google Workspace is not configured on this server')
  }

  try {
    const tokens = await exchangeAuthCode(env, code)
    if (!tokens.refreshToken) {
      // Without a refresh token we can't keep the connection alive past
      // the first hour. Happens when the user previously authorised this
      // app — Google only returns refresh_token the first time unless
      // `prompt=consent` is set on the authorize URL (which we do).
      // Warn in logs and continue.
      console.warn(
        JSON.stringify({ event: 'google_workspace_no_refresh_token', userId }),
      )
    }

    const accessTokenEnc = await encrypt(tokens.accessToken, env.TOKEN_ENCRYPTION_KEY)
    const refreshTokenEnc = tokens.refreshToken
      ? await encrypt(tokens.refreshToken, env.TOKEN_ENCRYPTION_KEY)
      : ''
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString()

    const db = drizzle(env.DB)
    await db
      .insert(googleWorkspaceTokens)
      .values({
        userId,
        accessToken: accessTokenEnc,
        refreshToken: refreshTokenEnc,
        expiresAt,
        scope: tokens.scope,
        googleEmail: tokens.email,
        status: 'active',
        lastError: null,
      })
      .onConflictDoUpdate({
        target: googleWorkspaceTokens.userId,
        set: {
          accessToken: accessTokenEnc,
          refreshToken: refreshTokenEnc || undefined,
          expiresAt,
          scope: tokens.scope,
          googleEmail: tokens.email ?? undefined,
          status: 'active',
          lastError: null,
          updatedAt: new Date(),
        },
      })

    return finish('success')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(
      JSON.stringify({ event: 'google_workspace_callback_error', userId, error: message }),
    )
    return finish('error', message.slice(0, 200))
  }
})

// Everything below requires auth.
app.use('*', authMiddleware)

/** GET / — enabled? connected? email? scopes? */
app.get('/status', async (c) => {
  const userId = c.get('userId')
  const env = c.env as unknown as GoogleWorkspaceEnv
  const enabled = isGoogleWorkspaceEnabled(env)

  if (!enabled) {
    return c.json({ enabled: false, connected: false })
  }

  const db = drizzle(env.DB)
  const [row] = await db
    .select({
      email: googleWorkspaceTokens.googleEmail,
      scope: googleWorkspaceTokens.scope,
      status: googleWorkspaceTokens.status,
      lastError: googleWorkspaceTokens.lastError,
      updatedAt: googleWorkspaceTokens.updatedAt,
    })
    .from(googleWorkspaceTokens)
    .where(eq(googleWorkspaceTokens.userId, userId))
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
 * to (top-level redirect, not popup). Sets gws_state + gws_user cookies.
 */
app.post('/connect', async (c) => {
  const userId = c.get('userId')
  const env = c.env as unknown as GoogleWorkspaceEnv

  if (!isGoogleWorkspaceEnabled(env)) {
    return c.json({ error: 'Google Workspace is not configured on this server' }, 501)
  }

  const state = randomToken(24)
  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT)
  authUrl.searchParams.set('client_id', env.GOOGLE_WORKSPACE_CLIENT_ID!)
  authUrl.searchParams.set('redirect_uri', redirectUri(env))
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', GOOGLE_WORKSPACE_SCOPES.join(' '))
  // `offline` gets us a refresh token; `consent` forces the consent
  // screen so Google returns refresh_token even on re-auth. Otherwise
  // Google withholds refresh_token on subsequent consent-granted flows.
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('include_granted_scopes', 'true')

  const cookieBase = `Path=/; Max-Age=600; HttpOnly; SameSite=Lax`
  const secure = env.BETTER_AUTH_URL?.startsWith('https://') ? '; Secure' : ''
  const headers = new Headers({ 'Content-Type': 'application/json' })
  headers.append('Set-Cookie', `gws_state=${encodeURIComponent(state)}; ${cookieBase}${secure}`)
  headers.append('Set-Cookie', `gws_user=${encodeURIComponent(userId)}; ${cookieBase}${secure}`)

  return new Response(
    JSON.stringify({ authorizationUrl: authUrl.toString() }),
    { headers },
  )
})

/** POST /disconnect — revoke token at Google, delete D1 row. */
app.post('/disconnect', async (c) => {
  const userId = c.get('userId')
  const env = c.env as unknown as GoogleWorkspaceEnv
  await revokeAndDelete(env, userId)
  return c.json({ success: true })
})

function callbackPage(args: { status: 'success' | 'error'; message?: string }): string {
  const body =
    args.status === 'success'
      ? `<h1 style="font:600 20px system-ui">Google Workspace connected!</h1><p style="color:#555;font:14px system-ui">You can close this tab.</p>`
      : `<h1 style="font:600 20px system-ui;color:#b91c1c">Connection failed</h1><p style="color:#555;font:14px system-ui">${args.message ?? ''}</p>`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Google Workspace</title></head>
<body style="font-family:system-ui;padding:32px;max-width:480px;margin:48px auto;text-align:center">
${body}
<script>
  try { window.opener && window.opener.postMessage({ type: 'google-workspace', status: ${JSON.stringify(args.status)} }, '*'); } catch (_) {}
  setTimeout(() => { window.location.href = '/dashboard/connections' }, 1500);
</script>
</body></html>`
}

export default app
