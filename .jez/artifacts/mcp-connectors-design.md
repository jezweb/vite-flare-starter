# MCP Connectors — Design Doc

**Status**: Approved 2026-04-21, not yet implemented.
**Scope**: Replace the current env-var-only MCP integration with a per-user, OAuth-first connector system. Users can browse a catalogue of known MCP servers, connect/disconnect individually, configure per-tool permissions, and add custom MCP endpoints.

**Owning problem**: "How do users connect their own Google Drive / Gmail / Notion / Sentry / your-thing to this app?"

---

## Principles

1. **OAuth-first.** Bearer tokens are a fallback, not the default. Users expect OAuth.
2. **Probe, don't assume.** The app inspects each MCP server to discover its auth method and tool list before connecting.
3. **Per-user, per-session.** Each chat request loads the authenticated user's connected MCP servers — not a globally-configured set.
4. **Per-tool policy.** Granularity down to `tool_name`: always / ask / never. Matches claude.ai's permission grid.
5. **Graceful degradation.** MCP OAuth spec is still evolving. If a server doesn't speak OAuth, offer bearer. If it doesn't need auth at all, skip the dance.
6. **Catalog + custom.** Ship a curated catalog of popular MCPs (Google Workspace suite, Notion, Sentry, Stripe, etc.). Keep "Add custom connector" for anything not in the catalog.
7. **Own infra stays useful.** Jezweb's `*.mcpserver.au` MCPs fit this model unchanged — they're already OAuth-capable via `@cloudflare/workers-oauth-provider`.

---

## UX reference — claude.ai connectors (2026-04-21)

Screenshots archived under `/Users/jez/Documents/screenshots/Screenshot 2026-04-21 at 10.*.pm.png`. Key UI surfaces:

- **List view** — Settings → Connectors. Cards with icon, name, status (Connect / Connected), "..." menu. Banner pointing to a newer "Customize" page.
- **Browse modal** — "Browse connectors" opens a directory with tabs (Skills / Connectors / Plugins), search, filter, sort. Cards show popularity rank, one-line description, `+` button.
- **Custom section** — installed custom MCPs list the raw URL + CUSTOM badge + Connect / Configure. "Add custom connector" at the bottom.
- **Add custom dialog** — Name + URL fields. Advanced settings reveals OAuth Client ID + Secret. Trust disclaimer about unverified third-party tools.
- **Connector detail page** — `/settings/connectors/<id>` — shows:
  - Uninstall button (top-right)
  - Tool permissions grid grouped by risk tier: "Read-only tools (N)" vs "Write/delete tools (N)"
  - Each group has a default policy dropdown ("Needs approval")
  - Each tool row has a three-button state picker: always allow / ask / never

This is the UX we'll build.

---

## Data model (D1)

```sql
-- Primary connection record. One row per user + MCP server.
CREATE TABLE user_mcp_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,

  -- Catalog entry OR 'custom' + explicit URL
  connector_id TEXT NOT NULL,        -- 'google-drive' | 'gmail' | 'custom:<uuid>'
  display_name TEXT NOT NULL,        -- user-visible label
  url TEXT NOT NULL,                 -- MCP endpoint (e.g. https://drive.mcpserver.au/mcp)
  transport TEXT NOT NULL DEFAULT 'http', -- 'http' | 'sse'

  -- Auth configuration
  auth_type TEXT NOT NULL,           -- 'oauth' | 'bearer' | 'none'
  access_token TEXT,                 -- encrypted
  refresh_token TEXT,                -- encrypted
  expires_at TEXT,                   -- ISO 8601
  scope TEXT,                        -- space-separated granted scopes
  oauth_client_id TEXT,              -- for DCR or pre-registered
  oauth_client_secret TEXT,          -- encrypted, optional

  -- Discovered metadata (from probe)
  auth_server_url TEXT,              -- from /.well-known/oauth-authorization-server
  token_endpoint TEXT,
  authorization_endpoint TEXT,
  registration_endpoint TEXT,        -- for DCR

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'error' | 'revoked'
  last_error TEXT,
  last_used_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX user_mcp_connections_user_idx ON user_mcp_connections(user_id);
CREATE UNIQUE INDEX user_mcp_connections_user_connector_idx
  ON user_mcp_connections(user_id, connector_id, url);

-- Per-tool policy (overrides group default)
CREATE TABLE user_mcp_tool_policies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES user_mcp_connections(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  policy TEXT NOT NULL,              -- 'always' | 'ask' | 'never'
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX user_mcp_tool_policies_uniq
  ON user_mcp_tool_policies(connection_id, tool_name);

-- Ephemeral OAuth state (PKCE, CSRF token)
-- Lives in KV with 10-minute TTL rather than D1 — cheaper for short-lived state
```

