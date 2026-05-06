---
date: 2026-05-06
status: synthesis (after 4 parallel agent scans)
sources:
  - .jez/artifacts/cross-project-ideas/goanna.md (20 findings)
  - .jez/artifacts/cross-project-ideas/rightcover.md (16 findings)
  - .jez/artifacts/cross-project-ideas/kindling.md (21 findings)
  - .jez/artifacts/cross-project-ideas/crosbe-ai.md (10 findings)
owner: jez+claude
---

# Cross-project synthesis — what's worth porting back

Four parallel scans of sibling projects produced 67 raw findings.
After cross-checking against vite-flare-starter's current state
(many were ported THIS session), this is the filtered + ranked list.

## What's already in vite-flare-starter (skip)

The big ones agents flagged that we already have:

| Finding from… | Status here |
|---|---|
| RightCover: auto_load skills | ✅ Shipped today as `always_active: true` |
| RightCover: AdminAgent + admin-tools | ✅ Already in CLAUDE.md modules table |
| RightCover: agent-instances API | ✅ Exists at `/api/agent-instances` |
| RightCover: delegate_batch parallel fan-out | ✅ Shipped today as `start_batch_task` (Cloudflare Workflows) |
| RightCover: Test-Auth module | ✅ `src/server/modules/test-auth/` (with cascade-delete safeguards documented) |
| RightCover: Artifact tools | ✅ `chat/tools/artifacts.ts` |
| Crosbe-AI: R2 data lake | ✅ `DATA_LAKE` binding + `truncate-tool-result.ts` |
| Crosbe-AI: Anthropic prompt caching | ✅ Wired in `chat-agent.ts:796-797` |
| Crosbe-AI: Haiku history summarisation | ✅ `trim-history.ts` does this |
| Crosbe-AI: Cron handler | ✅ Wrangler triggers + `scheduled()` in `server/index.ts` |
| Kindling: AI SDK Standards Phase 0 (ToolDefinition) | ✅ Already done |
| Kindling: Defence-in-depth auth allowlist | ✅ `~/.claude/rules/client-deployment-allowlist.md` matches |
| Kindling: Trusted origins parser | ✅ Already done |
| Goanna: findings/learnings + reflect/librarian skills | ✅ Bundled |
| Goanna: persona blocks | ✅ AutonomousAgent has them |
| Goanna: routines (per-agent scheduled work) | ✅ Routines module |

That covers ~25 of the 67 findings. The remaining ~40 break down into
what's genuinely new and what's project-specific to the source.

## Tier A — high novelty, small effort, generalisable (ship soon)

### A1. Image EXIF stripping (kindling)

**Why**: privacy gap. EXIF GPS leaks home addresses + client sites for
any fork accepting user photo uploads. Pure byte-walk JPEG marker
chain — Workers-native, no deps, ~50 lines.

**Where**: `kindling/src/server/modules/hopper/strip-exif.ts`

**Effort**: 30 min. Lift the file as-is, wire into `files/routes.ts`
upload pipeline behind a config flag (`STRIP_IMAGE_METADATA=true`
default).

**Generalisability**: 10/10 — any user-upload feature.

### A2. OG metadata scraper (kindling)

**Why**: any link-saving feature (chat attachments, hopper-style
intake, documents) gets metadata-rich cards instead of bare URLs.
HTMLRewriter-based, 10s timeout, returns null on non-HTML — clean
contract.

**Where**: `kindling/src/server/modules/hopper/og-scraper.ts`

**Effort**: 30 min. Drop in as `src/server/lib/og-scraper.ts`. Used by
chat attachments + any future inbox.

**Generalisability**: 9/10.

### A3. asks.md / tasks.md per-agent durable logs (goanna)

**Why**: AutonomousAgent today has memory blocks + Vectorize recall,
but no durable answer to *"what did I ask the user?"* / *"what did I
commit to ship by Friday?"*. These survive session compaction without
external trackers. Agents in vite-flare-starter could write `OPEN:
ask Jez about Q3 OKRs (2026-05-06)` to a per-agent log; promote to
`CLOSED` when answered.

**Where**: `goanna/boss/asks.md`, `goanna/boss/tasks.md` (markdown
contracts, not code)

**Effort**: small. Add `agent_asks` + `agent_tasks` entity types (or
new tables); two tools (`record_ask` / `close_ask`, `record_task` /
`close_task`); auto-inject open items into next-turn system prompt.

**Generalisability**: 9/10 — applies to any long-running autonomous
agent. Pairs naturally with the existing approvals queue.

