# Agent Toolkit

The chat module ships with a modular agent toolkit in
`src/server/modules/chat/tools/`. Tools are auto-included based on which
env bindings are configured and which connectors the user has wired up.

Every tool is a `ToolDefinition<Input, Output>` from
`src/shared/agent/tool.ts` — server execute + I/O Zod schemas + optional
client render metadata in one object. See
`.claude/rules/one-file-tool-definitions.md`.

---

## Tool modules

| Module | Tools | Always present? |
|---|---|---|
| **core** | `get_server_time`, `get_model_info`, `calculate` | Yes |
| **memory** | `remember`, `recall`, `search_memory`, `forget` | Yes (user_meta D1 table) |
| **ui** | `offer_choices`, `show_alert`, `show_contact`, `collect_info`, `ask_questions`, `show_data_table`, `show_metric_cards`, `show_timeline`, `show_progress`, `show_comparison`, `confirm_action`, `show_map` | Yes (inline React components) |
| **skills** | `load_skill` | Yes |
| **code** | `run_python`, `run_shell`, `run_js` | Yes (setup msg if SANDBOX missing) |
| **delegate** | `delegate` | Yes (subagent pattern) |
| **audio** | `transcribe_audio` (Deepgram Nova 3), `speak_text` (Deepgram Aura 2, 12 voices, Aura 1 fallback) | Yes (AI binding, no external keys) |
| **todo** | `todo_add`, `todo_update`, `todo_list`, `todo_clear` | Yes (persisted via user_meta) |
| **config-diff** | `propose_patch` | Yes — stages a change for user approval |
| **browser** | `browser_markdown`, `browser_extract`, `browser_screenshot`, `browser_links`, `browser_content` | If `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` |
| **search** | `web_search` | If a provider key is set |
| **places** | `places_search`, `places_details` | If `GOOGLE_PLACES_API_KEY` |
| **files** | `fs_list`, `fs_read`, `fs_write`, `fs_delete` | If `FILES` R2 bucket bound |
| **google-workspace — Gmail** | `gmail_search`, `gmail_get_message`, `gmail_list_labels`, `gmail_draft`, `gmail_reply`, `gmail_send` | Per-user OAuth |
| **google-workspace — Drive** | `drive_search`, `drive_get_file`, `drive_create_folder` | Same |
| **google-workspace — Tasks** | `tasks_list`, `tasks_create` | Same |
| **google-workspace — Calendar** | `calendar_upcoming`, `calendar_list_events`, `calendar_get_event`, `calendar_find_free_slot`, `calendar_create`, `calendar_update_event`, `calendar_delete_event` | Same |
| **google-workspace — Docs** | `docs_search`, `docs_get`, `docs_create`, `docs_append` | Same |
| **google-workspace — Sheets** | `sheets_list_tabs`, `sheets_read_range`, `sheets_append_row`, `sheets_write_range` | Same |
| **microsoft-workspace — Outlook** | `outlook_search`, `outlook_get_message`, `outlook_send` | Per-user OAuth |
| **microsoft-workspace — OneDrive** | `onedrive_search`, `onedrive_get_file` | Same |
| **microsoft-workspace — Calendar** | `msoffice_calendar_list`, `msoffice_calendar_create` (Teams meeting link via `isOnlineMeeting: true`) | Same |
| **slack / notion / atlassian** | Scaffolded (OAuth + cards + tokens). Implementations in GitHub issues #21, #22, #23. | Connectors page auto-shows cards when `<PROVIDER>_CLIENT_ID` + `_SECRET` set |

---

## Adding a new tool (canonical pattern)

```ts
// src/server/modules/chat/tools/my-domain.ts
import { z } from 'zod'
import { Sparkles } from 'lucide-react'
import type { ToolDefinition } from '@/shared/agent'

const MyInput = z.object({ query: z.string() })
const MyOutput = z.object({ count: z.number(), items: z.array(z.unknown()) })

export const myToolDefinition: ToolDefinition<
  z.infer<typeof MyInput>,
  z.infer<typeof MyOutput>
> = {
  name: 'my_tool',
  description: 'What the model sees when deciding whether to call.',
  inputSchema: MyInput,
  outputSchema: MyOutput,
  isAvailable: (ctx) => !!ctx.env.MY_BINDING,
  needsApproval: false,
  execute: async (input, ctx) => {
    return { count: 0, items: [] }
  },
  render: {
    icon: Sparkles,
    displayName: 'My Tool',
    summary: (output) => `${output.count} results`,
  },
}

export const myDomainDefinitions = [myToolDefinition] as ToolDefinition<unknown, unknown>[]
```

Register in `src/server/modules/chat/tools/index.ts` — add to the
`allDefinitions` array. `collectAvailableTools(allDefinitions, ctx)`
handles Zod validation, telemetry, AI SDK adapter wiring, and `isAvailable`
filtering.

Custom client renderer? Drop a renderer file in
`src/client/modules/chat/components/tool-renderers/`, import the output
type via `import type { MyOutput } from '...'`. Vite tree-shakes
server-only code from client bundles.

---

## Google Workspace — privileged write ops

Every write tool (`gmail_send`, `gmail_reply`, `calendar_create`,
`calendar_update_event`, `calendar_delete_event`, `docs_create`,
`docs_append`, `sheets_append_row`, `sheets_write_range`) has
`needsApproval: true`. The agent stops, shows the user the proposed args,
and only executes after approval.

