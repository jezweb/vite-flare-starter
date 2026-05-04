---
date: 2026-05-04
status: active
owner: jez+claude
related:
  - ~/Documents/goanna/SPEC.md
  - ~/Documents/goanna/CONVENTIONS.md
  - ~/Documents/goanna/SKILLS.md
  - docs/ROUTINES.md
  - docs/AGENTS.md
slice_status:
  slice_0_timezone: shipped (commit bbe5f34)
  slice_1_persona_blocks: shipped (commit 26e92cb)
  slice_2_findings_learnings: shipped (commit 0e8853d)
  slice_3_reflect_skill: shipped (commit 86d8de7)
  slice_4_librarian_skill: shipped (commit 719b121)
  slice_5_convention_docs: shipped (commit pending)
---

# Goanna adoption plan — vite-flare-starter

Cherry-pick goanna's primitives that vite-flare-starter doesn't have a direct equivalent for, without trying to mirror its filesystem-shape storage. Skills + Routines + entities are the existing primitives; this plan layers convention on top.

## Decisions locked

| # | Question | Answer |
|---|---|---|
| 1 | Persona structure | Conventional `blocks` names: `soul`, `style`, `identity`, `user`, `memory`. No schema change. |
| 2 | Storage for findings/learnings | Entities module — new types `finding` and `learning`. |
| 3 | Scope | Agent-owned (`agentClass` + `agentName` on the row), user-readable across agents. UI default view aggregates. |
| 4 | Promotion mechanics | Two-stage. Finding `status: open → recurred → promoted`. Promotion creates a new `learning` row with `sourceFindingId`; original finding flips to `status: promoted`. |
| 5 | Reflect cadence | Per-agent routine. Seeded for `AssistantAgent` only on new install; users can add reflect routines to any agent they spin up. UI aggregates across agents. |
| 6 | Librarian | v1 = skill (`librarian-curate`) + weekly routine targeting any agent. v2 = graduate to `LibrarianAgent` class if it earns its keep. |

### Goanna parallels (for reference)

| Goanna concept | Lands here |
|---|---|
| `<agent>/findings/` | `entities` rows where `entityType = 'finding'` + `agentName` = owning instance |
| `<agent>/learnings/` | `entities` rows where `entityType = 'learning'` + `agentName` |
| `den/knowledge/` | Existing user-scoped entity types (`note`, future `knowledge`) — NOT agent-owned |
| `<agent>/SOUL.md`, `STYLE.md`, `IDENTITY.md`, `USER.md`, `MEMORY.md` | Conventional block names in `state.blocks` |
| `<agent>/memory/YYYY-MM-DD.md` (raw daily) | `agent_runs` already covers this — no new primitive |
| `skills/<name>/SKILL.md` | Already wire-compatible — drop into `skills/` |
| Reflection cycle | Daily Routine fires the `reflect` skill on each agent |
| Coaching/curation review | Weekly Routine fires `librarian-curate` skill (v1) |
| Umbrella + manager | Maps to **orgs + librarian role** in v2; out of scope for v1 |

## Slices

Each slice ships independently. Each is its own commit. Stop at any slice if it's not earning its keep.

### Slice 0 — User timezone field (small migration)

**Goal**: surface user-local time so reflection / heartbeat routines fire at sensible local hours.

- Add `timezone: string | null` to the user table (or user-preferences table if it exists separately).
- Default to `null`; routine scheduler treats null as UTC.
- Add a Settings → Profile field (IANA timezone autocomplete, e.g. `Australia/Sydney`).
- Browser detection on first sign-in: `Intl.DateTimeFormat().resolvedOptions().timeZone` → POST to `/api/me/timezone` if user.timezone is null.

**Files touched**: better-auth user schema migration, `src/server/modules/settings/`, `src/client/modules/settings/`.

**Test**: timezone persists; routine scheduler fires at correct local time.

### Slice 1 — Persona block conventions (no schema change)

**Goal**: structured persona without a refactor.

- Document the convention: `state.blocks` slot names `soul` / `style` / `identity` / `user` / `memory` are conventional. Other names allowed alongside.
- Update `AutonomousAgent.buildSystemPrompt` to render conventional blocks in a stable order (soul first, identity, user, memory, style, then any user-defined blocks alphabetically).
- Default seed: when a new AutonomousAgent instance is created, populate `soul` and `identity` from the agent class's `static metadata` (description → identity, no soul by default — user fills via UI or skill).
- Document in `docs/AGENTS.md` § "Persona conventions" with a table mapping each block name to its purpose.

**Files touched**: `src/server/lib/agents/autonomous-agent.ts` (rendering order only), `docs/AGENTS.md`.

**Test**: existing AutonomousAgent tests still pass; new test asserts block order in system prompt.

### Slice 2 — Findings + learnings entity types

**Goal**: storage primitive for the agent's craft.

- Extend the entities module — add `finding` and `learning` to the allowed `entityType` enum.
- Schema additions (likely on existing `entities` table, `metadata` JSON column):
  - `agentClass: string` — owning agent class
  - `agentName: string` — owning agent instance name
  - `status: 'open' | 'recurred' | 'promoted' | 'dismissed' | 'resolved' | 'archived'` (findings only)
  - `sourceFindingId: string | null` (learnings only — points back to the finding)
  - `recurrenceCount: number` (incremented when same pattern surfaces again)
- New chat tools (or channel-tool variants):
  - `record_finding(body, category?, tags?)` — agent surfaces an observation
  - `promote_finding(findingId)` — librarian skill calls this; creates the learning row
  - `dismiss_finding(findingId, reason?)` — keep the audit trail
