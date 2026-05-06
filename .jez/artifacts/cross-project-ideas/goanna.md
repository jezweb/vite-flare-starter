# Goanna Patterns for vite-flare-starter

Cross-project scan of goanna (filesystem-markdown agent framework) for novel patterns vite-flare-starter could adopt. Status: NOT yet ported to vite-flare-starter's D1/Durable Objects architecture.

---

## 1. Durable Question/Ask Tracking (asks.md)

**Pattern**: Agent-scoped durable file for questions owed-to or owed-from user/peers.

**File**: `/Users/jez/Documents/goanna/boss/asks.md`, `/Users/jez/Documents/goanna/worker/asks.md`

**What it solves**: Open asks survive session compaction (unlike in-context memory); distinct from external issue trackers or transient comms. Agent writes OPEN/CLOSED entries with dates, avoids re-deriving the same question.

**Why it matters**: Autonomous agents in vite-flare-starter run across contexts; asks.md is the Goanna answer to "what did I promise to figure out?" Cross-session. Promotion path: OPEN → conversation draft → CLOSED → Resolved section (archaeology).

**Effort**: Small — new entity type in existing entities table, or lightweight memory store. Could store per-agent in `agent_runs` metadata or new `agent_asks` table.

---

## 2. Durable Task Commitments (tasks.md)

**Pattern**: Agent's own time-bounded deliverable log, distinct from external trackers; survives compaction.

**File**: `/Users/jez/Documents/goanna/boss/tasks.md`, `/Users/jez/Documents/goanna/worker/tasks.md`

**What it solves**: When an agent commits to "deliver X by Friday," that commitment lives locally and survives session breaks. Format: OPEN/CLOSED with due dates, move to Resolved section >14 days. Anti-pattern avoided: "my task is in Jira, but I forgot what I promised in this session."

**Why it matters**: Routine agents in vite-flare-starter run autonomously on schedule; tasks.md gives them durable "what did I commit?" state without wiring to external systems.

**Effort**: Medium — add `tasks` entityType (like `findings`), or append-only agent-local memory store. Reference from agent state.

---

## 3. Session Warm-Up Procedure & Compaction Preservation

**Pattern**: Standardised multi-step warmup on session start (read persona files, comms inbox, status, findings). Explicit compaction guard list (what to preserve before runtime compaction happens).

**File**: `/Users/jez/Documents/goanna/boss/AGENTS.md` (lines 46–72), `/Users/jez/Documents/goanna/worker/AGENTS.md` (lines 46–72)

**What it solves**: Agents drift from their own files when warmup is skipped ("Hi! What would you like to do?" generic reply). Compaction guard prevents losing critical state when context window resets.

**Why it matters**: Autonomous agents in vite-flare-starter use compaction hooks already; adding explicit "what to preserve" checklist prevents silent state loss. Include: "Next" breadcrumb, in-flight task, critical user decisions, unsaved blocks.

**Effort**: Small — document in `docs/AGENTS.md` as a "before compaction" checklist, wire into AutonomousAgent.compactSession() hook.

---

## 4. Caretaker Rotating Focus Sweep (Daily + State File)

**Pattern**: Day-of-week rotating proactive scan (Mon=deps, Tue=security, Wed=codebase, Thu=platform, Fri=issues, Sat=comms, Sun=summary) with state file tracking rotation progress.

**File**: `/Users/jez/Documents/goanna/skills/caretaker/SKILL.md` (full pattern), `/Users/jez/Documents/goanna/scout/caretaker-state.md` (state tracking)

**What it solves**: Reactive-only agents drift into coasting ("monitoring continues" cycles). Caretaker is proactive outward scan, ~15–30 min, surfaces findings instead of make-work. Prevents tunnel vision on one signal source.

**Why it matters**: Routines in vite-flare-starter could use a "caretaker cadence" — each routine picks a focus area (dependencies, security, comms patterns, etc.) and runs a bounded scan. State file prevents re-scanning the same area. Output: findings emitted to `inbox_add` channel.

**Effort**: Medium — document routine pattern in `docs/ROUTINES.md`, ship a `caretaker-routine` template that cycles through focus areas, add state storage (entity or KV).

---

## 5. Reverie Cycle (Bounded Inward Consolidation)