### A4. Worker→Reviewer placeholder + verdict-format (kindling/goanna)

Already shipped today as `with_review`. **What's left**: domain-
specific reviewer skills. A handful of bundled reviewers would help
forks pick the pattern up:

- `review-email-tone` — for outbound messages
- `review-code-security` — for code generation
- `review-summary-faithfulness` — for batch-task summaries
- `review-marketing-copy` — for content output

**Effort**: ~1h per skill (markdown only).

**Generalisability**: 8/10 — every fork has different quality bars.

## Tier B — high novelty, medium effort, generalisable

### B1. Caretaker rotating focus sweep (goanna)

**Why**: Routines today fire at fixed cadence with fixed input. The
caretaker pattern adds *day-of-week rotation* (Mon=deps, Tue=security,
Wed=codebase…) with a state file tracking rotation progress. Solves
"agent coasts on the same signal forever" by forcing breadth.

**Where**: `goanna/skills/caretaker/SKILL.md` + `scout/caretaker-state.md`

**Effort**: medium (~3h). Ship as a Routine *template* + a
`caretaker-state` entity type. Existing routines opt in by setting
`focus_rotation: 'daily'`.

**Generalisability**: 7/10 — clearest fit for "watch many things
loosely" use cases.

### B2. Reverie cycle (goanna)

**Why**: when there's no external signal, agents either coast or
manufacture make-work ("here's a summary of the latest news"). Reverie
gives 8 menu options for *real* inward work: index refresh, finding
promotion, cross-pollination read, persona note. Bounded to 10-15
minutes. Always produces ONE artefact or fails honestly.

**Where**: `goanna/skills/reverie/SKILL.md`

**Effort**: medium (~2h). New SKILL.md with the 8-item menu; routine
template with activity-condition (N quiet cycles).

**Generalisability**: 6/10 — only matters once routines run unattended
for weeks.

### B3. Hopper module — multi-type content intake (kindling)

**Why**: a unified "here's stuff worth keeping" inbox accepting text,
links, photos, audio, files. Not Kindling-specific despite the name —
it's a primitive any "collect → process → produce" workflow could
build on. Pairs naturally with batch-tasks (input collection → swarm
process → curated output).

**Where**: `kindling/src/server/modules/hopper/`

**Effort**: medium (~1-2 sessions). Schema, routes, intake validation,
filter UI. Hopper enrichment (OG scrape on links, EXIF strip on
photos, transcript on YouTube) layers on top.

**Generalisability**: 7/10. Clearest as a *pattern* documented in
PATTERNS.md even if forks don't adopt the module wholesale.

### B4. Compaction guard checklist (goanna)

**Why**: AutonomousAgent already has compaction hooks. What's missing
is an explicit "preserve before compact" checklist — *"in-flight task,
unsaved blocks, current `Next` breadcrumb, critical user decisions"*.
Without it, compaction silently drops state.

**Where**: `goanna/boss/AGENTS.md:46-72`

**Effort**: small (~1h). Document checklist in `docs/AGENTS.md`; wire
into `AutonomousAgent.compactSession()` to emit a structured
preservation report before compacting.

**Generalisability**: 8/10.

### B5. Cloudflare Email Routing inbound handler (rightcover)

**Why**: vite-flare-starter has `docs/ADDING_EMAIL_INBOUND.md` (doc
only — instructions, not implementation). RightCover has the *real
shipping* pattern: postal-mime parses message → R2 stores attachments
→ `inbound_emails` row in pending state → routine processes async.
Handler stays under 1s; heavy lifting decouples cleanly.

**Where**: `rightcover/src/server/modules/insurance/lib/email-handler.ts`

**Effort**: medium (~3h). Generalised version drops in as
`src/server/modules/email-inbound/` with the `inbound_emails` table.
Forks customise the routine that drains it.

**Generalisability**: 7/10 (any fork ingesting external email — feature-
flagged off by default).

## Tier C — verify-then-decide (close gaps you might already have)

### C1. Static/dynamic system prompt SPLIT (crosbe-ai)

We have Anthropic prompt caching enabled (`chat-agent.ts:796-797`).
Question: does the system prompt have a clean *static-baseline +
dynamic-context* split, or is it one big block where the cache key
churns on every turn (current date, user name, etc)?

**Verify**: log `system` field length + first 100 chars across 3 turns
of the same conversation. If length changes turn-to-turn, the cache
isn't actually hitting.

**Effort to fix if broken**: ~1h. Move date/timezone/user-name to a
*separate* user-message preamble; keep the system prompt static.

