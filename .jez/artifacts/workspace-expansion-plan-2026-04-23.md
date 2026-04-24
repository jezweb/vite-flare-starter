# Google Workspace Tool Expansion — Plan

**Status**: ✅ **COMPLETE** — Phases 1, 2, 3 all shipped 2026-04-23.
**Author**: Claude (this session)
**Date**: 2026-04-23
**Lives at**: `src/server/modules/chat/tools/google-workspace.ts`

## Shipped

| Phase | Tools shipped | Commit | Version |
|---|---|---|---|
| **Phase 1** — Gmail depth + Calendar CRUD | `gmail_get_message`, `gmail_list_labels`, `gmail_draft`, `gmail_reply`, `calendar_list_events`, `calendar_get_event`, `calendar_find_free_slot`, `calendar_update_event`, `calendar_delete_event` | `b5c8c00` | `3c9374f9` |
| **Phase 2** — Docs + Sheets | `docs_search`, `docs_get`, `docs_create`, `docs_append`, `sheets_list_tabs`, `sheets_read_range`, `sheets_append_row`, `sheets_write_range` | `48a2ce6` | `532211b0` |
| **Phase 3** — Drive read + Tasks | `drive_get_file`, `drive_create_folder`, `tasks_list`, `tasks_create` | `6ab30fc` | `4659434e` |
| **Bonus** — naturalQuery translator | Nemotron-3-backed NLP on `gmail_search` + `calendar_list_events` | `58bc390` | `08b67bd5` |
| **Review** — 7 bug fixes | MIME separator, docs_append index math, find_free_slot timezone, reply self-exclude, drive streaming cap, scope match, docs_get degraded flag | `17799a6` | `4e4798cb` |

26 total Workspace tools live (up from 5). Deferred: `drive_upload` (needs R2→Drive bridge), Chat integration, Gmail bulk ops, Workers-AI-backed summarise/ask tools.

## Current state (5 tools, ~506 LOC)

| Tool | What it does |
|---|---|
| `gmail_search` | keyword/query search of the authed user's inbox |
| `gmail_send` | send a plain-text email — **privileged** |
| `drive_search` | keyword search across Drive |
| `calendar_upcoming` | list upcoming events |
| `calendar_create` | create a single event — **privileged** |

Auth: per-user OAuth tokens stored in `google_workspace_tokens` D1 table
(see `src/server/modules/google-workspace/`). Requires the standard set of
Workspace scopes from the OAuth consent screen.

## What we're adding — three philosophies to borrow from Jez's MCPs

1. **Gateway-with-action pattern** — one tool per domain (gmail, calendar,
   docs, sheets, drive, tasks) with an `action` enum, instead of one tool
   per operation. Keeps the model's tool count low (~6 instead of ~30),
   fits the `mcp-gateway-pattern.md` rule. BUT we keep existing
   per-operation tools as thin re-exports so the typed renderers keep
   working.
2. **Natural-language parsing helpers** — optional `naturalQuery` fields
   that let the model say "emails from Nick last week" or "lunch with Sam
   next Tuesday 12pm" and let our server translate to API-specific query
   syntax. Borrowed from the Gmail MCP.
3. **Shortcuts for common ranges** — Calendar: `range: 'today'|'tomorrow'|'thisWeek'|'nextWeek'`.
   Gmail: `preset: 'unread'|'starred'|'last24h'`. Saves the model fiddling
   with date math.

## Out of scope (explicitly deferred)

- Workers-AI-backed summarisation / Q&A endpoints (`gmail_ask`,
  `gmail_summarize`). The main chat agent already has vision/reasoning
  models — let the USER-side agent do its own summarisation, don't wrap
  a second model call inside the tool.
- Full markdown → Google Docs conversion (the 500 LOC complexity). Start
  with plain text append; add rich formatting when someone actually needs
  it.
- Google Chat integration. Interesting but narrow — defer until a real
  ask. Jez uses `google-chat-alternate` MCP for automation already.
- Attachment handling beyond "yes, there are attachments" metadata.
  Downloading to R2 + re-attaching adds meaningful complexity for
  minimal user value right now.

