/**
 * Shared scaffolding for stub connector providers (Slack, Notion,
 * Atlassian, etc.) — the pieces that are identical across providers so
 * each one ships as a thin config-only file.
 *
 * Each stub provider needs:
 *   - A token table (we use a shared `connector_tokens` table keyed by
 *     `connector_id` + `user_id`, rather than one table per provider.
 *     Cheaper to scaffold many providers that way).
 *   - OAuth routes (connect/callback/disconnect/status).
 *   - Tool implementations (filled in later).
 *
 * Since the token-table-per-provider pattern is already established for
 * Google and Microsoft (for historical + clarity reasons), we do the
 * same for each new provider — keeps the mental model consistent. This
 * file is the factory that makes that cheap.
 */
import type { D1Database } from '@cloudflare/workers-types'
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { encrypt, decrypt, randomToken } from '@/server/lib/crypto'

/**
 * Creates a per-provider token table definition. Pass a unique physical
 * table name (matches the migration SQL). Returns the Drizzle table +
 * types so the provider's module can export them for schema registry.
 */
export function defineProviderTokenTable(physicalName: string) {
  return sqliteTable(physicalName, {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    expiresAt: text('expires_at').notNull(),
    scope: text('scope').notNull(),
    /** User-facing account label — email, workspace name, domain, etc. */
    accountLabel: text('account_label'),
    /** Provider-specific (team_id / workspace_id / site_id) — raw string. */
    accountIdentifier: text('account_identifier'),
    status: text('status').notNull().default('active'),
    lastError: text('last_error'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  })
}

/** Concrete table type returned by defineProviderTokenTable. Used as the
 *  parameter type of StubProviderConfig so Drizzle accepts it without any. */
type ProviderTokenTable = ReturnType<typeof defineProviderTokenTable>

/**
 * Generic token-bag shape — every stub provider stores the same kind
 * of record, just in its own table for clarity.
 */
export interface TokenBag {
  userId: string
  accessToken: string
  refreshToken: string
  expiresAt: string
  scope: string
  accountLabel?: string | null
  accountIdentifier?: string | null
  status: string
  lastError?: string | null
}

export interface StubProviderConfig {
  /** Provider id (matches CONNECTOR_PROVIDERS[].id). */
  providerId: string
  /** The Drizzle table returned by defineProviderTokenTable. */
  tokenTable: ProviderTokenTable
  /** Env var names for client id + secret. */
  envVars: { clientId: string; clientSecret: string }
  /** OAuth endpoints. */
  authorizeEndpoint: string
  tokenEndpoint: string
  /** Scopes to request, space-joined on the authorize URL. */
  scopes: string[]
  /**
   * Post-token-exchange: look up the user's profile (email / workspace
   * name) to populate `accountLabel` + `accountIdentifier`. Optional —
   * if omitted, those columns are left null.
   */
  fetchAccountInfo?: (accessToken: string) => Promise<{
    accountLabel?: string
    accountIdentifier?: string
  }>
  /**
   * Some OAuth servers want a `redirect_uri` in the token exchange,
   * others don't. Default: include it. Override to `false` for
   * Notion (which rejects it).
   */
  includeRedirectUriInTokenExchange?: boolean
  /** Extra params to include on the authorize URL (e.g. Notion's `owner=user`). */
  extraAuthParams?: Record<string, string>
}

/** Generic env shape for stub providers. DB is read as the standard D1
 *  binding (cast at use sites). All other env values are expected to be
 *  plain strings or undefined (client id, client secret, BETTER_AUTH_URL,
 *  TOKEN_ENCRYPTION_KEY). We don't declare DB on this type to avoid the
 *  index-signature conflict. */
export type StubEnv = Record<string, string | undefined>

/**
 * Builds a Hono sub-app exposing the 4 standard routes for a stub
 * provider:
 *   GET  /status    — { enabled, connected, accountLabel, scopes, status }
 *   POST /connect   — returns { authorizationUrl } (top-level redirect)
 *   GET  /callback  — consumes OAuth code, writes token row, returns HTML
 *   POST /disconnect — deletes the token row
 *
 * Mount at `/api/<providerId>` in the main server.
 */
export function buildStubRoutes(
  config: StubProviderConfig,
): Hono<AuthContext> {
  const app = new Hono<AuthContext>()
  const { providerId, envVars } = config
  const cookiePrefix = providerId.replace(/-/g, '_')

  const isEnabled = (env: StubEnv) =>
    !!(env[envVars.clientId] && env[envVars.clientSecret])

  const redirectUri = (env: StubEnv) =>
    new URL(`/api/${providerId}/callback`, env['BETTER_AUTH_URL']!).toString()

  // Callback — public (no auth middleware).
  app.get('/callback', async (c) => {
    const env = c.env as unknown as StubEnv
    const code = c.req.query('code')
    const state = c.req.query('state')
    const err = c.req.query('error')
    const errDesc = c.req.query('error_description')

    const finish = (status: 'success' | 'error', message?: string) => {
      const html = callbackPage(providerId, config, { status, message })
      const clear = 'Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
      const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' })
      headers.append('Set-Cookie', `${cookiePrefix}_state=; ${clear}`)
      headers.append('Set-Cookie', `${cookiePrefix}_user=; ${clear}`)
      return new Response(html, { headers })
    }

    if (err) return finish('error', errDesc || err)
    if (!code || !state) return finish('error', 'Missing code or state')

    const cookieHeader = c.req.header('cookie') ?? ''
    const stateMatch = cookieHeader.match(
      new RegExp(`${cookiePrefix}_state=([^;]+)`),
    )
    const userMatch = cookieHeader.match(new RegExp(`${cookiePrefix}_user=([^;]+)`))
    if (!stateMatch || !userMatch) {
      return finish('error', 'Missing session — try connecting again.')
    }
    if (decodeURIComponent(stateMatch[1]!) !== state) {
      return finish('error', 'State mismatch')
    }
    const userId = decodeURIComponent(userMatch[1]!)

    if (!isEnabled(env)) {
      return finish('error', `${providerId} is not configured on this server`)
    }

    try {
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: env[envVars.clientId]!,
        client_secret: env[envVars.clientSecret]!,
      })
      if (config.includeRedirectUriInTokenExchange !== false) {
        tokenBody.set('redirect_uri', redirectUri(env))
      }
      const resp = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: tokenBody,
      })
      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(`Token exchange failed: ${resp.status} ${errText.slice(0, 200)}`)
      }
      const json = (await resp.json()) as {
        access_token: string
        refresh_token?: string
        expires_in?: number
        scope?: string
      }

      let accountLabel: string | undefined
      let accountIdentifier: string | undefined
      if (config.fetchAccountInfo) {
        try {
          const info = await config.fetchAccountInfo(json.access_token)
          accountLabel = info.accountLabel
          accountIdentifier = info.accountIdentifier
        } catch {
          // non-fatal — leave nulls
        }
      }

      const accessEnc = await encrypt(json.access_token, env['TOKEN_ENCRYPTION_KEY'])
      const refreshEnc = json.refresh_token
        ? await encrypt(json.refresh_token, env['TOKEN_ENCRYPTION_KEY'])
        : ''
      // Default to 1h when provider doesn't send expires_in.
      const expiresIn = json.expires_in ?? 3600
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

      const db = drizzle((env as unknown as { DB: D1Database }).DB)
      // eslint-disable-next-line + values; sqlite is untyped here
      await db
        .insert(config.tokenTable)
        .values({
          userId,
          accessToken: accessEnc,
          refreshToken: refreshEnc,
          expiresAt,
          scope: json.scope ?? config.scopes.join(' '),
          accountLabel: accountLabel ?? null,
          accountIdentifier: accountIdentifier ?? null,
          status: 'active',
          lastError: null,
        })
        .onConflictDoUpdate({
          target: config.tokenTable.userId,
          set: {
            accessToken: accessEnc,
            refreshToken: refreshEnc || undefined,
            expiresAt,
            scope: json.scope ?? config.scopes.join(' '),
            accountLabel: accountLabel ?? undefined,
            accountIdentifier: accountIdentifier ?? undefined,
            status: 'active',
            lastError: null,
            updatedAt: new Date(),
          },
        })

      return finish('success')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error(
        JSON.stringify({
          event: `${providerId}_callback_error`,
          userId,
          error: message,
        }),
      )
      return finish('error', message.slice(0, 200))
    }
  })

  // Everything below requires auth.
  app.use('*', authMiddleware)

  app.get('/status', async (c) => {
    const env = c.env as unknown as StubEnv
    const userId = c.get('userId')
    if (!isEnabled(env)) return c.json({ enabled: false, connected: false })
    const db = drizzle((env as unknown as { DB: D1Database }).DB)
    // eslint-disable-next-line
    const [row] = await db
      .select()
      .from(config.tokenTable)
      // eslint-disable-next-line
      .where(eq(config.tokenTable.userId, userId))
      .limit(1)
    return c.json({
      enabled: true,
      connected: !!row,
      email: row?.accountLabel ?? null,
      accountIdentifier: row?.accountIdentifier ?? null,
      scopes: row?.scope?.split(' ').filter(Boolean) ?? [],
      status: row?.status ?? null,
      lastError: row?.lastError ?? null,
      updatedAt: row?.updatedAt ?? null,
    })
  })

  app.post('/connect', async (c) => {
    const env = c.env as unknown as StubEnv
    const userId = c.get('userId')
    if (!isEnabled(env)) {
      return c.json({ error: `${providerId} is not configured on this server` }, 501)
    }
    const state = randomToken(24)
    const url = new URL(config.authorizeEndpoint)
    url.searchParams.set('client_id', env[envVars.clientId]!)
    url.searchParams.set('redirect_uri', redirectUri(env))
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', config.scopes.join(' '))
    url.searchParams.set('state', state)
    if (config.extraAuthParams) {
      for (const [k, v] of Object.entries(config.extraAuthParams)) {
        url.searchParams.set(k, v)
      }
    }

    const cookieBase = `Path=/; Max-Age=600; HttpOnly; SameSite=Lax`
    const secure = env['BETTER_AUTH_URL']?.startsWith('https://') ? '; Secure' : ''
    const headers = new Headers({ 'Content-Type': 'application/json' })
    headers.append(
      'Set-Cookie',
      `${cookiePrefix}_state=${encodeURIComponent(state)}; ${cookieBase}${secure}`,
    )
    headers.append(
      'Set-Cookie',
      `${cookiePrefix}_user=${encodeURIComponent(userId)}; ${cookieBase}${secure}`,
    )
    return new Response(
      JSON.stringify({ authorizationUrl: url.toString() }),
      { headers },
    )
  })

  app.post('/disconnect', async (c) => {
    const env = c.env as unknown as StubEnv
    const userId = c.get('userId')
    const db = drizzle((env as unknown as { DB: D1Database }).DB)
    // eslint-disable-next-line
    await db.delete(config.tokenTable).where(eq(config.tokenTable.userId, userId))
    return c.json({ success: true })
  })

  return app
}