- New page: `/dashboard/findings` — combined feed across user's agents, filter by agent, status. Inline promote/dismiss controls.

**Files touched**: `src/server/modules/entities/`, `src/server/modules/chat/tools/findings.ts` (new), `src/client/modules/findings/` (new).

**Test**: tools execute correctly; promotion creates learning + flips finding status atomically.

### Slice 3 — Reflect skill + routine wiring

**Goal**: nightly distillation, per-agent.

- Port `goanna/skills/reflect/SKILL.md` (adapted — vite-flare uses entities + agent_runs, not filesystem).
  - Reads recent `agent_runs` for this agent (last 24h).
  - Reads recent findings (last 7 days) for this agent.
  - For each finding: decides recur / promote / dismiss / leave-open via `record_finding` / `promote_finding` / `dismiss_finding` tools.
  - Writes a 1-paragraph summary as the routine's `outputSummary` (SessionEnd hook output).
- Seed routine on new install: **opt-in**, not auto-seeded. `/dashboard/findings` shows a "Set up daily reflection" banner if no reflect routine exists for the user. One click creates `Reflect — AssistantAgent` daily at 22:00 user-local-time, `skillsLoaded: ['reflect']`, `toolsAllowed: ['record_finding', 'promote_finding', 'dismiss_finding', 'recall', 'fs_read']`.
- Requires user `timezone` field — added in Slice 0 below.
- Users can clone the routine for any other agent they own — registry pattern, no per-agent code.

**Files touched**: `skills/reflect/SKILL.md` (new bundled skill), `src/server/modules/routines/seed.ts` (add the seeded routine), tools from slice 2.

**Test**: routine fires, populates findings table from a synthesised recent agent_run set, writes outputSummary.

### Slice 4 — Librarian skill + weekly curation routine

**Goal**: cross-agent pattern surfacing without a new agent class.

- New bundled skill `librarian-curate`:
  - Reads recent learnings (last 30 days) across **all** the user's agents.
  - Identifies cross-cutting patterns — same gotcha across 2+ agents, same workaround discovered independently.
  - For stable cross-agent patterns: writes a shared knowledge entity (existing `note` entity type for v1; new `knowledge` type if/when v2 wants stricter shape).
  - Surfaces the digest into Inbox via `inbox_add` so the user sees what was promoted.
- Seed routine `Librarian — Weekly curation` on new install. Sundays 18:00 user-local. Targets AssistantAgent. `skillsLoaded: ['librarian-curate']`, `toolsAllowed: ['list_entities', 'create_entity', 'inbox_add']`.

**Files touched**: `skills/librarian-curate/SKILL.md`, `src/server/modules/routines/seed.ts`.

**Test**: routine fires, promotes a synthesised cross-agent pattern into a shared entity, posts an Inbox summary.

### Slice 5 (optional) — Page-shape convention docs

**Goal**: lift goanna's `CONVENTIONS.md` page shapes into vite-flare-starter docs.

- New doc `docs/ENTITY_CONVENTIONS.md` — frontmatter + body sections for entity types (entity, concept, procedure, investigation, project, task, decision, finding, learning).
- Cross-link from `CLAUDE.md` "Where to find things" table.
- Pure documentation, no code change. Can be written any time.

## Deferred to v2 (don't build now)

- **LibrarianAgent class** — only if v1 librarian skill earns its keep over weeks of dogfooding.
- **Org-scoped (umbrella-equivalent) curation** — librarian curates across an org's members' agents. Needs the existing orgs primitive extended with shared knowledge tables.
- **Goanna folder import/export** — `pnpm goanna:import ~/goanna` / `pnpm goanna:export`. Useful for portability but only worth building once goanna's spec stabilises.
- **Reflect via D1 FTS5 search over learnings** — speeds up promotion decisions when a user has 1000+ findings. Not needed at v1 scale.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Findings/learnings tables stay empty (agents don't actually `record_finding`) | Bundled skills (`reflect`, `librarian-curate`) instruct the agent to do it. Start with a system prompt nudge. |
| Per-agent reflect routines overwhelm Workers AI quota for users with many agents | Seed only AssistantAgent reflect on new install. Users opt in for others. Budget gate on each routine's agent prevents runaway cost. |
| Promotion mechanics feel mechanical / spammy ("everything graduates") | Anti-pattern reminders baked into reflect skill body. Goanna's anti-patterns ("most days the lesson is 'things went normally'") port over. |
| Librarian skill writes too many shared entities, polluting user's notes | v1 quietly prefixes promoted entities with `[Librarian]` and tags them so they're filterable. v2 considers a dedicated `knowledge` entity type. |

## Estimated effort (Claude-Code time, not human-time)

| Slice | Estimate |
|---|---|
| 1 — Persona conventions | 30-60 min |
| 2 — Findings/learnings entities + tools + page | 2-3 hours |
| 3 — Reflect skill + routine seed | 1-2 hours |
| 4 — Librarian skill + routine seed | 1-2 hours |
| 5 — Convention docs | 30 min |

Total ~5-9 hours. Each slice is shippable on its own; pause anywhere.

## Bridge stays open

The skills primitive (`SKILL.md` agentskills.io spec) keeps both projects wire-compatible. A user running goanna on filesystem AND vite-flare-starter on Workers can drop the same `SKILL.md` in both and have it work. That's the bridge — preserve it.

If goanna's conventions stabilise to v1.0 and the user wants `goanna-flare` (filesystem-portable cloud version), Slice 2's storage shape is the seam. The entity rows already have everything needed to round-trip to/from a goanna folder.
