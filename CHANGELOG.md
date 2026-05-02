# Changelog

All notable changes to `vite-flare-starter`.

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