### Encryption

Access/refresh tokens and client secrets are sensitive. Encrypt with AES-GCM using a key from `TOKEN_ENCRYPTION_KEY` secret before D1 writes. Decrypt on read. Helper module: `src/server/lib/crypto.ts`.

---

## Catalog

```ts
// src/shared/config/connector-catalog.ts
export interface CatalogEntry {
  id: string
  name: string
  description: string
  category: 'google' | 'productivity' | 'developer' | 'analytics' | 'support' | 'jezweb'
  icon: string                // lucide name or URL
  url: string                 // MCP endpoint
  transport: 'http' | 'sse'
  prefersOAuth: boolean       // hint — we probe anyway
  scopes?: string[]           // expected OAuth scopes (for UI display)
  popularity?: number         // sort hint
  tagline?: string            // short card copy
}

export const MCP_CATALOG: CatalogEntry[] = [
  { id: 'google-drive', name: 'Google Drive', ... },
  { id: 'gmail', name: 'Gmail', ... },
  { id: 'google-calendar', name: 'Google Calendar', ... },
  { id: 'google-docs', name: 'Google Docs', ... },
  { id: 'google-sheets', name: 'Google Sheets', ... },
  { id: 'google-slides', name: 'Google Slides', ... },
  { id: 'google-tasks', name: 'Google Tasks', ... },
  { id: 'google-contacts', name: 'Google Contacts', ... },
  { id: 'notion', name: 'Notion', ... },
  { id: 'github', name: 'GitHub', ... },
  { id: 'sentry', name: 'Sentry', ... },
  // ... extend as ecosystem grows
]
```

Catalog lives in `src/shared/config/` so both client and server can read it. Client renders cards. Server validates `connectorId` on connect to prevent drift.

---

## OAuth flow (primary path)

