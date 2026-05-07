# Changelog

All notable changes to `vite-flare-starter`.

## v1.9.0 — 2026-05-07

Two-week sprint covering: a new Knowledge primitive, voice mode for the
chat agent, the brains-trust review pattern, a tool-UI rendering tier
that auto-upgrades the long tail, the durable batch-task swarm, and
half a dozen cross-project ports. ~30 commits / 628 changes since
v1.8.0. Live at <https://vite-flare-starter.webfonts.workers.dev>.

### Added — Knowledge module (long-form indexed reference docs)

Third primitive in the agent context layer, sitting between **memories**
(small structured facts, ≤8KB) and **skills** (procedures with
progressive-disclosure resources). Knowledge docs are plain reference
content the agent applies without performing it as a procedure.

- D1 `knowledge_documents` table with `(scope, scopeId)` discriminator
  matching memories' shape, `injection_mode` enum
  (`always` | `on_demand` | `disabled`), `format` enum
  (`markdown` | `json` | `text`), JSON `tags`, `estimatedTokens`.
- FTS5 virtual table for full-text search; AI/AU/AD triggers maintain
  the index. `AFTER UPDATE OF title, summary, body, tags` so
  metadata-only PATCHes don't churn the index.
- REST routes at `/api/knowledge` (CRUD + search + catalog + budget).
  List endpoint omits body by default (`?include=body` to opt in).
  Hard-cap 256KB per doc, soft-cap 100KB.
- Two chat tools: `knowledge_search` (BM25-ranked FTS5) and
  `load_knowledge` (returns body wrapped in `<knowledge_content>` for
  compaction-guard preservation).
- `chat-agent.ts` section 8c: always-mode bodies inject as
  "Active Knowledge" extraSection; on-demand entries inject as
  "Available Knowledge" catalog with `(id: ...)` references.
  Server-side cap at 50K total always-active tokens with a truncation
  notice appended to the prompt.
- `/dashboard/knowledge` list page (cards/list toggle, FTS5 filter,
  always-active token-budget banner) and `/dashboard/knowledge/:id`
  editor (split-pane, scope picker, injection-mode + format selectors,
  comma-separated tag input, live token estimate, dirty-tracking).
- `VITE_FEATURE_KNOWLEDGE` flag (default ON), nav entry under Setup
  with `BookOpen` icon.

### Added — Voice mode (push-to-talk + auto-TTS)

Conversational voice IO around the existing ChatAgent. Distinct from
the older `VoiceDictationButton` (streaming STT into the input field
via DO+WS) — voice mode adds **AUTO-TTS for every assistant reply**
and one-shot transcribe via HTTP, no Durable Object.

- Server: `voice-tts.ts` wraps Workers AI Aura 2 (free default) +
  ElevenLabs (opt-in via `ELEVENLABS_API_KEY`). Aura speaker validated
  against the `AURA2_SPEAKERS` enum; bad input falls back to default.
- Server: `voice-routes.ts` at `/api/voice` — POST `/transcribe`
  (multipart audio → Nova 3 → text), POST `/tts` (JSON → audio/mpeg),
  GET `/voices` (capability discovery).
- Client: `useVoiceChat` hook implements the full state machine
  (idle → listening → transcribing → speaking → idle) with `MediaRecorder`
  (webm-opus per Nova 3 binding requirement), `AbortController` +
  25s timeout on both fetches, race-condition-safe via session counter,
  iOS Safari unlock via primed silent-MP3 audio element + `playsInline`.
- Client: `VoiceModeButton` push-to-talk control with tap-to-toggle
  and hold-to-record (250ms threshold), multi-touch guard via
  `capturedPointerIdRef`, click suppression after pointer release so
  successful utterances don't toggle the mode off, "voice mode
  unsupported" tooltip on iOS Safari.
- Reply-id burned only after `audio.play()` resolves so transient
  failures don't permanently lose a reply.
- Live verified end-to-end via TTS → ffmpeg webm-opus → transcribe
  loopback (`afca706`).

### Added — Brains-trust review pattern

After every non-trivial build, run a **multi-reviewer code review** via
2-4 frontier models (default panel: GPT-5.5 + Opus 4.7 + DeepSeek v4
Pro + DeepSeek v4 Flash, ~$0.46-$0.81 per round). Cross-validated
critical/high issues fixed before commit; cross-validated highs before
deploy. Caught a guaranteed-fire voice bug, cross-user knowledge leaks,
silent ElevenLabs billing footgun, iOS playsInline gap, and 13 other
issues that single-pair review missed.