**Pattern**: Activity-conditional (not time-scheduled) inward work when N consecutive quiet cycles occur. One task from a 8-item menu, 10–15 min, ONE artefact produced or fail honestly.

**File**: `/Users/jez/Documents/goanna/skills/reverie/SKILL.md` (full pattern)

**What it solves**: When quiet, agents choose between coasting, make-work (generic news summary), or reverie (real inward work: index refresh, finding promotion, persona notes, cross-pollination read). Bounded so it doesn't expand into deep-work.

**Why it matters**: AutonomousAgent instances run on heartbeat/schedule; when no external signal arrives, reverie gives them real work options without polling. Anti-pattern blocked: "let me summarise the latest news" (no, promote your own learnings instead).

**Effort**: Medium — implement reverie skill template, wire activity condition (N quiet cycles) into routine invocation, document in `skills/reverie/SKILL.md`.

---

## 6. Reflection Cycle (Nightly Scrub & Promotion Path)

**Pattern**: End-of-day consolidation: scrub scratch.md, write daily log, promote findings → learnings, archive stale items, update status with "Next" breadcrumb. ~5–10 min.

**File**: `/Users/jez/Documents/goanna/skills/reflect/SKILL.md` (full pattern)

**What it solves**: Prevents scratch.md from contaminating next session, establishes durable daily chronicle, finds/learnings graduation happens nightly (not ad-hoc), status.md always reflects current state + next action.

**Why it matters**: vite-flare-starter has reflect skill already, but Goanna's reflection is more structured (scrub → logs → promote → archive → status). Port the full nightly loop as a routine template.

**Effort**: Small — enhance existing `skills/reflect/SKILL.md` with full Goanna steps, wire into default routine schedule.

---

## 7. Scout: Outward Explorer Agent (4th Role)

**Pattern**: Fourth baseline agent that looks outward (environment, connectors, industry, world patterns). Layered cadence (daily internal, weekly external, monthly synthesis). Watch-table (finite list of platforms to scan). "So what" rule on every finding (not just news).

**File**: `/Users/jez/Documents/goanna/scout/AGENTS.md` (full role), `/Users/jez/Documents/goanna/scout/HEARTBEAT.md`, scout caretaker rotation

**What it solves**: Boss/worker/librarian are internally focused; scout surfaces brewing patterns before they demand reaction. Differs from worker-research (which is deep, requested); scout is exploratory, pattern-hunting, structured by watch-table.