The MCP spec (https://modelcontextprotocol.io/specification/draft/basic/authorization) describes OAuth 2.1 with PKCE and optional Dynamic Client Registration.

### Step 1 — Probe

When the user clicks "Connect" on a catalog card:

```ts
async function probeMcpServer(url: string): Promise<ProbeResult> {
  // Try an unauthenticated request, inspect WWW-Authenticate or .well-known
  const res = await fetch(url, { method: 'POST', body: JSON.stringify({...}) })
  if (res.status === 401) {
    const challenge = parseWWWAuthenticate(res.headers.get('www-authenticate'))
    const authMeta = await fetch(challenge.resourceMetadataUrl ||
      new URL('/.well-known/oauth-authorization-server', url).toString())
    return {
      authType: 'oauth',
      authServer: authMeta.issuer,
      authorizationEndpoint: authMeta.authorization_endpoint,
      tokenEndpoint: authMeta.token_endpoint,
      registrationEndpoint: authMeta.registration_endpoint,
      supportedScopes: authMeta.scopes_supported,
    }
  }
  if (res.ok) return { authType: 'none' }
  // Fallback for bearer-only servers: try with a test header, infer from error
  return { authType: 'bearer' }
}
```

### Step 2 — Register (DCR)

If `registration_endpoint` is present, register our app dynamically:

```ts
POST https://auth-server/register
{
  "client_name": "Vite Flare Starter",
  "redirect_uris": ["https://our-app/api/mcp/oauth/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_method": "none"  // PKCE, no secret
}
// Response includes client_id (sometimes client_secret)
```

Store `client_id` on the connection record. If DCR isn't supported, the app falls back to a pre-configured client or asks the user to provide one (Advanced settings field).

### Step 3 — Authorize (browser-side)

```ts
// Generate PKCE verifier + challenge, store in KV (5 min TTL) keyed by state
const state = crypto.randomUUID()
const verifier = base64urlrandom(32)
const challenge = await sha256base64url(verifier)
await KV.put(`mcp-oauth:${state}`, JSON.stringify({ connectorId, verifier, userId }), { expirationTtl: 300 })

const authUrl = new URL(authorizationEndpoint)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', callbackUrl)
authUrl.searchParams.set('code_challenge', challenge)
authUrl.searchParams.set('code_challenge_method', 'S256')
authUrl.searchParams.set('state', state)
authUrl.searchParams.set('scope', scopes.join(' '))

return c.json({ authUrl })
```

Client opens this URL in a popup or redirects the main window.

### Step 4 — Callback

`/api/mcp/oauth/callback?code=...&state=...`:

```ts
const stored = await KV.get(`mcp-oauth:${state}`)
if (!stored) return c.text('Expired OAuth state', 400)
const { connectorId, verifier, userId } = JSON.parse(stored)
await KV.delete(`mcp-oauth:${state}`)

const tokens = await fetch(tokenEndpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code, client_id: clientId,
    code_verifier: verifier,
    redirect_uri: callbackUrl,
  }),
}).then(r => r.json())

await db.insert(userMcpConnections).values({
  userId, connectorId, url, authType: 'oauth',
  accessToken: await encrypt(tokens.access_token),
  refreshToken: tokens.refresh_token ? await encrypt(tokens.refresh_token) : null,
  expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  scope: tokens.scope,
  oauthClientId: clientId,
  // ... + endpoints from probe
})

return c.html('<script>window.opener.postMessage({type:"mcp-connected"},"*");window.close()</script>')
```

### Step 5 — Use tokens at chat time

`src/server/lib/ai/mcp.ts` refactor:

```ts
export async function createUserMCPManager(
  env: Env, userId: string
): Promise<MCPManager> {
  const db = drizzle(env.DB)
  const connections = await db.select().from(userMcpConnections)
    .where(eq(userMcpConnections.userId, userId))
    .and(eq(userMcpConnections.status, 'active'))

  const clients = await Promise.all(connections.map(async (conn) => {
    const accessToken = await maybeRefresh(conn, env)
    return createMCPClient({
      transport: { type: conn.transport, url: conn.url,
        headers: { Authorization: `Bearer ${accessToken}` } },
    })
  }))
  // ...
}

async function maybeRefresh(conn: Connection, env: Env) {
  if (!conn.expiresAt || new Date(conn.expiresAt) > new Date(Date.now() + 60_000)) {
    return await decrypt(conn.accessToken)
  }
  // Token expired — refresh
  const tokens = await fetch(conn.tokenEndpoint, { ... }).then(r => r.json())
  await updateConnectionTokens(env, conn.id, tokens)
  return tokens.access_token
}
```

### Step 6 — Handle 401 during tool call

If an MCP tool call returns 401 mid-session (e.g. token revoked server-side), refresh once and retry. If refresh fails, mark connection `status = 'error'`, surface in UI.

---

## Bearer flow (fallback)

Simpler path for MCPs that only speak bearer tokens.

1. User clicks "Connect" — probe returns `authType: 'bearer'`
2. UI shows a modal: "This MCP server uses a bearer token. Paste it below."
3. User pastes, server validates with a quick tool-list call, stores encrypted
4. No refresh, no callback, no DCR

Use for: legacy MCPs, Jezweb's `AUTH_TOKEN`-based server-to-server mode, the "Advanced → bearer token" path for custom connectors.

---

## "None" flow

Some MCPs are fully public. Probe returns `authType: 'none'` → just store the URL and connect immediately. No auth at all.

---

## Per-tool permissions UI

Connector detail page (`/dashboard/settings/connectors/:id`):

```
< All connectors

[icon] Google Drive                                        [Uninstall]

Tool permissions
Choose when Claude is allowed to use these tools.

Read-only tools (3)                                [Needs approval ▼]
  drive_search                           [✓ always] [? ask] [✕ never]
  drive_list_files                       [✓ always] [? ask] [✕ never]
  drive_read_file                        [✓ always] [? ask] [✕ never]

Write/delete tools (2)                             [Needs approval ▼]
  drive_upload_file                      [✓ always] [? ask] [✕ never]
  drive_delete_file                      [✓ always] [? ask] [✕ never]
```

**Grouping heuristic** (server-side):

```ts
function classifyTool(tool: MCPTool): 'readonly' | 'writedelete' {
  // 1. Check MCP annotations — spec includes destructiveHint, readOnlyHint
  if (tool.annotations?.readOnlyHint) return 'readonly'
  if (tool.annotations?.destructiveHint) return 'writedelete'

  // 2. Heuristic on name
  const name = tool.name.toLowerCase()
  if (/\b(list|get|read|search|find|view|fetch|status|describe)\b/.test(name)) return 'readonly'
  if (/\b(create|update|write|delete|remove|send|publish|upload|move)\b/.test(name)) return 'writedelete'

  // 3. Default — write/delete (safer default)
  return 'writedelete'
}
```

**Enforcement** (agent-side):

```ts
// Wrap each MCP tool's execute with a policy check
function wrapWithPolicy(tool: Tool, connectionId: string, userId: string, env: Env): Tool {
  return {
    ...tool,
    execute: async (args, options) => {
      const policy = await getPolicy(env, userId, connectionId, tool.name) // default: 'ask'
      if (policy === 'never') {
        return { error: 'Tool disabled by user policy' }
      }
      if (policy === 'ask') {
        // Surface as confirm_action UI element — reuse existing pattern
        // (inline UI tools already have approval UX via `needsApproval`)
        options.needsApproval = true
      }
      return tool.execute!(args, options)
    },
  }
}
```

---

## Custom connector flow

Matches claude.ai's "Add custom connector" dialog.

1. User clicks "Add custom connector"
2. Modal: Name, Remote MCP server URL, (collapsed) Advanced: OAuth Client ID, Client Secret
3. Submit → backend:
   a. Probe the URL
   b. If probe returns `authType: 'oauth'` and no client_id provided:
      - If DCR supported → register dynamically
      - Else → return error "This server requires OAuth client credentials. Add them under Advanced settings."
   c. If probe returns `authType: 'bearer'` → show bearer token field
   d. Else → continue to OAuth flow / store directly

Store with `connector_id = 'custom:<uuid>'`. Display with a `CUSTOM` badge.

---

## Browse modal

Grid of catalog entries, three tabs (Skills / Connectors / Plugins) — we only have Connectors initially. Sort by popularity, filter by category. "+" on each card kicks off the Connect flow.

Include a server-side catalog fetch endpoint in case we later host a remote catalog (for updates without redeploy):

```ts
GET /api/mcp/catalog
// → merged local catalog + any remote additions
```

---

## Client integration with agent

Refactor `src/server/lib/ai/agent.ts`:

```ts
// Before:
const { tools: mcpTools, cleanup } = await getMCPTools(ctx.env)

// After:
const { tools: mcpTools, cleanup } = await getUserMCPTools(ctx.env, ctx.userId)
```

`getUserMCPTools` loads connections from D1, wraps each tool with the policy check, handles refresh.

Env-var MCPs (current pattern) remain supported — `createUserMCPManager` merges user connections with env-configured ones (for dev / shared / system MCPs). Env-configured tools get a special `system` prefix so they can't be uninstalled through the UI.

---

## Phasing

### Phase 4.1 — OAuth scaffolding + one connector (~3 days)
- Schema + encryption helpers
- Probe + DCR + PKCE flow
- `/api/mcp/oauth/start` + `/api/mcp/oauth/callback`
- `src/server/modules/mcp-connections/routes.ts` — connect, list, uninstall
- Refactor `createMCPManager` to `createUserMCPManager`
- One catalog entry end-to-end: **Google Drive** (your existing `drive.mcpserver.au` MCP)
- Settings → Connectors tab with Connect / Connected states

### Phase 4.2 — Full Google Workspace catalog (~1 day)
- Add Gmail, Calendar, Docs, Sheets, Slides, Tasks, Contacts to the catalog
- Each is a catalog entry pointing at `*.mcpserver.au` — they all speak the same OAuth, so they share the pattern

### Phase 4.3 — Per-tool permissions UI (~2 days)
- Connector detail page
- Tool introspection + auto-classification
- Permission storage + enforcement wrapper
- Approval UI for `ask` tools (reuse `confirm_action` inline UI)

### Phase 4.4 — Bearer token fallback (~1 day)
- Bearer token modal
- Detection + storage
- Keeps support for simple MCPs (pagedrop, australian-business, etc.)

### Phase 4.5 — Browse + custom (~2 days)
- Browse connectors modal (Directory UI)
- Add custom connector dialog
- Catalog popularity/sort
- Custom connector stored with `connector_id = 'custom:<uuid>'`

### Phase 4.6 — RAG integration (~1-2 days on top of Phase 2)
- When a user connects Drive (or similar file-source MCP), offer to ingest their files
- Background job fetches file list via connector, pulls content, embeds to Vectorize
- "Ask Claude about your Drive" works without the agent having to search live on every query

**Total: ~10-12 days of focused work for the whole connector subsystem.** Breaks up cleanly into 1-3 day chunks.

---

## Risks / trade-offs

| Risk | Mitigation |
|------|------------|
| MCP OAuth spec still evolving | Probe and gracefully degrade. Bearer fallback. Document "supported servers" list. |
| Refresh token edge cases (revoked, expired) | Mark connection `status='error'`, surface in UI with "Reconnect" button |
| DCR not supported by all servers | Fall back to pre-configured client (Advanced settings) |
| Scope creep per Google service | Start with `drive.readonly` for Drive; write scopes come later per service |
| Approval fatigue for "ask" policies | Let users set group-level defaults ("always allow read-only"), override per tool |
| Encrypted token storage overhead | AES-GCM at edge is fast (~1ms). Cache decrypted tokens in-memory during a chat request |
| Tool annotations inconsistency | Heuristic classification as fallback. Let users re-categorise manually if needed (Phase 5?) |
| Shared state between env-var MCPs and user-connection MCPs | Prefix system-provided tools, never allow user to remove them |
| Cost of per-user MCP connections across many users | Lazy — only load user's connections when they start a chat. No background pinging. |
| Token refresh race (concurrent chat requests) | Queue per-connection refresh via Durable Object lock OR optimistic refresh with retry-on-conflict |

---

## Follow-ups (not in scope for initial build)

- **Team/org-level connections** — "everyone in this workspace uses the same Notion connection". Requires org model.
- **Connector-specific configuration** — scope picker, custom instructions per connection, repo restrictions (GitHub)
- **MCP server health monitoring** — badge when a connected MCP starts returning 5xx
- **Analytics** — which tools get used, which get rejected
- **Recommended connectors based on chat content** — "You keep asking about spreadsheets. Connect Google Sheets?"
- **Public catalog curation** — host a remote catalog service so we can add connectors without redeploys

---

## Why this matters for the starter

Vite-flare-starter becomes a reference implementation for **"how to build an MCP connector UI like claude.ai on Cloudflare"** — a pattern no open-source starter covers well yet. The scaffolding produced here is:

- Schema for per-user MCP connections
- OAuth 2.1 + PKCE + DCR flow in a Cloudflare Worker
- Edge-encrypted token storage
- Per-tool policy enforcement
- Connector catalog + browse UI
- Custom connector dialog

Fork it, point at your own MCP servers, done.

---

**Prerequisites before starting:**
1. Commit today's uncommitted pile of work (morning audit fixes + places/map feature + save-to-Files)
2. Fix confirmed-open findings from the morning audit (H1/H2/M1)
3. Phase 2 RAG scaffolding (Queues + Vectorize + chunk/embed pipeline) — becomes the ingestion target for Phase 4.6
4. Then this.

**Last updated**: 2026-04-21
