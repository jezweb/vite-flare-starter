# AI SDK Standards Adoption Plan

**Date**: 2026-04-22
**Owner**: Jez + Claude
**Target**: `vite-flare-starter` v1.9.0 → v2.0.0
**Status**: ✅ **COMPLETE** — Phases 0, A, B, C, D, E all shipped 2026-04-22 to 2026-04-23.
See commits `13eb176` (Phase 0), `7132247` (Phase A bulk), `6fe6e20` (Phase B),
`a0ebfd4` (Phases C/D/E), `708b3af` (audit-round-4 polish), `17799a6` (code review fixes).

## Why

We're leveraging AI SDK v6 for streaming and tool calling but missing several
standards that would:

- **Harden the tool renderer system** (Phase A) — typed end-to-end instead of
  `as SomeType` casts in each renderer
- **Make tool behaviour observable** (Phase B) — know which tool calls are
  slow, which errors surface, how often reasoning loops get stuck
- **Polish the UX to claude.ai parity** (Phase C) — native source citations
  on search tools, progress bars mid-tool for long-running work
- **Reduce cost + improve reliability** (Phase D) — fewer tokens on long
  conversations, automatic repair of malformed tool calls from smaller models
- **Give agents proper runtime control** (Phase E) — per-step tool filtering,
  structured-output renderers for summaries

Each phase is independently shippable. Drop-in order:

## Phase A — Foundation + typed renderers (30–45 min)

**Adopt**: `outputSchema` (Zod) on every `tool()` definition

**Why first**: downstream work (typed renderers, structured summaries,
validation, source emission) all benefit from knowing what each tool returns.

**Work**:
1. Add `outputSchema: z.object({...})` to every tool in:
   - `src/server/modules/chat/tools/core.ts`
   - `.../memory.ts`, `.../ui.ts`, `.../skills.ts`
   - `.../code.ts`, `.../delegate.ts`, `.../audio.ts`, `.../todo.ts`
   - `.../browser.ts`, `.../search.ts`, `.../places.ts`, `.../files.ts`
   - `.../google-workspace.ts`
2. Export inferred types: `export type GmailSearchOutput = z.infer<...>`
3. Refactor `tool-renderers/*.tsx` to import and use the inferred types
   (replaces local duplicate interfaces + `as X` casts)

**Acceptance**:
- `pnpm type-check` still clean
- Renderer files drop ~15-20% in size (no duplicate type definitions)
- Invalid tool outputs are caught with Zod validation errors surfaced to
  the user instead of silent renderer breakage

## Phase B — Observability (30 min)

**Adopt**: `onStepFinish`, `onError`, `experimental_telemetry`

**Why**: we already log per-request usage in D1 but have no visibility into
multi-step agent loops, tool latency, or error patterns. This is cheap
groundwork for the agent-control phase.

**Work**:
1. Add `onStepFinish({stepType, toolCalls, toolResults, usage})` to the
   `streamText` config in `src/server/lib/ai/agent.ts`
2. Extend the `ai_usage` D1 table with `step_index`, `tool_name`,
   `tool_duration_ms`, `tool_error` columns
3. Add `onError` handler that structures errors via `JSON.stringify({event,
   error, toolCall})` to Workers Logs
4. Admin panel strip: "Recent tool errors (24h)" reading from
   `ai_usage WHERE tool_error IS NOT NULL`

**Acceptance**:
- Workers Logs dashboard filter `event:tool_error` returns structured
  entries with tool name + args + error
- Admin panel shows a live list of tool failures

## Phase C — Sources UX (45–60 min)

**Adopt**: `sendSources` config + AI Elements `<Source/>` component +
`source-*` parts

**Why**: claude.ai-style inline citations. Makes web/mail/drive search
results feel native instead of "here's a tool dump, the model's prose
summary follows below."

**Work**:
1. In `src/server/lib/ai/agent.ts` stream config, add `sendSources: true`
2. Teach `web_search`, `gmail_search`, `drive_search` tool executors to
   emit `sources` via `stream.push({type: 'source', ...})` per result.
   (Requires AI SDK 6.x `writeMessageData` or `writer` pattern — need to
   check current SDK API at implementation time)
3. Create `src/client/modules/chat/components/SourceList.tsx` wrapping
   AI Elements `<Source/>` for our styling
4. In `MessageRenderer.tsx`, render `source-*` parts as inline citations
   (footnote style: `[1]`, `[2]` in the assistant text with a sources
   section at the bottom)

**Acceptance**:
- After a `gmail_search`, user sees the assistant text with superscript
  `[1]`, `[2]` citations linking to the matched messages
