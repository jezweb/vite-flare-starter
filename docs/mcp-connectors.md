# MCP Connectors

The starter ships a **per-user MCP connector system** — users add MCP server URLs from anywhere (public servers, community registries, self-hosted Workers) and the app handles OAuth, bearer tokens, per-tool permissions, and encrypted at-rest storage.

This doc covers:

1. [What ships out of the box](#what-ships-out-of-the-box)
2. [How the connector flow works](#how-the-connector-flow-works)
3. [Public MCP servers worth trying](#public-mcp-servers-worth-trying)
4. [Building your own MCP server](#building-your-own-mcp-server)
5. [Native Google Workspace integration (v1.8+)](#native-google-workspace-integration-v18)

---

## What ships out of the box

**Curated catalogue (~7 entries)** in `src/shared/config/connector-catalog.ts` — Slack, Notion, GitHub, Linear, Stripe, Airtable (community-maintained via Smithery) plus the no-auth Australian Business Register example. Each entry has a `capabilities: string[]` for the "what your AI can do" bullets and a `source` attribution.

**Everything else:** **Add an integration → Connect by URL** — paste any MCP server URL. Probe handles OAuth, bearer, or no-auth automatically.

The philosophy is that the starter's *infrastructure* (OAuth 2.1 + PKCE + DCR, bearer fallback, encrypted tokens, per-tool allow/ask/never) is the value. The catalog is intentionally curated rather than exhaustive — we'd rather list 7 entries we trust than auto-fetch 7,000 from a community registry where 22% of the top 100 have known security findings. See [the 2026-05-07 brains-trust audit](../.jez/audits/2026-05-07-tool-ui-and-connectors-brains-trust.md) for the full reasoning.

> ⚠️ **Fork-owners**: Smithery URLs in the catalog can rot. Verify each URL against [smithery.ai](https://smithery.ai) before relying on the entry. The connector probe surfaces dead URLs as clear errors rather than silent failures, so users see "this connector is unavailable" instead of a black hole.

---

## How the connector flow works

1. User clicks **Add connector** → pastes a URL
2. Server probes the URL for `/.well-known/oauth-authorization-server`
3. **If OAuth advertised**: we DCR to get a `client_id`, build an auth URL with PKCE + state, user clicks through → returns to `/api/mcp-connections/callback` → token exchange → status `active`.
4. **If 401 with no OAuth metadata**: treat as bearer — user pastes an API token in the Configure panel.
5. **If no auth required**: mark active immediately.

After connecting, we hit the server's `tools/list` endpoint to discover tools, which the user then allows/denies per-tool in the Configure sheet.

Tokens are AES-GCM encrypted at rest using `TOKEN_ENCRYPTION_KEY`. Set it:

```bash
printf "$(openssl rand -base64 32)" | npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

---

## Public MCP servers worth trying

### No auth — good for first-connect testing

| Server | URL | What it does |
|--------|-----|-------------|
| Australian Business Register | `https://australian-business.mcpserver.au/mcp` | ABN/ACN lookups (ships in the catalogue) |

### Community MCP registries (mid-2026 inventory)

| Registry | Inventory | Best for | Caveat |
|---|---|---|---|
| **[Smithery.ai](https://smithery.ai)** | 7,000+ servers | Largest catalog · both local + remote-hosted | 22% of top-100 had security findings ([scan](https://dev.to/saray_chak_/we-scanned-100-smithery-mcp-servers-and-22-came-back-with-security-findings-2lj8)) — verify before connecting |
| **[Official MCP Registry](https://registry.modelcontextprotocol.io/)** | Canonical metadata feed (Linux Foundation) | Programmatic discovery via API | Intentionally minimal — no curated UX |
| **[FastMCP](https://fastmcp.me/)** | 1,891+ servers | Discovery surface for "what's hot" | Mostly stdio NPM packages — less useful for our HTTP-only flow |
| **[Awesome MCP Servers](https://github.com/modelcontextprotocol/servers)** | Anthropic reference set | Reference implementations for filesystem, GitHub, Slack, Drive, Postgres | Most are stdio (run locally); a few expose HTTP |

### Cloudflare's first-party MCP servers (for fork developers)

Cloudflare runs 16 hosted MCP servers at `*.mcp.cloudflare.com/mcp`. These are **dev-shaped** (Workers logs, DNS analytics, AI Gateway debug) — useful while *you* build a fork, but not what you'd ship in your end-user-facing catalog. Connect them yourself via **Connect by URL**:

| URL | Auth | What it gives you |
|---|---|---|
| `https://mcp.cloudflare.com/mcp` | OAuth | Codemode access to 2,500+ Cloudflare API endpoints (DNS, Workers, R2, Zero Trust) |
| `https://docs.mcp.cloudflare.com/mcp` | **none** | Search Cloudflare docs from chat — handy while building |
| `https://agents.cloudflare.com/mcp` | **none** | Search the Agents SDK docs |
| `https://bindings.mcp.cloudflare.com/mcp` | OAuth | Manage Workers bindings (KV, R2, AI, etc.) |
| `https://observability.mcp.cloudflare.com/mcp` | OAuth | Workers logs + analytics |
| `https://browser.mcp.cloudflare.com/mcp` | OAuth | Fetch pages, convert to markdown, screenshot |
| `https://containers.mcp.cloudflare.com/mcp` | OAuth | Spin up sandbox dev environments |
| `https://radar.mcp.cloudflare.com/mcp` | OAuth | Internet traffic insights, URL scanning |
| `https://ai-gateway.mcp.cloudflare.com/mcp` | OAuth | Search AI Gateway logs |

Plus 7 more (Builds, Logpush, AutoRAG, Audit Logs, DNS Analytics, DEX, CASB, GraphQL) — see [Cloudflare's MCP servers reference](https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/).

These aren't in the curated catalog because the *audience* of the catalog is end-users of forks (small businesses using Slack/Notion/Stripe), not developers managing CF accounts. If your fork is itself developer-facing (e.g., an internal devops tool), consider seeding these into your fork's `connector-catalog.ts`.

### Self-hosting your own

See the next section — it's a small amount of code on Cloudflare Workers.

---

## Building your own MCP server

### Cloudflare Workers (recommended for Jezweb forks)

Cloudflare's Workers OAuth Provider + MCP Agent pattern is the shortest path. Template repos:

- [cloudflare/agents-starter](https://github.com/cloudflare/agents-starter) — TypeScript, OAuth-ready, deploy in ~5 min.
- Any Hono Worker can expose an MCP endpoint by returning JSON-RPC responses on a `/mcp` path. Add `@cloudflare/workers-oauth-provider` for the OAuth 2.1 server.

### FastMCP (Python)

- [jlowin/fastmcp](https://github.com/jlowin/fastmcp) — fast way to spin up an MCP server with decorators. Great for prototyping.

### Minimum MCP endpoint contract

Your server needs to handle three JSON-RPC methods on `POST <url>/mcp`:

- `initialize` — protocol handshake
- `tools/list` — return `{ tools: [{ name, description, inputSchema }] }`
- `tools/call` — execute a tool with input args, return output

Optionally: `prompts/list`, `resources/list`, `resources/read` for richer integrations.

And for OAuth support: advertise `/.well-known/oauth-authorization-server` (RFC 8414) with `authorization_endpoint`, `token_endpoint`, and optionally `registration_endpoint` (RFC 7591 DCR). Cloudflare's `workers-oauth-provider` handles all of this.

---

## Native Google Workspace integration (v1.8+)

For Google services specifically, the MCP indirection is heavy — you'd be adding an OAuth layer on top of Google's OAuth layer. The starter ships a **native Google Workspace module** under `src/server/modules/google-workspace/` instead: direct OAuth 2.0, refresh tokens encrypted in D1, agent tools that hit Google APIs directly.

When configured, a "Google Workspace" card appears at the top of the Connectors page (self-hides when env vars are absent).

**Agent tools shipped:**

- `gmail_search(query, limit)` — Gmail search syntax
- `gmail_send(to, subject, body, cc?)` — sends with `needsApproval: true`
- `drive_search(query, limit)` — Drive fullText + field queries
- `calendar_upcoming(days?, limit?)` — next N events on primary calendar
- `calendar_create(summary, start, end, attendees?)` — creates with `needsApproval: true`

**Setup:**

1. Create a Google Cloud project and OAuth client (Web application type)
2. Add redirect URI: `https://your-app.workers.dev/api/google-workspace/callback`
3. Enable these APIs on the project: Gmail, Drive, Calendar, People (for userinfo)
4. Set secrets:

```bash
printf "<client-id>" | npx wrangler secret put GOOGLE_WORKSPACE_CLIENT_ID
printf "<client-secret>" | npx wrangler secret put GOOGLE_WORKSPACE_CLIENT_SECRET
```

These are separate from `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (used by better-auth for sign-in). Keeping them separate means sign-in stays minimal-scope while Workspace gets the broader Gmail/Drive/Calendar grants.

Tokens are AES-GCM encrypted via `TOKEN_ENCRYPTION_KEY` (same secret used by MCP connectors). Set that too if you haven't already:

```bash
printf "$(openssl rand -base64 32)" | npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

**Scopes requested on consent:**

- `gmail.readonly`, `gmail.send`
- `drive.readonly`, `drive.file`
- `calendar.events`
- `openid email profile` (for the connected-as display email)

**Access token refresh** happens lazily — every agent tool call checks expiry and refreshes if within 5 min. On refresh failure the status goes `error` and the UI prompts the user to reconnect.

**Extending with more tools:** duplicate one of the existing tool blocks in `src/server/modules/chat/tools/google-workspace.ts` and call the relevant Google API. `requireActiveToken(ctx, 'scope.name')` guards scope availability automatically — just declare the scope in `GOOGLE_WORKSPACE_SCOPES` in `tokens.ts` and users will be prompted for it on next connect.

**Adding services** (Docs, Sheets, Slides, Tasks, Contacts): same pattern. Add scopes to `GOOGLE_WORKSPACE_SCOPES`, add tools to `buildGoogleWorkspaceTools`, surface them in `SCOPE_LABELS` in `GoogleWorkspacePanel.tsx`.
