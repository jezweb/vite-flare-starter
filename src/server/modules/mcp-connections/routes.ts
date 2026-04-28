/**
 * MCP connector routes — per-user list, add, remove, OAuth callbacks,
 * per-tool policies.
 *
 * All routes require auth. Tokens are encrypted at rest (see crypto.ts).
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import {
  userMcpConnections,
  userMcpToolPolicies,
} from './db/schema'
import { probeMcpServer, registerOAuthClient } from './probe'
import { encrypt, decrypt, generatePkcePair, randomToken } from '@/server/lib/crypto'
import { MCP_CATALOG, findCatalogEntry } from '@/shared/config/connector-catalog'

const app = new Hono<AuthContext>()

/** Public catalogue — no auth middleware above this route. */
app.get('/catalog', (c) => {
  return c.json({ catalog: MCP_CATALOG })
})

/**
 * OAuth callback — public route because the user arrives from the OAuth
 * provider, not our session. PKCE verifier + connection id travel via
 * short-lived signed cookies set at /connect time.
 */
app.get('/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const err = c.req.query('error')

  if (err) {
    return c.html(callbackPage({ status: 'error', message: err }))
  }
  if (!code || !state) {
    return c.html(callbackPage({ status: 'error', message: 'Missing code or state' }))
  }

  const cookieHeader = c.req.header('cookie') ?? ''
  const pkceMatch = cookieHeader.match(/mcp_pkce=([^;]+)/)
  const connectionMatch = cookieHeader.match(/mcp_conn=([^;]+)/)
  if (!pkceMatch || !connectionMatch) {
    return c.html(callbackPage({ status: 'error', message: 'Missing session — try connecting again.' }))
  }
  const pkceVerifier = decodeURIComponent(pkceMatch[1]!)
  const connectionId = decodeURIComponent(connectionMatch[1]!)

  const db = drizzle(c.env.DB)
  const [conn] = await db
    .select()
    .from(userMcpConnections)
    .where(eq(userMcpConnections.id, connectionId))
    .limit(1)

  if (!conn || !conn.tokenEndpoint) {
    return c.html(callbackPage({ status: 'error', message: 'Connection not found.' }))
  }

  const redirectUri = new URL('/api/mcp-connections/callback', c.env.BETTER_AUTH_URL).toString()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: pkceVerifier,
    client_id: conn.oauthClientId ?? '',
  })
  if (conn.oauthClientSecret) {
    const clientSecret = await decrypt(conn.oauthClientSecret, (c.env as unknown as { TOKEN_ENCRYPTION_KEY?: string }).TOKEN_ENCRYPTION_KEY)
    if (clientSecret) body.set('client_secret', clientSecret)
  }

  const tokenResp = await fetch(conn.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text()
    await db
      .update(userMcpConnections)
      .set({ status: 'error', lastError: `Token exchange failed: ${errBody.slice(0, 500)}` })
      .where(eq(userMcpConnections.id, connectionId))
    return c.html(callbackPage({ status: 'error', message: 'Token exchange failed.' }))
  }

  const tokens = (await tokenResp.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }

  const tokenKey = (c.env as unknown as { TOKEN_ENCRYPTION_KEY?: string }).TOKEN_ENCRYPTION_KEY
  const encAccess = await encrypt(tokens.access_token, tokenKey)
  const encRefresh = tokens.refresh_token ? await encrypt(tokens.refresh_token, tokenKey) : null
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  await db
    .update(userMcpConnections)
    .set({
      status: 'active',
      accessToken: encAccess,
      refreshToken: encRefresh,
      expiresAt,
      scope: tokens.scope ?? null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(userMcpConnections.id, connectionId))

  const clear = 'Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' })
  headers.append('Set-Cookie', `mcp_pkce=; ${clear}`)
  headers.append('Set-Cookie', `mcp_conn=; ${clear}`)
  return new Response(callbackPage({ status: 'success' }), { headers })
})

