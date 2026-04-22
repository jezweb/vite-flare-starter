# MCP Connectors

The starter ships a **per-user MCP connector system** — users add MCP server URLs from anywhere (public servers, community registries, self-hosted Workers) and the app handles OAuth, bearer tokens, per-tool permissions, and encrypted at-rest storage.

This doc covers:

1. [What ships out of the box](#what-ships-out-of-the-box)
2. [How the connector flow works](#how-the-connector-flow-works)
3. [Public MCP servers worth trying](#public-mcp-servers-worth-trying)
4. [Building your own MCP server](#building-your-own-mcp-server)
5. [Why not native Google Workspace tools instead?](#why-not-native-google-workspace-tools-instead)

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

## Why not native Google Workspace tools instead?

For Google services specifically, the MCP indirection can feel heavy — you're adding an OAuth layer on top of Google's OAuth layer. A direct Google OAuth integration (store Google refresh tokens in D1, call Gmail/Drive/Calendar APIs directly from agent tools) is cleaner when:

- You only need Google Workspace, not a broader connector ecosystem
- You want per-tool scope granularity without running an MCP server
- Forkers expect Workspace integration "just works" with their own Google Cloud OAuth client

This is how Gemini and ChatGPT handle Workspace. **It's planned for a future release** of the starter as a native agent-tools module (no catalogue entry, no MCP server needed).

For now, if you want Google Workspace access in this starter:

- **Option 1** — self-host a Workspace MCP server (Cloudflare Agents SDK has a template) and add its URL via Add connector.
- **Option 2** — write native agent tools in `src/server/modules/chat/tools/` that wrap Google APIs directly, using your own stored refresh tokens. Use the existing `email` or `places` modules as templates.
- **Option 3** — wait for the native module (roadmap).
