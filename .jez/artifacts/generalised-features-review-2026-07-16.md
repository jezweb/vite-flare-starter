---
date: 2026-07-16
status: active
owner: jez+claude
---

# Generalised features review — issues × ecosystem — 2026-07-16

Post-v2.0.0 review: every open GitHub issue triaged, cross-referenced against
July-2026 ecosystem research (open knowledge formats, DESIGN.md, MCP UI /
artifacts, better-auth, backups, kanban/wiki/search patterns). Goal: decide
what generalised features are worth shipping in the starter next.

## Part 1 — Issue triage (all 21 open issues, read in full)

### Shipped — close now (housekeeping)

| # | Title | Evidence |
|---|---|---|
| #105 | Coordinated agents-stack bump | Shipped in PR #104, live |
| #106 | Sandbox run_python + generate_document | Shipped in PR #104, live-verified (printed 42) |
| #107 | Email delivery events + suppression | Shipped in PR #104 (`delivery-events.ts` + docs) |
| #108 | AI quick wins (GLM-5.2, Moondream, prefix caching) | Shipped in PR #104 |
| #93 | images `.info()` on pipeline bug | Already fixed on main (`transform.ts:176` calls `images.info(stream)`) |
| #99 | Monthly catalogue check 2026-06-25 | Superseded — `pnpm doctor:models` run + models refreshed in the v2.0.0 cycle |

### Keep open — trackers (no action)

| # | Why |
|---|---|
| #109 | Deliberate-migrations tracker (DO exports, TS7, RR v8) — reference doc |
| #40 | Roadmap menu — harvest items from it below, keep as menu |
| #63 | Coaching-fork planning doc — fork-side, findable when needed |

### Security — #95 remaining HIGHs (dedicated batch, not this cycle's feature work)

Quick self-contained items still unchecked: admin emailVerified gate in
`middleware/admin.ts` (note: CLAUDE.md claims this is done — verify which is
stale, doc or code), admin-vs-admin protection, error-handler leak, voice
route rate limits, PlaceMap `javascript:` URL, msw_user cookie signing (the
gws twin was fixed), mailgun region, slack token type, batch retry
double-count, config-diff resource-id mixup, routine budget enforcement.
**Note:** the first checkbox (admin emailVerified) is stale — verified fixed
on main (`middleware/admin.ts:68,78` gates auto-promote AND access on
`emailVerified`). The checklist needs a re-verify pass before the batch.
Design items: Space-agent principal model, mcp-connections userId binding,
install_skill namespace, saveChat owner check, webhook-agents addressing.
**Recommendation: one focused security session, same shape as PR #94/#101/#103.**

### The generalised-feature candidates (decided in Part 3)

| # | What | Gates |
|---|---|---|
| #62 | Kanban, custom fields, time entries, share tokens, global search | #110 fork needs (1) + (5) |
| #110 | Wiki/ops-dashboard fork gates: kanban + global FTS + D1 mirror | fork blocked until landed |
| #90 | D1 mirror pattern (cron → Workflow → D1 + refresh) | #110 |
| #77 | Read-only SQL tool over isolated D1 | pairs with #90 |
| #89 | Domain-scoped web search (small) | — |
| #85 | Background pre-compute pattern (docs) | — |
| #84 | Routines write status onto domain rows (docs + helper) | — |
| #83 | "Never a dead end" queue pattern (docs + Inbox adoption) | — |
| #75 | AI transparency umbrella: capture → trace contract → digest UI | — |
| #36 | workerd stage-3 decorators (upstream, wait) | — |
| #35 | AgentMemory GA wiring (still private beta per platform review) | — |

## Part 2 — Ecosystem research findings

### 2a. Open formats (verified against primary sources, July 2026)

- **AGENTS.md** — now Linux-Foundation-governed (Agentic AI Foundation, Dec
  2025), 60k+ repos, 20+ tools read it (Copilot, Cursor, Zed, Gemini CLI).
  The starter has a rich CLAUDE.md but **no AGENTS.md** — every non-Claude
  agent forking the starter gets nothing. Convention: compact AGENTS.md
  (commands + conventions + pointers), CLAUDE.md stays the Claude overlay.
- **DESIGN.md** — real, from Google Labs / Stitch, open-sourced 2026-04-21
  (github.com/google-labs-code/design.md). YAML token frontmatter + required
  sections (Colors, Typography, Do's/Don'ts…). ~461 community files at
  designmd.app; read by any file-reading agent. We literally just rebooted
  the design system to Kumo tokens — `.claude/rules/design-tokens.md` is a
  proprietary DESIGN.md already. Strongest strategic fit.