// All subsequent routes require authentication.
app.use('*', authMiddleware)

/** GET / — list the user's connections with tokens redacted. */
app.get('/', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)
  const rows = await db
    .select()
    .from(userMcpConnections)
    .where(eq(userMcpConnections.userId, userId))

  return c.json({
    connections: rows.map((r) => ({
      id: r.id,
      connectorId: r.connectorId,
      displayName: r.displayName,
      url: r.url,
      transport: r.transport,
      authType: r.authType,
      status: r.status,
      lastError: r.lastError,
      scope: r.scope,
      hasAccessToken: !!r.accessToken,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // Slice 9 — Connection Profiles
      personalityLabel: r.personalityLabel,
      allowedAgentNames: r.allowedAgentNamesJson
        ? safeParseStringArray(r.allowedAgentNamesJson)
        : null,
    })),
  })
})

/** POST /probe — inspect an MCP endpoint for auth mode + OAuth metadata. */
app.post(
  '/probe',
  zValidator('json', z.object({ url: z.string().url() })),
  async (c) => {
    const { url } = c.req.valid('json')
    const result = await probeMcpServer(url)
    return c.json(result)
  },
)

/**
 * POST /connect — create or update a connection row and kick off OAuth
 * if required. Returns { connectionId, authorizationUrl? }.
 */
const connectSchema = z
  .object({
    connectorId: z.string().min(1).max(100),
    displayName: z.string().min(1).max(100).optional(),
    url: z.string().url().optional(),
  })
  .refine(
    (v) => findCatalogEntry(v.connectorId) || (v.connectorId.startsWith('custom:') && v.url),
    'custom connectors require a url',
  )