Codified in `~/Documents/.jez/jeremy/CLAUDE.md` as a session-default
rule. Audit artefacts in `.jez/audits/2026-05-07-*`.

### Added — Tool UI rendering tier (shape renderers)

`tool-renderers/shapes.tsx` — 4 generic renderers that match by
**output shape** rather than tool name:

- `{ stdout, stderr, exitCode }` → terminal block with copy button +
  exit-code badge (covers `run_python`, `run_shell`, `run_js`)
- `{ imageUrl | dataUrl | url(image-ext) }` → inline image preview
  with width×height + format badges (covers `browser_screenshot`,
  `generate_image`, `video_frame`)
- `{ markdown | content | body }` (≥80 chars + title or markdown
  markers) → prose viewer with frontmatter expand, char/token count
- `{ rows: [Object], columns? }` → data table with col detection,
  50-row preview, total counter (covers data tools, sheets, many MCP)

Auto-upgrades ~30 long-tail tools to rich UX with **zero per-tool
client code**. Registered AFTER bespoke renderers, BEFORE defaults.

`tool-renderers/skills-knowledge.tsx` — bespoke views for
`knowledge_search`, `list_skills`, `load_skill`, `load_knowledge` with
title + scope + tag pills + copy-able body, strips agent-facing
compaction tags.

`scripts/tool-coverage.mjs` + `pnpm tool-coverage` — audit script that
walks server tool defs vs client renderers + defaults; exits non-zero
on any bare-wrench tool. Coverage went from **43% rich + 21% bare** →
**43% bespoke + 0% bare** (live UI is +25-30% from shape renderers).

### Added — Connector catalog seed (post-brains-trust)

Catalog grew from 1 entry (Australian Business Register) to **7**
(Slack, Notion, GitHub, Linear, Stripe, Airtable + ABR). Each entry
has a new `capabilities: string[]` for "what your AI can do" bullets
and `source` attribution (e.g. "via Smithery"). Header comment warns
fork-owners to verify URLs before relying.