### C2. Per-tool telemetry table (kindling Phase B)

Audit (`chat-tools-audit-2026-05-06.md`) flagged that we don't have
per-tool usage stats. Kindling has `ai_tool_calls` D1 table populated
via `onStepFinish`. Surfaces in admin panel.

**Effort**: ~2h. New `ai_tool_calls` table + `onStepFinish` hook +
admin observability page. Validates Phase A+B activation rates.

### C3. Sources footer / citations UX (kindling Phase C)

Audit flagged this as already in vite-flare-starter (CLAUDE.md says
"sources footer (claude.ai-style citation strip)") — verify the
`SourcesFooter` aggregates from web_search / browser tools properly.
If yes, skip; if partial, port the kindling shape.

## Tier D — defer (interesting but no clear ROI yet)

### D1. Scout 4th role agent + watch-table (goanna)

A "look outward" agent role distinct from boss/worker/librarian. Has a
finite watch-table (don't scan infinite sources), layered cadence
(daily internal, weekly external), and a "so what" rule (every finding
must connect to user's work, not be generic news).

**Why defer**: vite-flare-starter has `ResearcherAgent` which is the
*requested* explorer. Scout is the *self-directed* explorer. Adding it
costs a new agent class + watch-table primitive + cadence machinery.
Worth ~1 day of work, but only when "I want my agent to surface
brewing patterns I haven't asked about" is a real need.

### D2. Buddy voice companion DO (kindling)

Stateful voice agent with persona + WebSocket streaming + Aura 2 TTS +
walkthrough mode. We have `VoiceInputExample` as the primitive. Buddy
is the product-shaped version. Worth building when voice becomes a
first-class fork target — not now.

### D3. RBAC at tool execution level + table-prefix gates (crosbe-ai)

For multi-tenant data isolation. Useful when a fork exposes raw SQL
to the agent (crosbe-ai's case via Hyperdrive/Postgres). Less relevant
when forks use scoped tools (`gmail_search` only sees user's Gmail
because the OAuth token is per-user). Defer until a fork actually
needs it.

### D4. YouTube transcript extractor (kindling)

Small util, optional Gemini API call. Useful only when a fork has
links + wants to process video content. Keep for the day Hopper or
similar lands.

## Recommended order if you wanted to ship anything

If the energy's there for one more session:

**The "30-minute privacy + 1-hour discipline" pack** —
- A1 (EXIF strip) ~30min
- A2 (OG scraper) ~30min
- A4 (3-4 reviewer skills) ~3h

That's a small-to-medium session that ships real privacy hardening +
several reusable utilities + makes `with_review` more out-of-the-box
useful. Doesn't introduce new modules; all additive.

**The "agent durability" pack** (better for a session focused on
autonomous agent quality) —
- A3 (asks.md/tasks.md durable logs)
- B4 (compaction guard checklist)

Together these solve the "what did I commit to / what did I ask?"
problem that becomes painful once routines have been running for
weeks.

**The "audit follow-through" pack** (cheap risk reduction) —
- C1 (verify static/dynamic prompt split, fix if broken)
- C2 (per-tool telemetry — closes audit gap #6)

## Genuinely interesting non-actionable observations

- Goanna's "**so what**" rule for findings (every finding must connect
  to the user's work, not be generic news) is the same lesson as
  Phase B description discipline ("Use when…" not "this skill does X").
  Both are about forcing concrete utility over vague enumeration.

- RightCover and Kindling are both vite-flare-starter forks but the
  patterns they discovered are nearly disjoint — RightCover hardened
  agent admin / batch fan-out / test-auth; Kindling built content
  intake / voice agents / utilities. Suggests forks discover patterns
  along their *product axis*, not the framework axis. The starter
  benefits most from harvesting *both* ends.

- Crosbe-AI's "schema docs in same module as tool definitions" is a
  variant of the one-file ToolDefinition rule we already enforce. The
  cross-application: when a tool reads a schema (D1 table, MCP
  resource, agent state), keep the schema description AS the tool's
  description. Single source of truth.

- Goanna's whole agent-discipline layer (asks/tasks/warmup/compaction-
  guard/reflect/reverie/caretaker/scout) is essentially a *layer above*
  AutonomousAgent. The interesting question: should this become a
  "Goanna mixin" (`extends GoannaAgent`) that any AutonomousAgent
  subclass can adopt, or should each pattern be opt-in piecemeal?
  Current `~/.claude/rules/trust-skills-not-elaborate-code.md` would
  argue piecemeal — agents inherit the pattern via skills, not via
  framework subclassing.