app.post('/connect', zValidator('json', connectSchema), async (c) => {
  const input = c.req.valid('json')
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)
  const tokenKey = (c.env as unknown as { TOKEN_ENCRYPTION_KEY?: string }).TOKEN_ENCRYPTION_KEY

  const catalog = findCatalogEntry(input.connectorId)
  const url = catalog?.url ?? input.url!
  const displayName = input.displayName ?? catalog?.name ?? new URL(url).hostname
  const transport = catalog?.transport ?? 'http'

  const probeResult = await probeMcpServer(url)

  const [existing] = await db
    .select()
    .from(userMcpConnections)
    .where(
      and(
        eq(userMcpConnections.userId, userId),
        eq(userMcpConnections.connectorId, input.connectorId),
        eq(userMcpConnections.url, url),
      ),
    )
    .limit(1)

  const connectionId = existing?.id ?? crypto.randomUUID()

  if (probeResult.authType === 'none') {
    const row = {
      id: connectionId,
      userId,
      connectorId: input.connectorId,
      displayName,
      url,
      transport,
      authType: 'none' as const,
      status: 'active' as const,
    }
    if (existing) {
      await db.update(userMcpConnections).set(row).where(eq(userMcpConnections.id, connectionId))
    } else {
      await db.insert(userMcpConnections).values(row)
    }
    return c.json({ connectionId, authType: 'none', status: 'active' })
  }

  if (probeResult.authType === 'bearer') {
    const row = {
      id: connectionId,
      userId,
      connectorId: input.connectorId,
      displayName,
      url,
      transport,
      authType: 'bearer' as const,
      status: 'pending' as const,
    }
    if (existing) {
      await db.update(userMcpConnections).set(row).where(eq(userMcpConnections.id, connectionId))
    } else {
      await db.insert(userMcpConnections).values(row)
    }
    return c.json({ connectionId, authType: 'bearer', status: 'pending' })
  }

  // OAuth path — run DCR if needed and build the authorization URL.
  const redirectUri = new URL('/api/mcp-connections/callback', c.env.BETTER_AUTH_URL).toString()

  let clientId = probeResult.authorizationEndpoint ? existing?.oauthClientId : null
  let clientSecretCipher: string | null = null

  if (!clientId && probeResult.registrationEndpoint) {
    const registered = await registerOAuthClient(probeResult.registrationEndpoint, redirectUri)
    if (registered) {
      clientId = registered.clientId
      if (registered.clientSecret) {
        clientSecretCipher = await encrypt(registered.clientSecret, tokenKey)
      }
    }
  }

  if (!clientId || !probeResult.authorizationEndpoint || !probeResult.tokenEndpoint) {
    return c.json(
      {
        error:
          'OAuth setup incomplete. The MCP server did not advertise a registration endpoint. Provide a pre-registered client ID via /:id/config.',
      },
      400,
    )
  }

  const { verifier, challenge } = await generatePkcePair()
  const state = randomToken()

  const row = {
    id: connectionId,
    userId,
    connectorId: input.connectorId,
    displayName,
    url,
    transport,
    authType: 'oauth' as const,
    status: 'pending' as const,
    authServerUrl: probeResult.authServerUrl ?? null,
    tokenEndpoint: probeResult.tokenEndpoint,
    authorizationEndpoint: probeResult.authorizationEndpoint,
    registrationEndpoint: probeResult.registrationEndpoint ?? null,
    oauthClientId: clientId,
    oauthClientSecret: clientSecretCipher,
  }
  if (existing) {
    await db.update(userMcpConnections).set(row).where(eq(userMcpConnections.id, connectionId))
  } else {
    await db.insert(userMcpConnections).values(row)
  }

  const authUrl = new URL(probeResult.authorizationEndpoint)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  if (catalog?.scopes?.length) authUrl.searchParams.set('scope', catalog.scopes.join(' '))

  const cookieBase = `Path=/; Max-Age=600; HttpOnly; SameSite=Lax`
  const secure = c.env.BETTER_AUTH_URL?.startsWith('https://') ? '; Secure' : ''
  const headers = new Headers({ 'Content-Type': 'application/json' })
  headers.append('Set-Cookie', `mcp_pkce=${encodeURIComponent(verifier)}; ${cookieBase}${secure}`)
  headers.append('Set-Cookie', `mcp_conn=${encodeURIComponent(connectionId)}; ${cookieBase}${secure}`)

  return new Response(
    JSON.stringify({
      connectionId,
      authType: 'oauth',
      status: 'pending',
      authorizationUrl: authUrl.toString(),
    }),
    { headers },
  )
})

/** POST /:id/bearer — save a bearer token the user pasted in. */
app.post(
  '/:id/bearer',
  zValidator('json', z.object({ token: z.string().min(1) })),
  async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const { token } = c.req.valid('json')
    const db = drizzle(c.env.DB)
    const tokenKey = (c.env as unknown as { TOKEN_ENCRYPTION_KEY?: string }).TOKEN_ENCRYPTION_KEY

    const enc = await encrypt(token, tokenKey)
    const result = await db
      .update(userMcpConnections)
      .set({
        accessToken: enc,
        authType: 'bearer',
        status: 'active',
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(userMcpConnections.id, id), eq(userMcpConnections.userId, userId)))
      .returning({ id: userMcpConnections.id })

    if (result.length === 0) return c.json({ error: 'Not found' }, 404)
    return c.json({ success: true })
  },
)

/**
 * POST /:id/authorize — re-issue an OAuth authorization URL for a pending
 * connection. Used by the Resume flow (Cn3 fix) when the popup was blocked
 * or the user closed it. Generates fresh PKCE + state cookies.
 */