## Phase 1 — Gmail + Calendar depth (highest daily utility)

New tools:

| Tool | Action | Privileged? | Notes |
|---|---|---|---|
| `gmail_get_message` | read one | No | Full body (text + html summary), headers, attachment metadata. |
| `gmail_list_labels` | list | No | Cheap, enables downstream label-based filtering. |
| `gmail_draft` | compose draft | **Yes** | Returns `draftId` — doesn't send. User can then confirm or edit. |
| `gmail_reply` | reply to thread | **Yes** | Auto-sets `In-Reply-To` / `References` headers and `Re:` subject. |
| `calendar_list_events` | list in range | No | Replaces `calendar_upcoming` with richer shape; keeps old tool as a thin wrapper. |
| `calendar_get_event` | read one | No | For follow-up questions after list. |
| `calendar_find_free_slot` | availability | No | Takes duration + working-hours window, returns 3–5 candidate slots. |
| `calendar_update_event` | edit | **Yes** | Subject, time, attendees — partial update. |
| `calendar_delete_event` | cancel | **Yes** | Soft-delete via Google (sends cancellations to attendees). |

Approval flow: the three new privileged tools get wired into
`PRIVILEGED_TOOLS` in `prepare-step.ts` with keyword regexes
(`reply|respond|draft|compose` for `gmail_reply`, `cancel|delete|remove`
for `calendar_delete_event`, etc).

UI: extend `tool-renderers/google-workspace.tsx` with:
- Gmail message card (from + subject + snippet + time + attachment icon)
- Calendar event row (time range + title + location + attendees)
- Free-slot candidates as a compact list

## Phase 2 — Docs + Sheets (high-value output destinations)

New tools:

| Tool | Privileged? | Notes |
|---|---|---|
| `docs_search` | No | keyword search across Docs via Drive API filter |
| `docs_get` | No | fetch full doc content as markdown (server-side conversion, kept simple) |
| `docs_create` | **Yes** | new doc with optional starter content. Returns `docId` + URL. |
| `docs_append` | **Yes** | append paragraphs/headings to an existing doc. Plain text + basic markdown (headings, bold, lists — not tables, not images yet) |
| `sheets_read_range` | No | read a named range or A1 notation |
| `sheets_list_tabs` | No | list tabs in a spreadsheet |
| `sheets_append_row` | **Yes** | append one or more rows to a tab |
| `sheets_write_range` | **Yes** | overwrite a range (for edits) |

