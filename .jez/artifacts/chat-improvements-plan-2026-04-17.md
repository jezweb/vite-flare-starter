# Chat Improvements Plan — 2026-04-17

Sequenced plan for the chat module, derived from the Sonnet agent's 42-finding audit (`.jez/artifacts/chat-ergonomics-audit-2026-04-17.md`) combined with live Chrome dogfooding.

**Status when plan written:** v2.0 of the chat UI is shipping — claude.ai-style single-scroll container, sticky input, drag-drop attachments, collapsible file blocks, greeting + chips, conversation side-nav with proper `<Link>` anchors, pill user bubbles, icon-only action bar.

---

## Phase 1 — Remaining quick wins (each < 30 min, total ~2 hrs)

Goal: finish the claude.ai-parity pass on polish details. All single-file changes, no schema or architecture risk.

| # | Change | File | Why |
|---|--------|------|-----|
| 1 | **Thumbs-up / thumbs-down feedback buttons** on assistant messages. No-op initially (log to console), wire later. | `MessageRenderer.tsx` | Table-stakes for chat UIs. Signals "production product". |
| 2 | **Bot avatar icon** instead of `<AvatarFallback>AI</AvatarFallback>` text | `MessageRenderer.tsx` | "AI" text avatar reads as placeholder. |
| 3 | **`Cmd+Shift+N` keyboard shortcut** to start a new conversation, registered in `KeyboardShortcuts.tsx` + listed in the `?` help modal | `KeyboardShortcuts.tsx`, `ChatPage.tsx` | Power-user affordance matches claude.ai. |
| 4 | **Sidebar ellipsis menu** — replace hover trash with `…` → DropdownMenu (Rename, Delete-with-confirm) | `ConversationSidebar.tsx` | Direct-trash on hover is the classic accidental-delete trap. |
| 5 | **Filled `+` attach button** — currently ghost, blends in. Change to `variant="outline"` or `bg-muted` | `prompt-input.tsx` OR override via className in `ChatPage.tsx` | Attachment discoverability. |
| 6 | **Widen sidebar from `w-56` to `w-64`** (32px gain for titles) | `ConversationSidebar.tsx` | Titles truncate too aggressively at 224px. |
| 7 | **Strengthen input focus ring** — current `border-muted-foreground/30` almost invisible on dark mode. Use `focus-within:ring-1 focus-within:ring-primary/20` + `focus-within:border-primary/30` | `ChatPage.tsx` | User should feel the input activate. |
| 8 | **Subtitle hierarchy** under greeting — `text-muted-foreground/60` so heading dominates | `ChatPage.tsx` | Eye path: greeting → subtle guidance → input. |
| 9 | **Bottom spacer `h-32` → `h-48`** so last message never hides behind input on short viewports, especially with attachment tiles | `ChatPage.tsx` | Content hidden behind input is frustrating. |

**Exit criteria for Phase 1**: full live pass via Chrome MCP — every interaction has a hover state, every button has aria-label, no phantom scrollbars at any viewport, last message never hidden.

---

## Phase 2 — Medium wins (each 1–3 hrs, total ~1 day)

Goal: richer tool/message UI and smarter empty-state interactions. Higher user-visible value than Phase 1, some touch shared schemas.