app.post('/:id/authorize', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)

  const [conn] = await db
    .select()
    .from(userMcpConnections)
    .where(and(eq(userMcpConnections.id, id), eq(userMcpConnections.userId, userId)))
    .limit(1)

  if (!conn) return c.json({ error: 'Not found' }, 404)
  if (conn.authType !== 'oauth' || !conn.authorizationEndpoint || !conn.oauthClientId) {
    return c.json({ error: 'Connection does not use OAuth' }, 400)
  }

  const redirectUri = new URL('/api/mcp-connections/callback', c.env.BETTER_AUTH_URL).toString()
  const { verifier, challenge } = await generatePkcePair()
  const state = randomToken()

  const authUrl = new URL(conn.authorizationEndpoint)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', conn.oauthClientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  if (conn.scope) authUrl.searchParams.set('scope', conn.scope)

  const cookieBase = `Path=/; Max-Age=600; HttpOnly; SameSite=Lax`
  const secure = c.env.BETTER_AUTH_URL?.startsWith('https://') ? '; Secure' : ''
  const headers = new Headers({ 'Content-Type': 'application/json' })
  headers.append('Set-Cookie', `mcp_pkce=${encodeURIComponent(verifier)}; ${cookieBase}${secure}`)
  headers.append('Set-Cookie', `mcp_conn=${encodeURIComponent(id)}; ${cookieBase}${secure}`)

  return new Response(
    JSON.stringify({ authorizationUrl: authUrl.toString() }),
    { headers },
  )
})

/** DELETE /:id — disconnect. Cascades to tool policies. */
app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const result = await db
    .delete(userMcpConnections)
    .where(and(eq(userMcpConnections.id, id), eq(userMcpConnections.userId, userId)))
    .returning({ id: userMcpConnections.id })
  if (result.length === 0) return c.json({ error: 'Not found' }, 404)
  return c.json({ success: true })
})

/** GET /:id/tools — discover tools via JSON-RPC tools/list + effective policies. */
/**
 * GET /:id/resources — list MCP resources exposed by a connected
 * server. Mirrors the tools-list pattern but uses MCP's
 * `resources/list` JSON-RPC method. Best-effort — servers that don't
 * implement resources return [].
 */
app.get('/:id/resources', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const [conn] = await db
    .select()
    .from(userMcpConnections)
    .where(and(eq(userMcpConnections.id, id), eq(userMcpConnections.userId, userId)))
    .limit(1)
  if (!conn) return c.json({ error: 'Not found' }, 404)
  const tokenKey = (c.env as unknown as { TOKEN_ENCRYPTION_KEY?: string }).TOKEN_ENCRYPTION_KEY
  const accessToken = await decrypt(conn.accessToken, tokenKey)
  let resources: Array<{ uri: string; name?: string; description?: string; mimeType?: string }> = []
  try {
    const resp = await fetch(conn.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/list',
        params: {},
      }),
    })
    if (resp.ok) {
      const json = (await resp.json()) as {
        result?: { resources?: Array<{ uri: string; name?: string; description?: string; mimeType?: string }> }
      }
      resources = json.result?.resources ?? []
    }
  } catch {
    // Best-effort — many servers don't implement resources.
  }
  return c.json({ resources, server: conn.displayName })
})

app.get('/:id/tools', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)

  const [conn] = await db
    .select()
    .from(userMcpConnections)
    .where(and(eq(userMcpConnections.id, id), eq(userMcpConnections.userId, userId)))
    .limit(1)

  if (!conn) return c.json({ error: 'Not found' }, 404)

  const tokenKey = (c.env as unknown as { TOKEN_ENCRYPTION_KEY?: string }).TOKEN_ENCRYPTION_KEY
  const accessToken = await decrypt(conn.accessToken, tokenKey)

  let tools: Array<{ name: string; description?: string }> = []
  try {
    const resp = await fetch(conn.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    })
    if (resp.ok) {
      const json = (await resp.json()) as {
        result?: { tools?: Array<{ name: string; description?: string }> }
      }
      tools = json.result?.tools ?? []
    }
  } catch {
    // Tool discovery is best-effort.
  }

  const policies = await db
    .select()
    .from(userMcpToolPolicies)
    .where(eq(userMcpToolPolicies.connectionId, id))

  const policyMap = new Map(policies.map((p) => [p.toolName, p.policy]))

  return c.json({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description ?? null,
      policy: policyMap.get(t.name) ?? 'ask',
    })),
  })
})