UI changes:
- "Browse apps" → **"Add an integration"**
- "Add custom" → **"Connect by URL"**
- Empty state: benefit-led copy ("Connect Slack and your AI can read
  channels, post updates, find messages…")
- Modal: per-entry capability bullets matching the Workspace card
  pattern
- "MCP" purged from primary user-facing copy (kept in one HelpDisclosure)
- First-connection toast suggesting an example prompt, anchored on
  localStorage

`docs/mcp-connectors.md` refreshed with the 2026 registry landscape
(Smithery 7K+, Official MCP Registry, FastMCP, Cloudflare's 16
first-party MCP servers documented for fork-developer use).

### Added — `batch-tasks` durable swarm (Cloudflare Workflows)

Process N items in parallel windows of 8 with per-item retry +
exponential backoff. Used via the `start_batch_task` chat tool ("for
each of these 50 PDFs, extract X"). Item content loaded from R2,
non-text docs converted via `env.AI.toMarkdown`. Approval-gated above
5 items.

### Added — `with_review` tool (Worker→Reviewer quality loop)

Cheap worker drafts → smarter reviewer scores via APPROVE / REVISE /
REJECT verdicts → worker rewrites with notes → cap at `max_iters` with
optional escalation. Reviewer criteria from a Skill (`review-output`
ships bundled) or inline prompt. Composes with `start_batch_task` for
"do 50 things, but quality-gate each output."

### Added — Hybrid memory recall scoring

`agentRecall` now ranks via
`0.55*sim + 0.20*importance + 0.15*recency + 0.10*frequency`.
`RECALL_WEIGHTS` exposed as a constant; importance optional on
`agentRemember`. Frequency reserved at 0 until Vectorize counter
support lands.

### Added — `find_tools` + `list_tools` meta-tools

`find_tools(query)` keyword-searches with per-token scoring (multi-word
queries work properly); `list_tools(category)` paginates by name prefix
(e.g. `gmail_`). Both core tools — always active in the chat agent's
`prepareStep`. Progressive tool disclosure for the 140-tool registry.

### Added — Cross-project ports (5 + 2 + 2)

Lifted patterns from goanna, rightcover, kindling, and crosbe-ai:

- **EXIF metadata stripping** for image uploads (kindling) — gated
  by `STRIP_IMAGE_METADATA` env var
- **OG metadata scraper** (kindling) — adapted with a vfs UA
- **Domain reviewer skills** — `review-email-tone`, `review-summary-faithfulness`, `review-code-security`
- **Compaction-guard checklist** in `docs/AGENTS.md`
- **Static/dynamic prompt split** verification (fixes Anthropic
  prompt-cache poisoning when current date/time is in the system field)
- **Per-tool telemetry table** + `/tool-usage` observability endpoint
- **`agent-asks-tasks` skill** (always_active goanna pattern) for
  durable agent ask + task logs
- **`caretaker` skill** — day-of-week rotating outward sweep
  (Mon=connections / Tue=routines / Wed=skills / etc.)
- **`reverie` skill** — bounded inward consolidation when an agent
  has had N consecutive quiet runs

### Changed — Skills polish

- Side-by-side live preview in Source tab (Tier 2.2)
- Drop Overview tab; default to Edit
- Edit-from-Overview per-section deep-link to Source
- Save state shows "Saved"; diff cards collapse context
- Hide meta-skills (`disable_model_invocation: true`) from the
  user-facing catalog
- Skills + filter row + surface artifacts under Builder

### Fixed — Safety patches + binding-shape gotchas

- 8 destructive chat tools were missing approval gates; added
  `needsApproval: true` to each (`e3a5488`)
- Aura 2 binding rejects `container='none'` when `encoding='mp3'` —
  removed; broadened response parser to handle ArrayBuffer /
  ReadableStream / Uint8Array shapes
- Nova 3 needs multipart `body` not raw ArrayBuffer — wrapped in
  FormData (same trick as `audio/routes.ts`)
- Tool-search FTS query missed reserved keywords (NOT/OR/-/etc) —
  rewrote to phrase-wrap each token
- Knowledge `org` scope was unconditionally allowed — denied until
  Phase 5 lands real membership
- Knowledge catalog/budget endpoints accepted attacker projectId —
  validated via `checkScopeAccess`
- Knowledge chat tool added `ctx.projectId` without ownership
  intersection — fixed
- Disabled knowledge docs were searchable+loadable by agent — filtered
- iOS Safari TTS `play()` after `await fetch()` rejected with
  `NotAllowedError` — added `unlockAudio()` primed inside the toggle
  gesture; reuse element via `.src` swap
- iOS Safari `MediaRecorder` doesn't support webm — `pickMimeType`
  returns null + UI shows "voice mode unsupported" tooltip
- Auto-TTS reply-id burned BEFORE play succeeded — silent data loss
  on transient failures; fixed
- ElevenLabs default flip on env-key set was a billing footgun — Aura
  is now unconditional default

### Internal

- `runModelText` helper extracted for the
  workers-ai-provider/Anthropic raw call patterns
- `resolveR2Keys` simplified
- New `.claude/rules/one-file-tool-definitions.md` extension: every
  tool must satisfy one of (`_ui` marker / matches a shape / bespoke
  renderer / at-minimum default meta)
- Audits saved at `.jez/audits/2026-05-{06,07}-*` for full traceability

---

## 2026-05-02

### Added — AdminAgent v1 (gh #49)

Claude-Code-style platform management agent. Lives in `#admin-chat` Space, proposes routine / agent / connection changes via natural language. Every write action queues for approval. 14 admin tools across routines + situational awareness + agent management. ~50 lines of forking code adds a new agent class.

### Added — Agent management UI

`/dashboard/agents` — one unified card grid for all AI agent instances (per-user) and dormant classes. Click any card → edit sheet for persona / model / daily budget. "+ New agent" dialog picks type + name. Dormant cards activate on save. AdminAgent agent-management tools (`set_agent_persona` / `_model` / `_budget`) call the same endpoints.

### Added — `/dashboard/admin-chat`

Find-or-create the user's `#admin` Space, lands them in a chat with AdminAgent. Sidebar entry under Setup.

### Added — Branding primitives (gh #60)

`appConfig.brand.{primaryColor,accentColor}` (CSS colour overrides on default scheme) · `appConfig.logos.{sidebar,signIn,favicon,og}` (per-surface logo set) · `appConfig.defaultThemeMode` · email branding env vars (`EMAIL_FROM_NAME`, `EMAIL_SIGNATURE`, `EMAIL_HEADER_IMAGE_URL`).

### Added — Skills detail route (gh #61)

`/dashboard/skills/:slug` — full-width editor on its own route. Card click navigates instead of selecting. Removes scroll-up-click-scroll-down loop on 14+ skills.

### Changed — Sidebar restructure (UX dogfood)

Three intent tiers: **Work** (Home / Chat / Inbox / Projects / Spaces / Routines, visible) · **Setup** (Connections / Skills / Agents / Admin chat, collapsed) · **Insights** (Observability / Activity / Files / Extract, collapsed). Approvals removed from sidebar — folded into Inbox. Day-1 visible items: 6, down from 12+.

### Changed — Builder mode default ON

`VITE_DEFAULT_BUILDER_MODE` env var. Starter default ON (audience IS builders); forks set `false` for polished products. Extract moved out of Builder into Insights (it's a user feature). `Components`, `Style guide`, `Voice/Video example` remain dev-only.

### Changed — Inbox: approval detail in Sheet (Slice A + A-prime)

Click an approval row in Inbox → opens `ApprovalSheet` inline. No more route bounce to `/dashboard/approvals?focus=`. `ApprovalCard` + helpers extracted from `ApprovalsPage` into `src/client/modules/approvals/components/ApprovalCard.tsx` — single source of truth. ApprovalsPage simplified to ~110 lines (was ~500), preserved for notification deep links.

### Changed — Dashboard "Start something new" cards

Replaces the one-line button row with a 4-card grid (Chat / Project / Space / Routine). Each card has icon + label + one-line description. Helps newcomers pick the right entry point without learning vocabulary first.

### Changed — Plain-English agent UI

"Class" → "Type" in the New agent dialog. Dropped code-path leaks (`src/server/modules/autonomous-agents/`) from user-facing copy. New disclosure on `/dashboard/agents` explains class-vs-instance in non-jargon language. Stats row reflowed to 1×4 on `sm:+`.

### Plans saved (cross-session)

- `.jez/plans/2026-05-01-admin-agent-v1.md`
- `.jez/plans/2026-05-01-shadcn-coherence-plan.md`
- `.jez/plans/2026-05-02-inbox-consolidation.md` — covers Slice B (pluggable row-shape registry) + C (snooze/pin/filter triage polish), both deferred.

### Issues closed

#44 / #45 / #46 / #47 (onboarding cluster, were stale-open after ship) · #48 (Spaces audit follow-ups, 3 of 5 done, rest deferred to #43 Phase 2) · #49 (AdminAgent v1) · #51 (KV vs D1 design Q answered) · #59 (closed previously) · #60 (branding primitives) · #61 (skills detail route).

## 2026-04-30

### Added — Layout primitives (gh #59)

Cleared the "split-pane entity list pages" issue by shipping focused
primitives + scaffolds + a decision rule, NOT the proposed
`<EntityListPage<T>>` mega-component (premature framework by the
3+-instances rule).

- **15 shadcn primitives** confirmed installed (chart, item,
  toggle-group, empty, resizable, hover-card, combobox, pagination,
  progress, breadcrumb, accordion, scroll-area, navigation-menu,
  collapsible) — 14 from prior runs + new `data-table`.
- **`DataTable`** (`src/components/ui/data-table.tsx`) — generic shadcn
  + TanStack Table integration with column sort, client-side
  pagination, empty state, optional row click.
- **`useViewPreference`** (`src/client/lib/use-view-preference.ts`) —
  hook for per-surface layout view persistence in localStorage scoped
  to `appConfig.id + surfaceKey` so forks don't collide. SSR-safe;
  tolerates quota / private-browsing failures.
- **Skills retrofit** — replaced 320px split-pane with card-grid
  default + list-view toggle (via shadcn Item + ToggleGroup). Selected
  skill's editor renders below the grid (claude.ai pattern), no
  separate route. Two clean focus stops per row.
- **Two new `_template` scaffolds** — `CatalogPage.tsx` (cards-default
  with optional list toggle) and `TablePage.tsx` (DataTable). Sit
  alongside existing `IndexPage.tsx` (queue). README has a decision
  table mapping each scaffold to its intended use case.
- **Agent observability dashboard** — new `/dashboard/agent-observability`
  page with bar (runs/agent) + area (cost/day) charts via shadcn
  `Chart` wrapper over Recharts. New `GET /api/agent-observability/stats?range=7d|14d|30d|90d`
  endpoint with gap-filled date buckets. Range toggle via ToggleGroup.
- **CLAUDE.md decision rule** — three-shape picker (cards / list /
  table) pointing at the matching scaffold, plus when-to-add-a-new-primitive
  guidance citing `~/.claude/rules/trust-skills-not-elaborate-code.md`.

### Removed

- Orphan `src/components/ui/empty-state.tsx` (zero references).
  Canonical empty-state is `src/client/components/EmptyState.tsx`
  (used in 18 places — has tips + dual-action API). The shadcn
  `Empty` family stays as low-level composables for special cases.

### Docs

- `docs/PRIMITIVES.md` — added Item, DataTable, Chart, ToggleGroup,
  Empty, Resizable, HoverCard, Combobox, Pagination, Progress,
  Breadcrumb, Accordion, Collapsible, ScrollArea, NavigationMenu,
  useViewPreference. Decision tree updated to point at scaffolds.
  New anti-patterns: hand-rolled Recharts imports, hand-rolled
  view-toggle localStorage, EntityListPage mega-component.
- `docs/PAGE_GRAMMAR.md` — index/catalog body shape updated to point
  at Item / DataTable / ListRowGroup with scaffold pointers.
- `docs/ONBOARDING.md` — "Picking a layout for a new list page"
  walkthrough; "What's already done" extended with DataTable,
  useViewPreference, ChartContainer.
- `README.md` — layout-primitives line in features.
- `SESSION.md` — refreshed to 2026-04-30.

## 2026-04-23

### Added — Google Workspace connector (Phases 1-3 + NLP)

21 new Workspace tools, bringing the per-user Google integration from 5 tools (search-only) to **26 tools** across Gmail, Drive, Calendar, Docs, Sheets, and Tasks.

**Gmail (4 new):** `gmail_get_message`, `gmail_list_labels`, `gmail_draft`, `gmail_reply` (with In-Reply-To / References threading)

**Calendar (5 new):** `calendar_list_events` (with range presets), `calendar_get_event`, `calendar_find_free_slot` (freeBusy-based with timezone-aware working hours), `calendar_update_event`, `calendar_delete_event`

**Docs (4 new):** `docs_search`, `docs_get` (with markdown-ish structure preservation), `docs_create`, `docs_append` (with heading style application)

**Sheets (4 new):** `sheets_list_tabs`, `sheets_read_range` (A1 notation), `sheets_append_row`, `sheets_write_range`

**Drive (2 new):** `drive_get_file` (with streaming cap to prevent Worker OOM), `drive_create_folder`

**Tasks (2 new):** `tasks_list`, `tasks_create`

**Natural-language query translation** — `gmail_search` and `calendar_list_events` accept an optional `naturalQuery` field that's translated to structured syntax via Nemotron 3 on Workers AI. "emails from nick last week with attachments" becomes `from:nick after:2026/04/16 has:attachment`. 10s timeout with graceful passthrough on failure.

All write operations are `needsApproval: true` AND gated via `computeActiveTools` in `prepare-step.ts` — they're hidden from the model unless the latest user message contains an unlock keyword.

### Fixed — Seven bugs from code review

- **MIME separator** (critical): `.filter(Boolean)` on the gmail_send/draft/reply MIME array was dropping the blank line separator between headers and body whenever `cc`/`bcc` were absent, producing malformed RFC 5322 messages that some clients rendered with no body
- **docs_append index math** (critical): multi-heading appends mis-applied styles because `updateParagraphStyle` and `deleteContentRange` requests had indices that shifted under each other's effects. Rewrote to strip `#` prefixes before insertion, apply only paragraph styles
- **calendar_find_free_slot timezone** (critical): used `Date.getHours()` which returns UTC in Workers — Sydney user asking for 9-17 slots got nothing because UTC 9-17 is 19:00-03:00 AEST. Added `timezone` input, Intl.DateTimeFormat for local hour
- **gmail_reply self-reply**: `replyAll` could reply-to-self because Gmail does not dedupe self-addresses. Added profile fetch to filter user's own email from cc list
- **drive_get_file streaming cap**: file content was buffered before size check, letting a misreported 10MB file OOM the 128MB Worker heap. Added pre-check + `readCappedText()` streaming reader
- **scope substring match**: `row.scope.includes('gmail.readonly')` could false-positive on future super-set scopes. Now splits + exact-matches the URI suffix
- **docs_get degraded flag**: Drive-export fallback silently lost heading structure; added a `degraded: true` flag surfaced in the renderer

### Fixed — Auth + UX

- **Approve button actually works now** — `useChat` was missing `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`, so `addToolApprovalResponse` stored the approval locally but never re-submitted to the server. Clicking Approve looked completely inert.
- **Tab refocus no longer bounces to /dashboard** — better-auth `useSession` refetches on window focus by default. If the refetch briefly returned null, `ProtectedRoute` redirected to `/sign-in?next=...` and `PublicOnlyRoute` then redirected to `/dashboard` (ignoring `next`), so users landed on the homepage without clicking anything. Disabled focus-refetch + taught `PublicOnlyRoute` to honour `?next=`.
- **SourcesFooter** collapses beyond 8 items with "+N more" toggle
- **Tool errors** tab truncates long stack traces with "Show full error"
- **onError handler** no longer leaks stack frames to the client; returns sanitised messages keyed off error.name

---

## 2026-04-22

### Added — AI SDK standards adoption (Phases 0-E)

**Phase 0 — Unified ToolDefinition contract.** All 23 tool modules migrated to a single canonical `ToolDefinition<Input, Output>` shape in `src/shared/agent/tool.ts`. Server `execute`, input/output Zod schemas, and optional client render metadata now live in one object. Replaces the previous split between server `tool()` objects and client renderer files.

**Phase A — Typed renderers + strict output schemas.** 51 `outputSchema: z.unknown()` replaced with strict `z.union([success, error])` schemas across 22 tool files. Types infer through to renderers via `z.infer<typeof XOutput>`.

**Phase B — Per-tool telemetry.** New `ai_tool_calls` D1 table (migration `0018`) captures per-step telemetry from `onStepFinish`: step index, tool name, duration, tokens, error. Admin panel gets a "Tool errors" tab that reads the last 24h. Telemetry also structured-logged as `event: "tool_error"` JSON to Workers Logs.

**Phase C — Sources UX.** `SourcesFooter` component under assistant messages aggregates citations from `web_search`, `gmail_search`, `drive_search`, `places_search` tool outputs plus native `source-url` / `source-document` UIMessage parts. `sendSources: true` enabled on the chat stream. Collapses at 8+ items.

**Phase D — Reliability + cost.** `computeActiveTools()` filters privileged tools (destructive operations like `gmail_send`, `run_shell`) unless the user message contains an unlock keyword OR the tool was already used successfully in-conversation. `experimental_repairToolCall` added with structured error logging on tool parse failures.

**Phase E — Agent control + structured output.** `prepareStep` enhanced with active-tools filter composed with existing token-budget check. `Output.object` already in place for structured extract.

See `.jez/artifacts/ai-sdk-standards-adoption-plan-2026-04-22.md` for the full plan.

### Fixed — Pre-Workspace UX audit (4 rounds, ~30 fixes)

Rounds covered auth, chat, files, skills, settings, notifications, connectors, admin, activity, organization, security, API tokens, profile. Highlights:

- SignIn / ProtectedRoute preserve `?next=` deep links
- Chat conversation-not-found state with clear CTAs
- Fixed time-of-day greeting bands
- AbortController on in-flight summarise calls
- Folder-aware empty states on Files page
- Skills upload dialog → AlertDialog (replaced `confirm()`)
- Form race-condition fixes via `<fieldset disabled>` pattern
- Dark-mode contrast fixes (semantic tokens instead of raw Tailwind colors)
- Keyboard accessibility on InlineEdit component
- Pagination hidden during Activity page loading state

---

## 2026-04-21 and earlier

For the full history of the project's development (projects module, chat UX overhaul, files pipeline, MCP connectors, voice/video agent scaffolds, skills system, OAuth hardening, etc.) see the git log and the plan artifacts in `.jez/artifacts/`.