/**
 * Get a fresh access token for a stub connector, refreshing if within 5
 * min of expiry. Returns null if not connected or refresh failed.
 */
export async function getStubAccessToken(
  config: StubProviderConfig,
  env: StubEnv,
  userId: string,
): Promise<string | null> {
  const db = drizzle((env as unknown as { DB: D1Database }).DB)
  // eslint-disable-next-line
  const [row] = await db
    .select()
    .from(config.tokenTable)
    // eslint-disable-next-line
    .where(eq(config.tokenTable.userId, userId))
    .limit(1)
  if (!row) return null
  if (row.status !== 'active') return null
  const expiresMs = new Date(row.expiresAt).getTime()
  if (expiresMs > Date.now() + 5 * 60_000) {
    return await decrypt(row.accessToken, env['TOKEN_ENCRYPTION_KEY'])
  }
  // Refresh
  try {
    const refresh = await decrypt(row.refreshToken, env['TOKEN_ENCRYPTION_KEY'])
    if (!refresh) throw new Error('Missing refresh token')
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: env[config.envVars.clientId]!,
      client_secret: env[config.envVars.clientSecret]!,
    })
    const resp = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    })
    if (!resp.ok) throw new Error(`Refresh failed: ${resp.status}`)
    const json = (await resp.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
      scope?: string
    }
    const accessEnc = await encrypt(json.access_token, env['TOKEN_ENCRYPTION_KEY'])
    const refreshEnc = json.refresh_token
      ? await encrypt(json.refresh_token, env['TOKEN_ENCRYPTION_KEY'])
      : undefined
    const expiresAt = new Date(
      Date.now() + (json.expires_in ?? 3600) * 1000,
    ).toISOString()
    // eslint-disable-next-line
    await db
      .update(config.tokenTable)
      .set({
        accessToken: accessEnc,
        ...(refreshEnc ? { refreshToken: refreshEnc } : {}),
        expiresAt,
        scope: json.scope ?? row.scope,
        status: 'active',
        lastError: null,
        updatedAt: new Date(),
      })
      // eslint-disable-next-line
      .where(eq(config.tokenTable.userId, userId))
    return json.access_token
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line
    await db
      .update(config.tokenTable)
      .set({ status: 'error', lastError: message.slice(0, 500), updatedAt: new Date() })
      // eslint-disable-next-line
      .where(eq(config.tokenTable.userId, userId))
    return null
  }
}

function callbackPage(
  providerId: string,
  config: StubProviderConfig,
  args: { status: 'success' | 'error'; message?: string },
): string {
  // Use the connector id as the postMessage type so the client panel
  // (keyed by id) picks up the result.
  const providerLabel = config.providerId.replace(/-/g, ' ')
  const body =
    args.status === 'success'
      ? `<h1 style="font:600 20px system-ui">${providerLabel} connected!</h1><p style="color:#555;font:14px system-ui">You can close this tab.</p>`
      : `<h1 style="font:600 20px system-ui;color:#b91c1c">Connection failed</h1><p style="color:#555;font:14px system-ui">${args.message ?? ''}</p>`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${providerLabel}</title></head>
<body style="font-family:system-ui;padding:32px;max-width:480px;margin:48px auto;text-align:center">
${body}
<script>
  try { window.opener && window.opener.postMessage({ type: ${JSON.stringify(providerId)}, status: ${JSON.stringify(args.status)} }, '*'); } catch (_) {}
  setTimeout(() => { window.location.href = '/dashboard/connections' }, 1500);
</script>
</body></html>`
}