/**
 * PATCH /:id/profile — update Connection Profile fields (slice 9).
 *
 * Connection Profiles let a user have multiple connections to the same
 * MCP server type, each labelled, each scoped to a specific subset of
 * agents. This endpoint manages those two fields.
 */
app.patch(
  '/:id/profile',
  zValidator(
    'json',
    z.object({
      personalityLabel: z.string().max(60).nullable().optional(),
      allowedAgentNames: z.array(z.string().min(1).max(120)).nullable().optional(),
    }),
  ),
  async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const db = drizzle(c.env.DB)
    const [conn] = await db
      .select({ id: userMcpConnections.id })
      .from(userMcpConnections)
      .where(and(eq(userMcpConnections.id, id), eq(userMcpConnections.userId, userId)))
      .limit(1)
    if (!conn) return c.json({ error: 'Not found' }, 404)

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body['personalityLabel'] !== undefined) {
      const label = body['personalityLabel']
      updates['personalityLabel'] = label && label.trim().length > 0 ? label.trim() : null
    }
    if (body['allowedAgentNames'] !== undefined) {
      const arr = body['allowedAgentNames']
      updates['allowedAgentNamesJson'] =
        arr && arr.length > 0 ? JSON.stringify(Array.from(new Set(arr))) : null
    }
    await db
      .update(userMcpConnections)
      .set(updates)
      .where(and(eq(userMcpConnections.id, id), eq(userMcpConnections.userId, userId)))
    return c.json({ success: true })
  },
)

/** PUT /:id/tool-policies — batch-update policies for tools on a connection. */
app.put(
  '/:id/tool-policies',
  zValidator(
    'json',
    z.object({
      policies: z.array(
        z.object({
          toolName: z.string().min(1),
          policy: z.enum(['always', 'ask', 'never']),
        }),
      ),
    }),
  ),
  async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const { policies } = c.req.valid('json')
    const db = drizzle(c.env.DB)

    const [conn] = await db
      .select({ id: userMcpConnections.id })
      .from(userMcpConnections)
      .where(and(eq(userMcpConnections.id, id), eq(userMcpConnections.userId, userId)))
      .limit(1)
    if (!conn) return c.json({ error: 'Not found' }, 404)

    for (const p of policies) {
      await db
        .insert(userMcpToolPolicies)
        .values({
          userId,
          connectionId: id,
          toolName: p.toolName,
          policy: p.policy,
        })
        .onConflictDoUpdate({
          target: [userMcpToolPolicies.connectionId, userMcpToolPolicies.toolName],
          set: { policy: p.policy, updatedAt: new Date() },
        })
    }

    return c.json({ success: true, count: policies.length })
  },
)

function callbackPage(args: { status: 'success' | 'error'; message?: string }): string {
  const body =
    args.status === 'success'
      ? `<h1 style="font:600 20px system-ui">Connected!</h1><p style="color:#555;font:14px system-ui">You can close this window.</p>`
      : `<h1 style="font:600 20px system-ui;color:#b91c1c">Connection failed</h1><p style="color:#555;font:14px system-ui">${args.message ?? ''}</p>`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Connector</title></head>
<body style="font-family:system-ui;padding:32px;max-width:480px;margin:48px auto;text-align:center">
${body}
<script>
  try { window.opener && window.opener.postMessage({ type: 'mcp-connection', status: ${JSON.stringify(args.status)} }, '*'); } catch (_) {}
  setTimeout(() => { try { window.close() } catch (_) {} }, 1500);
</script>
</body></html>`
}

/** Defensive JSON-array parse — returns null on any error. */
function safeParseStringArray(json: string): string[] | null {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null
  } catch {
    return null
  }
}

export default app