- Sources section at the bottom of the assistant message with a compact
  list (favicon/icon + title + domain/date)
- Can click a citation to scroll to its source card

## Phase D — Reliability + cost (30 min)

**Adopt**: `experimental_repairToolCall`, `toModelMessages`, `activeTools`

**Why**:
- Smaller models (Gemma 4, Qwen 3.6) occasionally emit malformed JSON tool
  args. Currently this is a hard failure; `repairToolCall` gives us one
  retry with a targeted prompt.
- Long conversations waste tokens on stale tool results the model no longer
  needs. `toModelMessages` pruner drops tool outputs older than N steps.
- `activeTools` lets the agent start with a safe subset and unlock more
  (e.g. `gmail_send`) only after user consent.

**Work**:
1. In `agent.ts`, add `experimental_repairToolCall: async ({toolCall,
   error}) => retryOnce(toolCall, error)` — one repair attempt per call
2. Add `toModelMessages` transform that drops tool outputs > 6 steps ago,
   keeping just `[tool X ran successfully]` stubs
3. Add `activeTools: resolveActiveTools(userContext, messages)` — start
   with `gmail_send`, `calendar_create` excluded until the user's last
   message explicitly references email-sending / calendar-creation (or
   until a previous assistant tool call already succeeded and we're in a
   continuation)

**Acceptance**:
- A deliberately malformed tool call (inject via test) gets automatically
  repaired and succeeds on retry
- A 50-turn conversation uses ~30% fewer tokens on the next request
  compared to full-history baseline
- `gmail_send` doesn't appear in the tool list on a fresh chat asking
  "what's in my inbox?"

## Phase E — Agent control + streaming data (45–60 min)

**Adopt**: `prepareStep`, `data-*` UI message parts, `experimental_output:
Output.object`, `file` parts from tools

**Why**: polish layer — makes the agent feel smart rather than just
functional.

**Work**:
1. `prepareStep({stepNumber, messages, model})`:
   - At step 2+, inject a system note summarising the previous step's tool
     results ("you just ran gmail_search and got 16 results; use this to
     answer the user's question, don't search again unless needed")
2. `data-*` streaming: emit progress parts from long-running tools
   - `gmail_search`: stream `data-search-progress: {current, total}` as each
     message is fetched in parallel
   - `drive_search`: same pattern
   - Render as a subtle progress bar inside the ToolCard pill during stream
3. Gmail inbox summary: a new tool `gmail_summarise_inbox` using
   `Output.object({schema: z.object({categories, urgent, from_top_senders})})`
   that renders as a structured card (use existing `show_metric_cards` or
   a new `InboxSummary` renderer)
4. `generate_image` returns `FileUIPart` via the SDK's file part standard
   instead of our custom `{url, key, prompt}` — simplifies rendering

**Acceptance**:
- Mid-tool progress bar visible during gmail_search ("Fetching 5 of 16…")
- `/summarise my inbox` produces a structured card, not a prose wall
- Generated images render via the same path as user-uploaded images

## Execution order recommendation

| Phase | When | Why that order |
|-------|------|----------------|
| A | Next session, first thing | Foundation for everything else — typed renderers eliminate a whole class of future bugs |
| B | Same session as A | Complements typed renderers with observability. Together they form the v1.9.0 release |
| C | Following session | Biggest visible UX improvement — merits its own release (v1.10.0 or similar) |
| D | Same session as C | Quality upgrades — repairToolCall + activeTools aren't flashy but reduce support friction |
| E | Final push to v2.0.0 | Polish layer — cumulative UX improvements that collectively feel like a major-version bump |

## Non-goals

- No architectural rewrite. Every phase slots into existing structure.
- No cross-fork breakage. Phases are additive — omitting `outputSchema`
  from a tool still works, but typed renderers for that tool need manual
  types until adoption.
- No server-state DB migrations beyond the `ai_usage` extension in Phase B.

## Risks

- **SDK API drift**: v6 is current but each phase should re-verify the
  exact API surface (e.g. `sendSources`, `writeMessageData`) at the top of
  the implementation session — docs live at
  https://ai-sdk.dev/docs/ai-sdk-core
- **`data-*` parts are beta in v6**: Phase E data-parts work might need
  minor adjustments once promoted to stable (v7)
- **`onStepFinish` doesn't fire on tool-only steps in some provider
  adapters**: verify with workers-ai-provider before depending on it for
  telemetry

## Rollback

Each phase is independent — can be reverted by removing the corresponding
server config changes. Renderer type imports in Phase A have a simple
fallback (revert to `as X` casts).
