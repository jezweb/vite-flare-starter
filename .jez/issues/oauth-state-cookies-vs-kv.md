# MCP OAuth state stored in signed cookies is fragile

**Noticed**: 2026-04-22 UX audit.

Current implementation in `src/server/modules/mcp-connections/routes.ts` stores OAuth PKCE verifier + connection id in short-lived HttpOnly cookies (`mcp_pkce`, `mcp_conn`) set at `/connect` time and read back at `/callback`. `SameSite=Lax` + `Secure` makes it work for the cross-site redirect on Cloudflare Workers.

## Why it's fragile

- Depends on user's browser honouring `SameSite=Lax` redirects-with-cookies semantics (most do, but incognito + strict privacy extensions can block)
- Cookies are per-origin; if the OAuth callback lands on a different edge region, there's no guarantee of cookie read order
- Multi-tab flows can stomp each other's `mcp_conn` cookie
- Testing across dev (localhost:5173) vs prod requires separate cookie secure-flag logic

## Proposed fix (not yet urgent)

Move OAuth handshake state into KV with ~10 minute TTL:

```ts
// At /connect time:
const stateKey = `mcp_oauth:${stateToken}`
await env.KV_OAUTH.put(stateKey, JSON.stringify({ connectionId, verifier }), { expirationTtl: 600 })

// At /callback time:
const stored = await env.KV_OAUTH.get(stateKey, { type: 'json' })
// ... exchange code ...
await env.KV_OAUTH.delete(stateKey)
```

Requires:
- KV namespace binding (`KV_OAUTH`)
- Setup step in wrangler.jsonc documented in FORKING.md
- Key format collision-safe across users

## Why not urgent

Current implementation demonstrably works — Jez's first Google Drive connect got as far as `authType: 'oauth', status: 'pending'` because the server side succeeded. The failure was on the popup side (Cn1, fixed). Cookie handoff survived.

Revisit if a real OAuth test exposes a cookie-dropped scenario.