- **llms.txt** — first institutional boost: Chrome **Lighthouse 13.3 added an
  "Agentic Browsing" category** (default config) that checks llms.txt
  presence. Shopify ships it to every store. A tiny generated `/llms.txt`
  route makes every fork pass the audit. Generate, don't hand-keep.
- **Google OKF (Open Knowledge Format)** — real, Google Cloud, v0.1
  (2026-06-12): org knowledge as markdown + YAML frontmatter directories;
  only required field is `type`. Zero non-Google adopters yet. **Align,
  don't adopt**: add `type:` to the knowledge module's frontmatter and note
  OKF compatibility; revisit at v0.2.
- Three-layer framing consolidating in commentary: AGENTS.md = how to work
  here, SKILL.md = how to do a task, DESIGN.md = how it should look, OKF =
  what the org knows. The starter would have all four.

### 2b. MCP UI / artifacts / generative UI (verified vs spec repos + npm)

- **MCP Apps (SEP-1865) is now the official standard** — first official MCP
  extension, spec `2026-01-26`, the OpenAI+Anthropic+MCP-UI collaboration.
  Tools declare `_meta.ui.resourceUri` → `ui://` HTML template → host renders
  in sandboxed iframe with JSON-RPC-over-postMessage bridge. SDKs:
  `@modelcontextprotocol/ext-apps` 1.7.4 (has `/app-bridge` host side) or
  `@mcp-ui/client` 7.1.1. Adopted by Claude, ChatGPT, VS Code, Goose,
  Postman; servers from Shopify/HF/ElevenLabs.
  **Timing note: the 2026-07-28 MCP spec release (12 days away) finalises
  the Extensions framework, makes MCP stateless, and deprecates
  Roots/Sampling/Logging** — build the compliant host AFTER the 28th.
