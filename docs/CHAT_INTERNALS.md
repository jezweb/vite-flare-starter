# Chat Module Internals

Implementation details for the chat module — how sources, privileged
tools, NLP translation, observability, and tool rendering hang together.
CLAUDE.md gets the one-line summary; this file has the full picture.

---

## Observability — two D1 tables

| Table | Granularity | Written by | Read by |
|---|---|---|---|
| `ai_usage_logs` | one row per REQUEST | `buildChatAgent` `onFinish` | admin stats, per-user caps |
| `ai_tool_calls` | one row per TOOL CALL (step-level) | chat route `onStepFinish` | admin "Tool errors" tab |

Each `ai_tool_calls` row captures `step_index`, `tool_name`, `tool_error`
(null on success), and per-step `input_tokens`/`output_tokens`. Errors
are also logged as structured JSON to Workers Logs under
`event: "tool_error"`. Enable observability on the Worker
(`observability.enabled: true` in wrangler.jsonc) for 7-day retention.

---

## Sources UX

`src/client/modules/chat/components/SourcesFooter.tsx` renders a chip
strip under each assistant message. It aggregates citations from two
origins:

1. **Native SDK parts** — `source-url` and `source-document` UIMessage
   parts from search-grounded models (e.g. Gemini with googleSearch).
   Requires `sendSources: true` on `createAgentUIStreamResponse` (already
   set in the chat route).
2. **Tool outputs** — walks `tool-*` parts in the message and extracts
   sources from known shapes: `web_search.results[]`,
   `gmail_search.messages[]`, `drive_search.files[]`,
   `places_search.places[]`.

No tool schema changes required — extraction is client-side in
`extractSources()`. Adding sources for a new tool means teaching that
function a new output shape. Falls back to favicon → icon on image load
failure. Collapses to first 8 sources with "+N more" toggle beyond.

---

## Privileged-tool gating

`src/server/lib/ai/prepare-step.ts` exports `computeActiveTools()` which
runs every step in the agent loop and filters out destructive tools
(`gmail_send`, `gmail_delete`, `calendar_create`, `drive_delete`,
`fs_delete`, `fs_write`, `run_shell`) unless:

- The latest user message contains an unlock keyword (case-insensitive
  regex per tool), OR
- The tool was already invoked successfully earlier in the same
  conversation.

Keeps a "what's in my inbox?" chat from accidentally triggering
`gmail_send` just because the model decides to be helpful. Add new
privileged tools to `PRIVILEGED_TOOLS` + `UNLOCK_KEYWORDS` in the same
file.

---

## Natural-language query translation

Both `gmail_search` and `calendar_list_events` accept an optional
`naturalQuery` field alongside their structured inputs. When the model
passes free-form English ("emails from Nick last week with attachments",
"meetings with Sarah this week"), the server translates it to Gmail
operator syntax or structured calendar fields via Nemotron 3
(`@cf/nvidia/nemotron-3-120b-a12b`) on Workers AI.

See `src/server/modules/chat/tools/google-workspace-nlp.ts`.

**Rules:**
- Structured fields (`query`, `range`, `start`, `end`) ALWAYS win over
  `naturalQuery`. If both are passed, naturalQuery is ignored silently.
- Translator output is echoed back as `translatedFrom` on the result so
  the renderer can show both "from: emails from nick last week" AND
  "translated to: from:nick after:2026/04/16".
- 10-second timeout with graceful passthrough. Failures land in Workers
  Logs as `event: "gmail_nlp_fallback"` or `calendar_nlp_fallback`.
- Current date + user timezone are injected into the translator's system
  prompt so "last week" resolves correctly despite the Worker running
  in UTC.
- Not wired on `calendar_create` — its structured fields are required
  and a single natural sentence misses too much.

---

## Document Conversion

`convertToMarkdown()` in `src/server/lib/ai/documents.ts` converts
uploaded files to markdown:

- **PDFs + images**: `env.AI.toMarkdown()` (Cloudflare's built-in
  converter — free, fast, native PDF parsing)
- **Fallback**: Vision model (Kimi K2.6) for formats `toMarkdown()`
  doesn't handle
- **Text files**: Pass-through via `TextDecoder`

---

## Inline UI tools vs MCP-UI

Two patterns coexist:

- **Inline UI** (`_ui` marker) — tools return `{ _ui: 'toolName', ...args }`.
  Rendered in `chat-ui/ChatUiElement.tsx` using shadcn components. No
  iframes. Tighter integration. Use for your own app's UI.
- **MCP-UI** (SEP-1865) — external MCP servers deliver `ui://` resources.
  Rendered in sandboxed iframes via `ToolUIResource.tsx`. Cross-host
  standard. Use for plug-in capabilities.

Both render automatically when detected in tool output. The tool-name
pill is hidden when rich UI displays.

---

## AI SDK v7 migration notes

v7 is in beta. When stable, the migration is ~30 minutes:

1. Rename `stepCountIs` → `isStepCount` (2 files, 4 lines)
2. Remove `experimental_telemetry` block (1 file — we log via D1 already)
3. Add `redirect: 'follow'` to MCP transport config (1 file)
4. Drop `experimental_` prefix on promoted APIs (audio, useObject)

All AI SDK imports are concentrated in `src/server/lib/ai/` (4 files).
No architectural changes needed. `ChatStorage` interface is designed for
future swap to Durable Objects / CF Agents SDK.
