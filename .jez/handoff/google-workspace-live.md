# Google Workspace live on demo (2026-04-22)

Native Google Workspace (v1.8.0) is configured and live on
`https://vite-flare-starter.webfonts.workers.dev`.

## GCP setup

- **Project**: `cloudflare-ai-apps`
- **OAuth client type**: Web application
- **Authorised JS origin**: `https://vite-flare-starter.webfonts.workers.dev`
- **Authorised redirect URI**: `https://vite-flare-starter.webfonts.workers.dev/api/google-workspace/callback`
- **APIs enabled**: Gmail, Drive, Calendar, People

Store the full client_secret JSON in Vault under
`Google Workspace / vite-flare-starter-demo`
when Vault MCP is reachable.

## Worker secrets set

Via `wrangler secret put`:

- `GOOGLE_WORKSPACE_CLIENT_ID`
- `GOOGLE_WORKSPACE_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY` (fresh 32-byte base64, previously unset — used by both
  MCP Connectors and Google Workspace for AES-GCM encryption at rest)

Note: `TOKEN_ENCRYPTION_KEY` was previously unset, which means the MCP
connector token encryption was running on an empty key (throws an error
on first encrypt call). No user had completed an MCP OAuth flow yet, so
no data loss — but this is the first deployment where encryption
actually works.

## Smoke test verified (API level)

- `GET /api/google-workspace/status` → 401 without auth (correct — auth required)
- `POST /api/google-workspace/connect` → 401 without auth (correct)
- `GET /api/google-workspace/callback?error=test` → 200 HTML error page (correct)

All three return the *right* error codes — no 501 "not configured" responses,
meaning the env vars are read correctly.

## What's left

- Click-through smoke test: visit `/dashboard/connectors` signed in, click
  Connect Google Workspace, complete consent, verify token exchange, test one
  agent tool (e.g. `gmail_search`). Chrome MCP had a multi-extension conflict
  at verify time — worth walking through manually.
- Consider: if OAuth consent screen is still in "Testing" mode in GCP, only
  test users and the internal domain can use it. Check
  `https://console.cloud.google.com/auth/audience?project=cloudflare-ai-apps`
  — if it says "Testing", either add test users or publish (for internal
  workspace domain users, publishing to Internal is safe and doesn't require
  Google review).