| # | Change | Why | Effort |
|---|--------|-----|--------|
| 10 | **Collapsible reasoning** — wrap `reasoning` parts in `<Collapsible>` with "Thought for X seconds" header + brain icon, collapsed by default | Raw reasoning is noisy and buries the actual response | Medium |
| 11 | **Tool PARAMETERS / RESULT sections** — label the two blocks inside `ToolContent` with small-caps headers + separator | Much easier to scan long tool calls | Medium |
| 12 | **Tool status badge** — `Running` (spinner) / `Done` (check) pill at trailing edge of `ToolHeader` | At-a-glance state without expanding | Medium |
| 13 | **Chip hover preview** — live-inject preset text into the textarea while hovering, clear on leave, commit on click. New `onPreview` prop on `ActionChips` | Transforms chip UX from "menu" to "suggestion exploration" | Medium |
| 14 | **Structured file-attachment pill in transcript** — reuse `AttachmentTile` styling for sent file parts, replace `📎 {filename}` fallback | Deliberate look vs text fallback | Medium |
| 15 | **New-message badge on scroll-to-latest** (`↓ 3 new messages`) | User knows how much they've missed while scrolled up | Medium |
| 16 | **Contextual placeholder** — empty-state vs mid-conversation (`"Ask anything, or drop a file…"` vs `"Reply…"`) | Guides user to the right mental model | Quick |
| 17 | **Compact model name in picker button** — add `shortLabel` to model config (e.g. "Kimi K2.5" → "Kimi"), truncate to `max-w-[140px]` | Keeps input footer clean at narrow widths | Medium |
| 18 | **Wire conversation search into Command Palette** (Cmd+K) — server endpoint already exists | Conversation search is essential as history grows | Medium |

**Exit criteria for Phase 2**: send a message, watch streaming indicator → reasoning collapse → tool card with sections → response render; every step feels polished.

---

## Phase 3 — Larger features (each 0.5–3 days)

Goal: differentiating features that unlock new workflows. Touch server schema, `useChat` internals, or require LLM-assisted generation.

| # | Change | Why | Effort |
|---|--------|-----|--------|
| 19 | **Message branching** — on edit, preserve previous response as branch[0], new as branch[1]. Wire existing `MessageBranch` primitives in `message.tsx` (already fully built, just unwired) | Iterative refinement is one of the most-used claude.ai patterns | Large |
| 20 | **Auto-generated conversation titles** — after first exchange, background API call generates a short title via LLM, updates D1 + invalidates sidebar | "New conversation" as permanent title is a dead-end | Medium-Large |
| 21 | **Chat preferences panel** — preferred name / response style / tone, stored in `user_meta`, injected into system prompt in `buildChatAgent` | Personalised prompts produce better responses + product ownership | Medium-Large |
| 22 | **Projects / scoping** — `project_id` FK on conversations + `projects` table (id, name, system_prompt). Sidebar project selector | Flat conversation namespace doesn't scale | Large |
| 23 | **Streaming smooth auto-scroll** — `requestAnimationFrame` tick while `isLoading === true` to keep latest content visible, stop on finish | Choppy auto-scroll is one of the most noticeable chat-UI deficiencies | Medium |
| 24 | **Animated waveform on audio recording** — 3-bar CSS equalizer in `AudioRecorder` compact mode | Static timer alone is ambiguous | Quick-Medium |

**Exit criteria for Phase 3**: dogfood a full week, compare side-by-side with claude.ai, feel fundamentally equivalent for our use cases.

---

## What we intentionally skip

These were in the audit but don't fit the pattern-library philosophy of the starter:

- **"Surprise me" chip / serendipity** — cute but not a pattern we want to ship as default
- **Styles picker / deep-research toggle** — premature UI; better as client-specific fork additions
- **Thinking-bar progress indicator inside tool header** — decorative, low-info

---

## Execution approach

- Work through tasks in order (see TaskList).
- After each task: `pnpm type-check` + `pnpm build` + `wrangler deploy`, then **dogfood via Chrome MCP** (per the "Test live app after every non-trivial deploy" feedback rule).
- Batch commit at end of each phase with a clear subject like `feat(chat): Phase 1 claude.ai parity wins`.
- If any task produces a schema change, run the D1 migration locally + remote before merging the code.

---

## Links

- Full audit: `.jez/artifacts/chat-ergonomics-audit-2026-04-17.md`
- Saved claude.ai HTML: `~/Downloads/Using the ask me questions tool - Claude.html`
- Screenshots: `~/Documents/screenshots/` (47 files from 2026-04-17 session)

*Written: 2026-04-17*