- **Artifacts converged shape** (Claude/Canvas/Gemini + Vercel's open-source
  `vercel/chatbot`): right side panel + typed versioned documents + explicit
  publish (private by default, stable URL) + streaming render. Frontier:
  runtime capabilities (published artifact calls user's MCP connectors) —
  design the manifest, don't build yet.
- **Workspace pane is the settled agent-UX shape** — "chat left, live
  workspace right" (Operator/Manus/Kimi/Devin/Claude Code). Anatomy: tabs for
  plan / live tool execution / file tree / deliverable; pane follows the
  agent with pin override; steps timeline-addressable. The starter has every
  ingredient (tool telemetry, sandbox artifacts, batch progress, Files,
  Resizable). This is #40's "workspace pane" — its time has come, and
  **artifacts + workspace are one feature**: a `WorkspacePanel` with
  Activity / Files / Artifact tabs.
- **AI SDK 7 is out** (`ai@7.0.29`, ESM-only, Node 22+): native **tool
  approval policies** (our bespoke approvals queue has a first-class SDK
  counterpart), WorkflowAgent, `@ai-sdk/otel`. **Blocker unchanged:**
  `@cloudflare/ai-chat` + agents SDK peer-pin `ai ^6` — plan the migration,
  execute when CF packages move. `streamUI`/RSC officially discouraged —
  skip forever.
- **AI Elements** (Vercel's shadcn-registry chat components) — targets
  Radix-era shadcn, we're Base UI + Kumo now: **mine as design reference**
  (task list, file tree, artifact container), don't take the dependency.
  Their taxonomy independently converged on our shape-tier renderer
  architecture — good confirmation.

### 2c. better-auth capabilities + backups (verified vs npm/GitHub/CF docs)

**better-auth:** latest stable **1.6.23** (we're on 1.6.x — patch bump only);
**1.7.0 at RC** with real breaking changes (OIDC-provider plugin deleted →
OAuth 2.1 Provider; MCP plugin split to standalone package; explicit
`trustedProxyHeaders`). Don't upgrade to 1.7 until 1.7.1+; keep a watch-list.

Highest-value adds for the starter, all Workers+D1 clean:
- **Rate-limit storage fix** — better-auth's default in-memory rate-limit
  store is **per-isolate on Workers = silently broken**. Set
  `rateLimit.storage: 'database'` (or KV secondary). Tiny change, real fix.
- **Passkeys** (`@better-auth/passkey`, mature, pre-auth registration) —
  table-stakes auth in 2026.
- **Magic links** — wires straight into our 6-provider email registry.
- **Admin plugin** — ban/unban + **user impersonation** (support workflows);
  folds into existing admin module.
- **Org plugin v2 features** — teams/sub-groups + dynamic access control
  (runtime custom roles) are additive migrations on the plugin we already run.
  This IS issue #40's "org plugin v2".
- **Device authorization** (RFC 8628) — headless-agent/CLI login; very
  on-brand next to TEST_AUTH.
- 1.6 also added **native D1 support** (binding direct, `batch()` atomicity)
  and OpenTelemetry spans — worth assessing vs our Drizzle adapter.
- **Defer** the better-auth MCP plugin (docs flag it "soon deprecated in
  favour of OAuth Provider plugin"; 1.7 splits it out — churn guaranteed).

**Backups (the user-named gap — currently nothing in the starter):**
- **D1 Time Travel**: built-in PITR, 30 days paid / 7 free, any-minute
  bookmarks, destructive in-place restore. No clone-from-bookmark yet.
- **Beyond 30 days**: Cloudflare ships an **official Workflows example** for
  daily D1 export → R2 (polling export API → signed URL → stream to bucket).
  That's the blessed pattern: cron Workflow + retention pruning +
  `docs/BACKUPS.md` restore runbook.
- **R2**: still no native cross-bucket replication — second-bucket copy in
  the same backup Workflow is the pragmatic answer.
- **GDPR takeout upgrade**: settings export exists; upgrade = include R2
  file manifest + zip to R2 + expiring download link.

### 2d. Kanban / wiki / global search patterns (verified vs npm 2026-07-16)

**Kanban:**
- dnd-kit forked into two lines: `@dnd-kit/core` 6.x (in our deps, frozen
  since Dec 2024, still the ~2.8M/wk community standard) vs `@dnd-kit/react`
  0.5.0 (active, 0.x churn). **Stay on core 6.x**; migrate at 1.0.
  Atlassian's pragmatic-drag-and-drop only wins at 1000+ items.
- Best references: **ReUI Kanban has a Base UI variant** (built on dnd-kit —
  directly matches our base-nova stack); janhesters/shadcn-kanban-board for
  the a11y behaviour (keyboard grab/move/drop + live-region announcements +
  "Move to column" menu fallback — all three now table stakes).
- Ordering: `fractional-indexing@4` position keys → every reorder is one
  UPDATE; composes with TanStack optimistic updates and with agents
  inserting at arbitrary positions.
- **AI-native requirements** (Linear Agent / Trello+Rovo signals): card
  provenance (user vs agent badge), comment/activity stream per card, agent
  as *contributor* not owner, agent writes above threshold → approvals
  queue, board mutations as chat tools (`board_add_card`, `board_move_card`).
- Data: columns + cards as entity types in the existing entities module.

**Wiki:** the pattern that won for AI-native = markdown-canonical +
backlinks + freshness metadata (verifiedAt/verify window, Slite-style) +
**propose-don't-apply for agent edits** — which is exactly our
config-diff + approvals loop. Shape: **evolve the knowledge module** (don't
build a parallel store): add slug, `wiki_links` backlinks table (parse
`[[wikilinks]]` on save; dangling links = "pages to create" agent prompt),
versions, `wiki_propose_edit` tool via ConfigDiffCard, staleness routine
emitting `inbox_add` findings.

**Global search:** `cmdk` 1.1.1 still unchallenged (our command.tsx already
wraps it). Table stakes: grouped results, recents on empty state, debounced
async server search, **AI "ask" fallback row** (→ chat with query
pre-filled — nearly free for us). Architecture: **single unified
`search_documents` table + one FTS5 index** (BM25 scores aren't comparable
across separate FTS tables, so per-module UNIONs rank incoherently).
Modules write via an app-level `indexForSearch()` helper (triggers can't
flatten JSON blobs); triggers only sync content→FTS. Title weighted 10x,
snippet(), prefix indexes for typeahead, `reindexAll` admin endpoint day
one. Gotcha: D1 export doesn't support virtual tables.

### 2e. Feature gating — the two-system drift (own analysis)

Today there are **two disconnected gating systems**:
1. `VITE_FEATURE_*` env vars → `src/shared/config/features.ts` — **baked at
   build time**. Flipping a module on/off requires editing `.dev.vars`/CI env
   and redeploying. Drives sidebar + routes.
2. The DB-backed `feature-flags` module — **runtime**, admin CRUD, public +
   admin endpoints… and **wired to nothing**. No UI reads it for module
   visibility.

Gap: an admin can't turn a module on/off from the dashboard. Proposed shape:
keep `VITE_FEATURE_*` as the *compile-time floor* (code-splitting, security
— server routes for a disabled module can 404), and let the DB flags module
provide *runtime overrides within the built set*: `features.ts` consults a
tiny `/api/features` fetch (cached, defaulting to build values on failure),
admin UI gets toggles. One contract, no drift: a module is visible iff
`buildFlag && runtimeFlag`. Also gives forks kill-switches (flip off a
misbehaving AI feature without a deploy) and per-plan gating later.

## Part 3 — Shipping recommendation

Organising principle: **#110 (wiki/ops-dashboard fork) is the next fork
target and it gates on three items** — those get built first so the fork
inherits them free. Everything else ranks by (value to every fork) ÷ cost.

### Tier 1 — ship now (~3 sessions)

| # | What | Anchors | Shape |
|---|---|---|---|
| 1 | **Kanban board primitive** | #62.1, gates #110 | dnd-kit core 6.x + fractional-indexing; ReUI Base UI reference; keyboard DnD + move-to menu; agent provenance badges; cards/columns on entities module; `board_*` chat tools |
| 2 | **Global entity search** | #62.5, gates #110 | Unified `search_documents` + FTS5; `indexForSearch()` helper; command-palette upgrade (groups, recents, AI-ask row); `/dashboard/search` |
| 3 | **D1 mirror pattern** | #90, gates #110 | cron → Workflow → D1 batched sync + `POST /refresh` + syncedAt; reference module + docs |
| 4 | **Formats batch** | ecosystem | AGENTS.md (compact, pointers) + DESIGN.md (Kumo tokens, Google Labs spec) + generated `/llms.txt` route (Lighthouse Agentic Browsing) + `type:` frontmatter in knowledge module (OKF-align). One session, huge legibility win |
| 5 | **Backups** | user-named gap | Daily Workflow: D1 export API → R2 (official CF pattern) + retention pruning + `docs/BACKUPS.md` restore runbook + GDPR takeout upgrade (R2 manifest, expiring link) |
| 6 | **better-auth batch** | user-named | Bump 1.6.23; **rate-limit storage → database** (in-memory is per-isolate-broken on Workers); passkeys; magic links (email registry exists); admin plugin (ban + impersonation) |

### Tier 2 — next cycle

| # | What | Anchors | Notes |
|---|---|---|---|
| 7 | **WorkspacePanel + artifacts surface** | #40 workspace pane | One contract: Activity / Files / Artifact tabs on the chat page; artifacts = typed versioned docs, publish→R2. Unifies sandbox outputs + files + batch progress |
| 8 | **MCP Apps host** | ecosystem | Upgrade MCP-UI rendering to the official extension; demo `ui://` on ScratchpadMcpAgent. **Wait for the 2026-07-28 spec final**, then build |
| 9 | **Wiki primitive** | #110 content model | Evolve knowledge module: slug + backlinks + versions + propose-edit via config-diff + staleness routine |
| 10 | **Feature-flag unification** | user-named | Runtime DB flags as overrides within the build-time floor; admin toggles; kill-switch story |
| 11 | **Security batch** | #95 | Re-verify checklist first (≥1 item already stale), then the quick items + design items in one PR-#94-style session |

### Tier 3 — cheap pattern/docs batch (½ session)

#77 read-only SQL tool (isolated D1) · #89 domain-scoped search tool ·
#83/#84/#85 as AGENT_PLAYBOOKS/ROUTINES doc patterns (+ Inbox adopts #83).

### Deferred / watch

- **AI SDK 7** — native tool-approval policies would replace our bespoke
  approvals, but `@cloudflare/ai-chat` + agents peer-pin `ai ^6`. Write the
  watch-list doc; migrate when CF moves.
- **better-auth 1.7** (RC) — OIDC plugin deleted, MCP plugin split; wait for
  1.7.1+. The MCP auth plugin specifically: churn guaranteed, defer.
- **#62.2-4** custom fields / time entries / share tokens — until a fork
  demands them (none of the current fork targets do).
- **Artifact runtime capabilities** (MCP-in-artifact) — design manifest only.
- **Org teams + dynamic AC / device-authorization plugin** — nice, additive,
  not gating anything.
- **#36** workerd decorators (upstream), **#35** AgentMemory (still private
  beta).

### Housekeeping (needs Jez approval — classifier blocks agent issue-closes)

- Close #105, #106, #107, #108 (shipped in PR #104), #93 (fixed on main),
  #99 (superseded by v2.0.0 currency pass).
- Tick the stale #95 checkbox (admin emailVerified — verified fixed).
- Comment research pointers onto #62 + #110.