Auth scopes needed:
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/spreadsheets`

(Drive scope already in place covers the rest.)

UI renderers:
- Docs: title + last-modified + view link + small preview of first 200 chars
- Sheets: tab name + range + preview of cells as a 5-row table

## Phase 3 — Drive write + Tasks (nice-to-have)

| Tool | Privileged? | Notes |
|---|---|---|
| `drive_get_file` | No | fetch file content for supported formats (text, markdown, CSV) |
| `drive_create_folder` | **Yes** | simple folder creation, returns `folderId` |
| `drive_upload` | **Yes** | upload a file from chat attachments (paired with existing R2 → Drive bridge) |
| `tasks_list` | No | list task lists + tasks |
| `tasks_create` | **Yes** | add a task to a list |

Deferred hard: `drive_delete`, `drive_share`, Gmail bulk operations,
Chat integration. These are narrow-use and each has its own sharp edges
(the `drive_share` one is actually prohibited for the AI anyway per the
user-privacy rules).

## Design decisions

### Gateway vs individual tools

Gateway wins on token cost for the model. But individual tools win on:
- Cleaner per-tool outputSchema (strict Zod types)
- Easier typed renderers (one tool name → one renderer file)
- Simpler approval gating (the `PRIVILEGED_TOOLS` array is literal)

**Compromise**: individual `ToolDefinition` exports keep the type story
clean, but the new tools get grouped into domain subsections in
`google-workspace.ts` (which is already ~500 LOC and will be ~1500 LOC).
If the file gets unwieldy, split into `google-gmail.ts`,
`google-calendar.ts`, etc, registered from the same index.

Do NOT collapse into a single `google_workspace(action)` tool. We've
profited from typed `ToolDefinition` — keep it.

### Natural-language helpers

For Gmail search and Calendar create, accept an optional `naturalQuery`
field alongside the structured params:

```ts
gmail_search({ query: 'from:nick', ... })               // structured
gmail_search({ naturalQuery: 'emails from nick this week' })  // natural
```

Server-side converter uses a small model (Kimi K2.5) via `generateText`
with a narrow system prompt: "Convert user request to Gmail query
syntax. Return ONLY the query string." Budget: 200 output tokens,
fallback to passthrough if it errors.

Risk: this adds an LLM round-trip inside a tool call. Only do it when
`naturalQuery` is set AND `query` is NOT. Document cost in the tool
description so the model only uses natural parse when the structured
option is unclear.

### Token refresh

Today: `google-workspace/service.ts` refreshes tokens when the access
token is expired. New tools must use the same `withGoogleAuth(userId,
scopes, async (token) => ...)` wrapper — no direct `fetch` calls with
manual token handling. Keeps refresh logic in one place.

### Approval strategy

Every write operation is privileged and funnels through the
`sendAutomaticallyWhen` + `computeActiveTools` path that we just
un-broke today. Specifically:

- Add new privileged tool names to `PRIVILEGED_TOOLS` in
  `src/server/lib/ai/prepare-step.ts`.
- Add keyword regexes to `UNLOCK_KEYWORDS`.
- The tool definitions set `needsApproval: true` (or a predicate that
  skips approval when the input is clearly safe — e.g. `gmail_draft`
  could skip approval since it doesn't actually send).

### Error shape

Consistent with existing tools: `z.union([success, z.object({ error: z.string() })])`.
Error messages must be user-safe — strip Google API internals, log
the raw response server-side only.

### Bundle impact

Client-side renderers add maybe 2-4 KB per new renderer (gzipped).
~30 renderers worst case ≈ +60 KB. ChatPage is already a 900 KB chunk;
this is acceptable. No lazy loading needed.

## Implementation order (suggested)

Phase 1 first (Gmail depth + Calendar CRUD) — unlocks the approval
flow dogfood and directly solves today's bug scenario. Then Phase 2
(Docs/Sheets) once Phase 1 is battle-tested. Phase 3 last, only if
there's a concrete use case asking for it.

Each phase should ship with:
- New tool files + `ToolDefinition` exports
- `PRIVILEGED_TOOLS` + `UNLOCK_KEYWORDS` updates
- Typed renderers in `tool-renderers/google-workspace.tsx`
- CLAUDE.md tool-module table update
- A short dogfood checklist: "for each write tool, trigger it via the
  agent, click Approve, confirm the operation happened on Google's
  side"

## Risks & open questions

1. **Scope creep**: 13 new tools is a lot. I'd ship Phase 1 first and
   pause before Phase 2 to verify the approval UX holds up.
2. **Rate limits**: Google APIs have per-minute caps. No issue for
   normal chat usage; could bite if we do bulk operations.
3. **Multiple Google accounts**: Current model assumes one Workspace
   connection per user. If someone connects multiple, we'd need a
   `calendarId` / `accountId` selector on every tool. Defer until
   someone asks for it.
4. **The "draft then approve then send" pattern**: should
   `gmail_draft` auto-offer approval to send? Or always return a draft
   ID that the model has to explicitly invoke `gmail_send_draft` on?
   Recommendation: latter — clearer separation, less surprise.

## Acceptance checks

- Phase 1 complete when: model can read an email, find a slot, create
  a calendar event after approval, and reply to an email after approval.
- All approvals visibly round-trip (today's bug stays fixed).
- Tool errors surface in the admin Tool Errors tab if Google API
  returns non-200.
- SourcesFooter lights up with matched Gmail/Calendar/Docs citations
  where appropriate.
- Each write tool has a typed renderer showing the operation result.

---

**Total scope estimate** — Phase 1: 6-8 hours; Phase 2: 4-6 hours;
Phase 3: 2-3 hours. Phases are independent.

**Ready to execute Phase 1?** If yes, I'll start with `gmail_get_message`
and work through the list above, committing after each tool + renderer pair.