**Why it matters**: vite-flare-starter has ResearcherAgent (close), but no Scout equivalent. Scout brings "environment scanner" discipline + watch-table (explicit list, not infinite sprawl) + "so what" rule (findings must connect to user's work, not generic news).

**Effort**: Large — new AutonomousAgent subclass, scout metadata + tools (environment scan, platform monitor, finding router), watch-table entity type, 15–30 line caretaker rotation in scout.HEARTBEAT.

---

## 8. Modes System: Reactive vs Bootstrap vs Quiet-Cycle Hygiene vs Cascade-Refresh

**Pattern**: Librarian (and other agents) explicitly choose from 4 modes based on what's waiting: Reactive (inbox, new findings), Bootstrap (thin records), Quiet-cycle (stale audit, link sweep), Cascade-refresh (schema evolution).

**File**: `/Users/jez/Documents/goanna/librarian/AGENTS.md` (lines 75–86, "Modes" section)

**What it solves**: Agents spin in low-value work (bootstrap) when high-value work (reactive) is waiting. Modes make priority explicit: check inbox first, only bootstrap when nothing's pulling at you.

**Why it matters**: Autonomous agents in vite-flare-starter could use a "mode picker" pattern — each routine explicitly declares its mode, scheduler respects priority. Anti-pattern: agent in quiet-cycle-hygiene mode skips reactive inbox.

**Effort**: Small — document in `docs/AGENTS.md`, add optional `mode` field to routine metadata, prioritise routine scheduling by mode.

---

## 9. Detection Rules: Fourth Tier (Learning → Behaviour Rule)

**Pattern**: Graduation path: findings → learnings → **den/knowledge/** → **detection rules in AGENTS.md** (when a learning changes default behaviour, not just sits in library).

**File**: `/Users/jez/Documents/goanna/librarian/AGENTS.md` (lines 109–125, "Detection rules" section)

**What it solves**: Most learnings are for reference; some should change how an agent operates (e.g. "always check both systems before declaring record missing"). Fourth tier prevents bloating AGENTS.md while capturing behaviour-shaping rules earned through real practice.

**Why it matters**: Librarian skill in vite-flare-starter could emit detection rules when a pattern holds up 2–3 times; these become inline rules in next session's system prompt or agent metadata.

**Effort**: Medium — add `detection_rule` entity type, generate inline rules into agent.systemPrompt via "on promotion" logic, document graduation path.

---

## 10. Process Improvements Log (Decision Archaeology)

**Pattern**: Append-only dated log in librarian/AGENTS.md of changes to own conventions, schemas, detection rules. Answers "wait, why does the contact schema have X?"

**File**: `/Users/jez/Documents/goanna/librarian/AGENTS.md` (lines 127–139, "Process improvements log")

**What it solves**: Schemas evolve; without a record of when/why, future-you re-debates settled decisions. Log is decision archaeology.

**Why it matters**: vite-flare-starter's entity schemas (clients, contacts, knowledge) will evolve; a process-log entry per schema change prevents re-deriving "why did we add `relationship_type`?"

**Effort**: Small — add `process_log` entries to librarian.memory blocks whenever schema changes, or use findings→learnings→knowledge discipline.

---

## 11. Pointer-Stub Pattern (Retired/Superseded Records)

**Pattern**: When a record retires/merges, don't delete; replace with pointer stub (frontmatter + redirect line). Keeps slug stable for external references.

**File**: `/Users/jez/Documents/goanna/docs/CONVENTIONS.md` (lines 91–110, "Pointer-stub pattern")

**What it solves**: External systems (tickets, emails, search indexes) accumulate slug-shaped references. Deletion breaks them silently. Pointer stub keeps lookups resolving while making canonical home obvious.

**Why it matters**: vite-flare-starter entities (clients, contacts, projects) may merge/retire. Port pointer-stub pattern into entity migration logic: don't hard-delete, create 301-redirect-style pointer.

**Effort**: Small — document in `docs/PATTERNS.md`, add optional `superseded_by` field to entities, render pointer stub on entity.view.

---

## 12. Comms Primitive: File-Backed Inbox (den/comms/<id>/{in,out,queue})

**Pattern**: Messages between agents live in folder hierarchy: `den/comms/<identity>/in/` (inbox), `out/` (audit trail), `queue/` (awaiting ACK), `archive/` (processed). Frontmatter: id, from, to, subject, date, in_reply_to, status, priority.

**File**: `/Users/jez/Documents/goanna/docs/SPEC.md` (lines 98–165, "Comms primitive")

**What it solves**: Async-by-default comms that work across runtimes. No webhook, no push, no real-time delivery. Agents read inbox at session warmup. Cross-session continuity is file-based, not session-based.

**Why it matters**: vite-flare-starter uses notifications + approvals queue. Could extend with comms-style file-backed inbox for inter-agent messaging (researcher → writer handoff, routine findings → inbox routing). Simpler than Spaces/webhooks for offline-friendly multi-agent flows.

**Effort**: Large — new entity type + file storage (or entities table), index, warmup integration, routine-to-routine routing, subject/priority filtering.

---

## 13. Umbrella Pattern: Multi-Agent Grouping (Growth Template)

**Pattern**: When 5+ agents work on related domains, group under `umbrellas/<name>/` with shared SOUL.md, manager specialist, and per-specialist file family. Manager handles cadence, curation, coaching.

**File**: `/Users/jez/Documents/goanna/docs/SPEC.md` (lines 217–246, "Umbrellas: growth pattern")

**What it solves**: Flat 4-agent baseline doesn't scale; umbrellas group specialists under shared voice without losing separation. Manager is operational steward, not routing gatekeeper.

**Why it matters**: vite-flare-starter's autonomous agents could adopt umbrella structure when >5 agents ship (e.g. creative-bundle: writer, designer, social-media specialist under shared voice). Documents growth path.

**Effort**: Large — architectural change; requires multi-agent routing, shared identity inheritance, manager HEARTBEAT pattern.

---

## 14. "So What" Rule (Findings Must Connect to User)

**Pattern**: Every finding answers "what does this mean for this user?" not just "what changed?" If you can't write a one-line "so what," the finding isn't ready.

**File**: `/Users/jez/Documents/goanna/scout/AGENTS.md` (lines 116–126, "Findings discipline: categorisation + 'so what'")

**What it solves**: Prevents news-dump findings ("Cloudflare released feature X") that aren't actionable. Forces signal/noise filter: is it relevant to *this* user's actual work?

**Why it matters**: Findings/Inbox in vite-flare-starter could enforce "so what" rule on emission — routine agents skip findings that don't connect the dots to user's context.

**Effort**: Small — add optional `impact` / `so_what` field to findings, gate inbox_add channel on non-empty.

---

## 15. Scheduled Cycles: Off-the-Mark Staggering

**Pattern**: When multiple agents run on same machine, schedule heartbeats off the `:00` minute mark (Agent A: :07, :17, :27; Agent B: :13, :43) to avoid fleet collisions and API rate-limit spikes.

**File**: `/Users/jez/Documents/goanna/docs/RHYTHMS.md` (lines 17–25, "Off-the-:00-mark scheduling")

**What it solves**: Multiple agents firing at :00 → machine grinds, API rate limits spike. Staggers load and prevents synchronized thundering herd.

**Why it matters**: vite-flare-starter runs multiple routines (reflect, caretaker, librarian-curate, etc.); scheduling them off-the-hour prevents collisions.

**Effort**: Small — document in `docs/ROUTINES.md`, add optional `minute_offset` to routine metadata, wire into scheduler.

---

## 16. Findings Categories & Indexing (_index.md)

**Pattern**: `findings/` and `learnings/` folders each have `_index.md` (top ~20 active items). Findings categorised: insight, idea, flag, observation. Learnings tracked with status (active, superseded, archived).

**File**: `/Users/jez/Documents/goanna/docs/RHYTHMS.md` (lines 162–194, "File hygiene"), `/Users/jez/Documents/goanna/docs/CONVENTIONS.md` (lines 252–272, "Index files")

**What it solves**: Folders with 100+ findings/learnings become unreadable. Curated index + status fields keep active items scannable; old items move to archive.

**Why it matters**: vite-flare-starter already has findings + learnings; port the status (open, promoted, resolved, dismissed) and index-curation discipline into findings routine.

**Effort**: Small — add `status` field to findings entity, _index.md template, archive logic in reflect skill.

---

## 17. Warm-Up Self-Check: Anti-Drift Pattern

**Pattern**: Explicit fallback clause: "if you find yourself replying with a generic 'Hi! What would you like to do?' without reading your files — STOP, restart with warmup."

**File**: `/Users/jez/Documents/goanna/boss/AGENTS.md` (lines 60–62), `/Users/jez/Documents/goanna/worker/AGENTS.md` (lines 60–62)

**What it solves**: LLM agents naturally default to generic responses when not grounded in context. Explicit self-check forces fallback: did I actually read my files?

**Why it matters**: Autonomous agents in vite-flare-starter could add this self-check to their system prompt: "If you haven't read your persona blocks and memory, STOP and restart warm-up."

**Effort**: Small — add fallback clause to agent system prompt, document in `docs/AGENTS.md`.

---

## 18. Playground/Speculation Mode in Quiet Cycles

**Pattern**: When quiet cycles produce no useful work, agent can "Try a new approach to a recurring problem on a low-stakes task, time-boxed, no commitment" (quiet-cycle hierarchy level 7).

**File**: `/Users/jez/Documents/goanna/docs/RHYTHMS.md` (lines 27–44, "Quiet-cycle hierarchy")

**What it solves**: Agents avoid both coasting ("nothing happened") and make-work (generating noise). Speculation is real work if bounded and low-stakes.

**Why it matters**: Routines in vite-flare-starter could explicitly allow "test a new approach" as a quiet-cycle output alongside findings; encourages experimentation without commitment.

**Effort**: Small — document in `docs/ROUTINES.md` quiet-cycle options, add optional `experimental: true` flag to findings.

---

## 19. Watch-Table Pattern (Scout's Finite Scope)

**Pattern**: Scout maintains a table of "Platform | What | Why" (explicit list of what to watch, not infinite sprawl). Edit-on-discovery when a new platform matters; remove when it falls off radar.

**File**: `/Users/jez/Documents/goanna/scout/AGENTS.md` (lines 94–113, "Watch-table")

**What it solves**: Explorers without bounded scope drift into infinite news-monitoring. Watch-table is the finite list discipline; edit it, don't freestyle.

**Why it matters**: If vite-flare-starter ships Scout role, watch-table prevents agent from monitoring every SaaS changelog. Limit to platforms user actually depends on.

**Effort**: Small — watch-table entity type, render in scout's HEARTBEAT, document edit-on-discovery discipline.

---

## 20. Cross-Agent Cross-Pollination (Reverie & Librarian)

**Pattern**: Agents read sibling agents' `findings/_index.md` (cross-pollination) and `learnings/` (curation). Librarian's warmup explicitly includes scanning boss/worker/scout findings before responding.

**File**: `/Users/jez/Documents/goanna/librarian/AGENTS.md` (lines 57–58 warmup step 5), `/Users/jez/Documents/goanna/skills/reverie/SKILL.md` (lines 36, cross-pollination task)

**What it solves**: Agents work in silos without surfacing patterns that'd benefit peers. Cross-pollination + librarian curation turn scattered findings into shared knowledge.

**Why it matters**: vite-flare-starter routines could include "read peer findings, surface cross-pollinations" as a quiet-cycle task or reverie option.

**Effort**: Small — add cross-pollination warmup step to routine agents, cross-agent findings read, comms routing.

---

## Summary: Ranked by Adoption Priority

| Rank | Pattern | Effort | Why First |
|------|---------|--------|-----------|
| 1 | Durable asks.md + tasks.md (findings 1–2) | Small | Closes "surviving session compaction" gap, builds on existing findings/learnings |
| 2 | Caretaker rotation + state file (finding 4) | Medium | Prevents agent coasting; highest-leverage single addition per Goanna CHANGELOG v0.2.11 |
| 3 | Warmup + compaction guard checklist (finding 3) | Small | Explicit discipline prevents silent state loss |
| 4 | Reverie cycle skill (finding 5) | Medium | Pairs with caretaker; "what to do when quiet" |
| 5 | Reflection cycle enhancements (finding 6) | Small | Existing skill, enhance with full Goanna steps |
| 6 | Modes system (finding 8) | Small | Prioritise routine scheduling (reactive > bootstrap) |
| 7 | Findings status + indexing (finding 16) | Small | Keeps findings folder scannable |
| 8 | Scout agent (finding 7) | Large | Growth pattern; invest after core 6 items ship |
| 9 | Umbrella pattern (finding 13) | Large | Growth pattern; long-term architecture |
| 10 | Comms primitive (finding 12) | Large | Optional; useful for complex multi-agent flows |

---

## What's Already Ported

- ✅ findings/learnings (entities table)
- ✅ reflect skill (exists, can enhance)
- ✅ librarian-curate skill
- ✅ persona blocks (soul, identity, user, memory, style → state.blocks)
- ✅ knowledge concept pages (den/knowledge → entities)
- ✅ Routines + scheduled agents

## What's NOT Yet Ported

- ❌ asks.md, tasks.md (durable question/task logs)
- ❌ Caretaker rotation (proactive daily sweep + state file)
- ❌ Reverie cycle (bounded inward work on quiet cycles)
- ❌ Scout role (4th baseline agent)
- ❌ Warmup + compaction preservation checklist
- ❌ Modes system (Reactive > Bootstrap > Hygiene > Cascade)
- ❌ Detection rules (behaviour-shaping learnings)
- ❌ Comms primitive (file-backed inter-agent inbox)
- ❌ Umbrella pattern (5+ agents under shared identity)
- ❌ Watch-table discipline (Scout's finite scope list)
- ❌ "So what" rule enforcement (findings must connect to user)

---

## High-Value Entry Points

**Immediate (1–2 weeks)**:
- Add asks.md + tasks.md entity types
- Document warmup + compaction checklist in AGENTS.md
- Enhance reflect skill with full Goanna steps

**Medium-term (3–4 weeks)**:
- Implement caretaker routine template + state storage
- Ship reverie skill
- Add findings status + indexing

**Long-term (2–3 months)**:
- Scout agent (if use case warrants explorer role)
- Modes system for routine scheduling
- Comms primitive (if inter-agent flows need it)