These ops are also in `PRIVILEGED_TOOLS` — not even offered to the model
unless the latest user message contains an unlock keyword ("reply",
"schedule", "append", "write", etc.). `gmail_draft` is intentionally NOT
privileged — drafts have no external effect.

### Scopes required

Set up at Connectors → Google Workspace:

- `gmail.readonly` — gmail read tools
- `gmail.send` — `gmail_send`, `gmail_reply`
- `gmail.compose` — `gmail_draft`
- `drive.readonly` — `drive_search`, `docs_search`, `docs_get`
- `calendar.events` — all calendar tools
- `documents` (or `documents.readonly`) — `docs_create`, `docs_append`, `docs_get`
- `spreadsheets.readonly` — `sheets_list_tabs`, `sheets_read_range`
- `spreadsheets` — `sheets_append_row`, `sheets_write_range`
- `drive.file` (or `drive`) — `drive_create_folder`
- `tasks.readonly` — `tasks_list`
- `tasks` — `tasks_create`

### Service notes

- **Docs `docs_append`** supports markdown-ish input: `#`/`##`/`###` →
  H1/H2/H3, blank-line-separated paragraphs. Tables/images/inline objects
  not yet supported.
- **Sheets** ranges use A1 notation (`Sheet1!A1:D20`, `Budget!A:A`).
  `valueInputOption: 'USER_ENTERED'` (default) parses formulas + dates
  like the UI does; `RAW` stores the string verbatim.

---

## Connector scaling — registry + per-user filter

Every native OAuth connector (Google, Microsoft, Slack, Notion,
Atlassian, …) is declared once in
`src/shared/config/connector-providers.ts`. Single source of truth —
ConnectorsPage reads it to render cards, the toolkit reads it to filter
tools per user, `.dev.vars.example` docs pull from it.

Per-user settings live in `user_connector_settings` (D1): master switch
+ `enabledToolsJson` array per user per provider.
`src/server/modules/connectors/settings.ts` exposes
`getAllowedConnectorTools(env, userId)` which `buildChatTools` calls to
filter the toolkit. When no settings row exists, the provider's
`defaultEnabledTools` apply (the read-only subset). Master switch off =
entire provider skipped, zero context cost.

### Adding a new connector

1. Add an entry to `CONNECTOR_PROVIDERS` with `id`, `toolNames`,
   `defaultEnabledTools`, `envVars`, `developerPortalUrl`.
2. Create `src/server/modules/<id>/db/schema.ts`, `routes.ts`,
   `tokens.ts`. Typical OAuth providers use `buildStubRoutes` +
   `defineProviderTokenTable` helpers in
   `src/server/modules/connectors/stub-provider.ts` — ships in ~40 LOC of config.
3. Add tool definitions in `src/server/modules/chat/tools/<id>.ts`, one
   `ToolDefinition` per entry in `toolNames`.
4. Register routes in `src/server/index.ts`, tool defs in
   `src/server/modules/chat/tools/index.ts`, schema in
   `src/server/db/schema.ts`.
5. The card renders automatically via `StubConnectorPanel` when mounted
   in `ConnectorsPage.tsx` with `providerId` + logo SVG.

Provider-specific OAuth quirks handled via `StubProviderConfig`:
`includeRedirectUriInTokenExchange: false` for Notion (rejects
`redirect_uri` in token exchange), `extraAuthParams` for Atlassian
(needs `audience=api.atlassian.com` + `prompt=consent`),
`fetchAccountInfo` callback for custom profile endpoints.

---

## Browser Rendering

Use Cloudflare Browser Rendering's REST API directly — no
Puppeteer/Playwright. Token at
https://dash.cloudflare.com/profile/api-tokens with "Browser Rendering -
Edit", set `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`.

`browser_extract` is particularly powerful — uses the `/json` endpoint
which runs Workers AI extraction natively, so you can pass
natural-language prompts like "Extract product name, price, availability".

---

## Places (Google Places API New)

`places_search` + `places_details` use the Places API (New). Set
`GOOGLE_PLACES_API_KEY` (create at https://console.cloud.google.com →
enable "Places API (New)", restrict to your Worker routes in production).

The agent is auto-nudged via the system prompt to pair `places_search`
with `show_map` so local-business queries render as a Leaflet map + card
list rather than a wall of text. Same nudge fires if an MCP server
exposes a tool named `google_local_places`.

---

## Search providers

`SEARCH_PROVIDER` env var (default: `serper`). All normalised to
`{ title, url, snippet, date }`.

| Provider | Free tier | Setup |
|---|---|---|
| **Serper** (default) | 2,500 queries/month | serper.dev → `SERPER_API_KEY` |
| Brave | $5 monthly credits | brave.com/search/api → `BRAVE_API_KEY` |
| Tavily | 1,000 credits/month | tavily.com → `TAVILY_API_KEY` |
| Exa | Paid | exa.ai → `EXA_API_KEY` |

---

## Code execution

`run_python`, `run_shell`, `run_js` use Cloudflare Sandbox — isolated
Linux containers via Firecracker microVMs. Each user gets their own
persistent sandbox (`user-<userId>`). Requires Workers Paid plan and a
SANDBOX Durable Object binding.

When the binding is missing, tools still appear in the toolkit but
return a clear setup message.
