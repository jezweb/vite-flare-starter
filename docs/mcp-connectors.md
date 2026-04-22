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

**One catalogue entry:** Australian Business Register (ABR) — a no-auth public API wrapped as an MCP server. It's a working example that lets you connect something in one click and see tool discovery, policy controls, and agent tool-calling end-to-end.

**Everything else:** "Add connector" — paste any MCP URL.

The philosophy is that the starter's *infrastructure* (OAuth 2.1 + PKCE + DCR, bearer fallback, encrypted tokens, per-tool allow/ask/never) is the value. A curated 20-connector catalogue would tie the starter to specific services and create fork-maintenance pain.

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

### Community MCP registries

- **Smithery.ai** — browse at [smithery.ai/mcp](https://smithery.ai/mcp). Many free, OAuth-enabled servers for GitHub, Notion, Linear, Sentry, etc. Each has its own `/mcp` URL you paste into Add connector.
- **Anthropic reference servers** — [github.com/anthropics/mcp-servers](https://github.com/modelcontextprotocol/servers) has reference implementations for filesystem, GitHub, Slack, Google Drive, Postgres. Most are stdio-based (run locally); a few expose HTTP endpoints.
- **Cloudflare Agents SDK** — [developers.cloudflare.com/agents](https://developers.cloudflare.com/agents/) ships examples that deploy as Workers. Paste the Worker URL + `/mcp` path.

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
