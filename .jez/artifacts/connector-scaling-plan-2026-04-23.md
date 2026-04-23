# Connector scaling plan — 2026-04-23

**Problem:** 2 connectors today (Google Workspace, Microsoft 365) = 21 + 7 agent tools. Adding Slack, Notion, Atlassian, Linear, Salesforce, HubSpot, Stripe, etc. scales linearly into 100+ tools flooding the model context.

**Goal:** Add many connectors without flooding the context. Per-provider + per-tool enable/disable. Good defaults so most users never touch a toggle.

---

## Architecture

### Three layers of tool availability

Each layer is a filter applied in order:

```
Registered tools in codebase  →  Provider enabled?  →  User's per-tool toggles  →  Agent sees tool
  (static list)                  (1 row per user)      (json array per user)
```

**Layer 1 — Registration (compile-time):** A provider declares its tools via a `ConnectorProvider` descriptor. All declared tools exist in the codebase.

**Layer 2 — Per-provider enable (runtime per-user):** A new `user_connector_settings` row per user + provider. Columns:
- `userId`, `connectorId` (e.g. `slack`)
- `enabled: boolean` (is this connector active for this user?)
- `enabledTools: string[]` (which of the provider's tools are on)
- `updatedAt`

If `enabled === false`, ALL tools from that provider are skipped — zero context cost.

**Layer 3 — Per-tool enable (runtime per-user):** Within an enabled provider, only tools in `enabledTools` are included. Default `enabledTools` is populated from `provider.defaultEnabledTools` on first connect.

### The `ConnectorProvider` descriptor

```ts
// src/shared/config/connector-providers.ts
export interface ConnectorProvider {
  /** Stable machine id, used in URLs + DB rows. */
  id: string                          // 'google-workspace' | 'slack' | 'notion' | ...
  label: string                       // 'Google Workspace' — user-facing
  description: string                 // Card description
  category: 'productivity' | 'communication' | 'dev-tools' | 'crm' | 'finance'
  /** Lucide icon or inline-SVG component. */
  icon: LucideIcon | ComponentType

  /** API paths. Convention: /api/<id>/(status|connect|callback|disconnect). */
  statusEndpoint: string

  /** Scopes this provider requests, for the card's chip display. */
  displayScopes: Array<{ key: string; label: string; icon: LucideIcon }>

  /** Which tool NAMES does this provider contribute to the agent toolkit? */
  toolNames: string[]                 // e.g. ['outlook_search', 'outlook_send', ...]

  /** Which tools are enabled by default on first connect? */
  defaultEnabledTools: string[]       // typically the "safe" subset — read-only
}
```

### Registry

Single source of truth: `src/shared/config/connector-providers.ts` exports a `CONNECTOR_PROVIDERS` array. Everything else reads from this:
- ConnectorsPage renders one card per provider (where `status.enabled === true` on server).
- Chat toolkit builder filters the tool list using the user's settings.
- UI for per-tool toggles is rendered from the provider's `toolNames`.

### Server-side tool filtering

```ts
// In buildChatTools(ctx):
const userSettings = await db.select().from(user_connector_settings).where(...)

const enabledProviderIds = new Set(userSettings.filter(s => s.enabled).map(s => s.connectorId))
const perToolAllowed = new Map<string, Set<string>>(...) // providerId -> Set<toolName>

const filtered = allToolDefinitions.filter((def) => {
  const providerId = getProviderForTool(def.name)  // lookup
  if (!providerId) return true                       // non-connector tools (core, memory, etc.) always pass
  if (!enabledProviderIds.has(providerId)) return false
  const allowed = perToolAllowed.get(providerId)
  return !allowed || allowed.has(def.name)
})
```

### Good defaults (no user config required)

- **First OAuth connect → provider is enabled + `defaultEnabledTools` populated.** Happy-path user never sees a toggle.
- **`defaultEnabledTools`** is the non-destructive subset: reads + list. Excludes sends/creates unless the provider's core offering IS sending (e.g. for Slack, `slack_post_message` would be a default).
- **User can disable a whole provider** without disconnecting OAuth (keeps the tokens, just hides the tools). Useful for "I'm context-switching, hide noise".

### UI shape

ConnectorsPage card (when connected):
```
[icon] Provider Name           [Connected pill]           [⋯ Manage]
        Connected as user@domain.com                      [🗑 Disconnect]

        [✓ Tool 1] [✓ Tool 2] [☐ Tool 3] [✓ Tool 4]       (toggles — click to flip)
```

Or collapsed (default view):
```
[icon] Provider Name           [Connected pill]           [✏️ Manage tools]
        Connected as user@domain.com                      [🗑 Disconnect]
        4 of 7 tools enabled
```

---

## Implementation plan

### Phase 1 — Scaffold the registry (this session)

- `src/shared/config/connector-providers.ts` — the `ConnectorProvider` type + `CONNECTOR_PROVIDERS` constant seeded with google-workspace + microsoft-workspace.
- `src/server/modules/connectors/settings.ts` — `user_connector_settings` table, helpers to fetch per-user settings.
- Migration: `0020_user_connector_settings.sql`.
- Refactor `buildChatTools` to apply the filter.
- Default behaviour preserved: if no settings row exists → all tools from that provider are enabled (matches current behaviour).

### Phase 2 — Add Slack, Notion, Atlassian (this session)

For each:
- `src/server/modules/<connector>/db/schema.ts` — per-user tokens table, same pattern as Google/Microsoft
- `src/server/modules/<connector>/tokens.ts` — OAuth + refresh (stubbed tool implementations if API surfaces are large)
- `src/server/modules/<connector>/routes.ts` — status/connect/callback/disconnect routes
- `src/server/modules/chat/tools/<connector>.ts` — 3-5 core tools (search/read/post)
- `src/client/modules/connectors/components/<Connector>Panel.tsx` — card component, same template

Entries for each in `CONNECTOR_PROVIDERS`.

Default enabledTools per provider:
- **Slack**: `slack_search_messages`, `slack_list_channels`, `slack_get_user` (reads only — posts require explicit enable)
- **Notion**: `notion_search`, `notion_get_page` (reads only — writes need enable)
- **Atlassian**: `jira_search_issues`, `jira_get_issue`, `confluence_search` (reads only)

### Phase 3 — Per-tool toggle UI (next session)

- Manage dialog (Radix Dialog) in the connector card
- Checkbox per tool with friendly labels (pulled from the tool's `render.displayName`)
- Save on toggle → optimistic update + invalidate the `tools` query

---

## Auto-discovery of providers by env config

To avoid forks touching the source, providers are auto-hidden when their env is not configured (already implemented for Google + Microsoft):

- `isProviderConfigured(env, providerId)` — reads env vars for the provider's client id + secret
- ConnectorsPage only renders cards where `configured === true`
- Agent toolkit silently skips tools for unconfigured providers

This means: a fork that never sets `SLACK_CLIENT_ID` will never show a Slack card and never send Slack tools to the model. Zero config overhead.

---

## Risks + mitigations

- **Risk:** Users forget to enable a provider they connected.
  **Mitigation:** `defaultEnabled: true` on first connect.

- **Risk:** Per-tool toggles produce too much UI clutter.
  **Mitigation:** Collapsed "X of Y tools enabled" is the default view; expand to toggle. Good summary + rare full edit.

- **Risk:** Token DB rows orphan when a user removes a connector entirely.
  **Mitigation:** `disconnect` deletes the token row AND the settings row. If they reconnect, fresh settings row with defaults.

- **Risk:** Tool-filter logic silently breaks if a tool name is renamed.
  **Mitigation:** Schema changes should trigger a migration that clears stale names from `enabledTools`. Otherwise the filter correctly skips a non-existent name — no crash.

---

## Target state after session

- Registry-driven architecture: all connectors (existing + new) flow through `ConnectorProvider` descriptors.
- **6 connectors scaffolded**: Google Workspace, Microsoft 365, Slack, Notion, Atlassian, + leaves room for #7 (Linear / Stripe / Salesforce)
- Per-provider enable/disable working end-to-end.
- Per-tool enablement infrastructure in place (schema + server filter); UI shipped in a follow-up session.
- **Tool-count estimate at 6 connectors**: ~40 provider tools + ~40 starter tools = 80 total. With per-tool defaults (reads only) + per-provider enable, average user sees 15-25 tools — healthy for Kimi K2.6's 256k context.
