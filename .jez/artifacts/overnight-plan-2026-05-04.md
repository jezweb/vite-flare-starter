---
date: 2026-05-04
status: draft (awaiting Jez go-ahead)
owner: jez+claude
purpose: comprehensive overnight execution plan — runs slice 6 (timezone wiring), four GH issue fixes, then four full ux-audit passes. Self-contained, doesn't stop until done.
estimated_duration: 6-10 hours of session-time (most spent in the audit loop)
---

# Overnight execution plan — 2026-05-04

## Scope

Three workstreams, in order:

1. **Slice 6** — finish the goanna pipeline by wiring `getUserTimezone` + `localHourFor` into the routine scheduler so reflect actually fires at user-local-22:00
2. **GH issue work** — close out the actionable subset of open issues
3. **UX audit** — four passes (different personas + exhaustive stress) using the `dev-tools:ux-audit` skill, fix-and-verify any Critical/High findings inline

After Workstream 3 finishes, do one round of **Workstream 4 — fix-and-verify** for findings, then push to origin.

## Live URL + auth setup

- Live: `https://vite-flare-starter.webfonts.workers.dev/`
- Auth: use **test-auth cookies** (already wired per CLAUDE.md), NOT Chrome MCP. Reasons: Jez asleep, Chrome session may not be persistent overnight, headless Playwright with cookies is reliable + reproducible.

## Workstream 1 — Slice 6 (local-hour cadence)

### What

The routine scheduler currently fires routines at `baseInterval` regardless of user-local clock. Reflect-daily wants 22:00 user-local. Slice 0 added the timezone field + helper; this wires it through.

### Changes

| File | Change |
|---|---|
| `src/server/modules/routines/db/schema.ts` | Add `localFireHour: integer | null` to routines (0-23, null = fire at any hour respecting baseInterval) |
| `src/server/modules/routines/scheduler.ts` | In `processDueRoutines`, for each due routine with `localFireHour` set, call `getUserTimezone(env.DB, userId)` + `localHourFor(tz)`. Skip the fire if current local hour ≠ configured hour. |
| `src/server/modules/routines/storage.ts` | Pass `localFireHour` through CreateRoutineInput |
| `src/server/modules/routines/routes.ts` | Accept `localFireHour` in CreateSchema + PatchSchema |
| `src/shared/config/routine-templates.ts` | Add `localFireHour: 22` to `reflect-daily`, `localFireHour: 18` (Sunday) to `librarian-weekly` (note: needs day-of-week too, defer to Slice 7 if cron-style not supported yet) |
| `drizzle/<next-num>_local_fire_hour.sql` | Migration: `ALTER TABLE routines ADD COLUMN local_fire_hour INTEGER` |
| `tests/server/users/timezone.test.ts` | Add cases for routines logic — given UTC time + tz + localFireHour, should-fire returns true|false |

### Acceptance

- Migration applies clean to local + remote
- Type-check + build pass
- Test suite: 88 + 4 new = 92 passing
- A reflect routine with `localFireHour: 22` only fires when `localHourFor(user.timezone)` returns 22

### Estimated time

30-60 min.

### If this fails

Slice 6 is independent — failure rolls back cleanly with `git revert`. Continue to Workstream 2 even if 6 doesn't land.

## Workstream 2 — GH issue work

### Selected issues (in priority order)

#### Issue #43 — Spaces canonical plan (close as already-shipped)

Spaces shipped per CLAUDE.md. Just verify code matches the issue's Phase 1 acceptance + close with a comment summarising what's in vs deferred.

5 min.

#### Issue #52 — TanStack Virtual for long lists (Phase 1)

Wire `@tanstack/react-virtual` into:
1. Chat message list
2. Activity log table

Per the issue: spike `use-stick-to-bottom` interaction first.

Files to touch:
- `package.json` — add `@tanstack/react-virtual`
- `src/client/modules/chat/components/MessageList.tsx` (or wherever it lives) — wrap with virtualizer
- `src/client/modules/activity/pages/ActivityLogPage.tsx` — virtualise the table

Acceptance: chat with 500+ messages scrolls smoothly, activity log with 1000+ rows scrolls smoothly. Use the seed-helper-or-real-data approach.

2-3 hrs.

#### Issue #62 item 1 — Reusable Kanban Board component

`dnd-kit` is already a dep. Build `<KanbanBoard columns cards onCardMove>` in `src/components/ui/kanban.tsx` with slot pattern for card renderer, column collapse, optimistic reorder.

Pair with a single demo route at `/dashboard/kanban-demo` (feature-flagged off by default) that uses `entities` rows with a `column` field as the data source. Demo proves the primitive works without committing to a domain module.

2-3 hrs.

#### Issue #62 item 5 — Wire FTS5 to entities for global search

Extend the existing `src/server/lib/search/fts.ts` to index entities by `title` + `JSON_EXTRACT(fields, '$.body')`. New SQL trigger keeps the FTS table in sync. Surface in the existing CommandPalette as a "search content" mode.

1.5-2 hrs.

### Skipped (and why)

| Issue | Reason for skipping |
|---|---|
| #34 — Refactor chat onto AIChatAgent | Too big for overnight; high regression risk on chat module |
| #35 — AgentMemory binding | Waiting on Cloudflare GA |
| #36 — workerd parser | Upstream blocker |
| #40 — Roadmap menu | Not actionable as-is; pick individual items if relevant |
| #62 item 2 — Custom fields + dynamic forms | Real schema change + form renderer; warrants its own session |
| #62 item 3 — Time entries | Domain feature, not platform polish |
| #62 item 4 — Share tokens | Security-sensitive; not to ship overnight without review |
| #63 — Coaching/advisor fork | Separate project; planning doc only |

## Workstream 3 — UX audit (multiple passes)

### Persona setup (mandatory pre-flight)

Write three persona files BEFORE starting the audit so it never stops to ask:

- `.jez/audit-personas/first-time-user.md` — someone signing in fresh, no prior context
- `.jez/audit-personas/jez-power.md` — Jez himself (the "returning user" lens; uses goanna integration)
- `.jez/audit-personas/sme-owner.md` — small-business owner, time-pressed, low tech comfort

### Audit-config setup

Write `.jez/audit-config.yml` with allowlist for known noise:
- Sentry breadcrumb info logs
- Better-auth probe 401 on `/api/auth/get-session` for unauthed routes
- React-DevTools console hint

### Test-auth cookies setup

Mint test-auth cookies via `POST /api/test-auth/cookies` to a state file at `.jez/audit-state/playwright-state.json`. Re-mint at start of each pass (cookies expire, audits are long).

### Pass 1 — First-time user, locked persona

Persona: `first-time-user`
Surfaces: Home → Findings → Routines → Skills → Connectors → Inbox → Spaces → Chat → Settings → Admin (where accessible)
Threads:
1. **"Set up daily reflection"** — empty Findings → CTA → routine wizard pre-filled → save → return → see scheduled
2. **"Send my first chat message"** — Home → Chat → first message → response

Expected to surface friction in slices 0-4 work that I just shipped (best feedback on this comes from a fresh-eyes audit).

### Pass 2 — Returning power user (Jez)

Persona: `jez-power`
Surfaces: same routes but with goanna-shape data — pre-seed entities (some findings, some learnings, multiple agents) so Findings page has volume
Threads:
1. **"Review last week's findings"** — Findings page filtered by status/agent
2. **"Create a routine via admin chat"** — admin chat → conversational routine creation
3. **"Cross-pollinate via librarian"** — manually fire librarian-weekly routine, watch the digest land in Inbox

### Pass 3 — Multi-pane stress (mandatory phase, exhaustive)

Per the skill: 1920 / 1440 / 1280 / 1024 / 768 / 375 with all pane combos. Pages with collapsible UI: Spaces, Chat, Inbox, Findings, Skills.

The 2026-04-29 vertical-text bug pattern (1024-1280 with 3 panes) is exactly the kind of regression this catches. Run layout-detection JS at every pane combo, screenshot, log overflow / clipping / vertical-text-stacks.

### Pass 4 — Scenario battery (10 scenarios, all of them)

Per the skill, all 10 are mandatory:
1. First Contact (covered by Pass 1)
2. Interrupted Workflow (close mid-form, refresh)
3. Wrong Turn Recovery (deliberately misclick)
4. Returning User (covered by Pass 2)
5. **Keyboard Only** — every thread keyboard-only
6. **Heavy Data** — seed 500+ entities, watch lists, search, filters
7. **Destructive Confidence** — every delete/dismiss/reject — ASK FIRST before running on prod data; use scratch entities
8. **Second User (Role)** — actually we don't have RBAC at user-level; skip with explicit note
9. **Lifecycle Position** — solo user with no agents vs. user with full goanna pipeline
10. **Round-Trip Workflow Integrity** — A→B→A flows: Findings → routine wizard → return → see new routine

### Polish phase (mandatory)

- **axe-core injection** on every audited route. Log Critical/Serious violations as hard-gate findings.
- **Performance budget** — Performance API capture on `/dashboard` and `/dashboard/findings` (representative routes). LCP/CLS/INP must be in budget (4s/0.25/500ms).
- **Visual polish sweep** — ten AI-tell categories, per-component pass.
- **Component perfection checklist** — six categories, six states.

### Real-flavour data battery (mandatory)

For every form-accepting surface (Findings record dialog, routine form, skill editor, settings, profile):
- Apostrophes (`O'Brien`)
- Accents (`Café`, `naïve`)
- Long unicode (`「日本語テキスト」`)
- RTL (`مرحبا بالعالم`)
- HTML/SQL canaries (`<script>alert(1)</script>`, `'; DROP TABLE--`) — verify escaped, not stripped silently
- Long content (5000-char paste into body fields)

### Stop conditions for audits

- Token budget — stream findings to `.jez/audit-evidence/2026-05-04/findings.md` AS I GO, not in context
- Auth-expired — re-mint cookies + restart that pass (per skill protocol)
- Genuine blocker (DB lockout, deploy down) — terminate audit, log Incomplete, surface to Jez

### Estimated time

3-5 hours of session time across the four passes + polish + real-flavour battery.

## Workstream 4 — Fix-and-verify

For every Critical or High finding from Workstreams 3:
1. Group by file/area
2. Patch
3. Re-walk just the affected slice (not the whole app) with fresh evidence
4. Update the findings file with `✓ fixed` / `✗ still present` / `⚠ new issue found`
5. Commit fix-by-fix (small commits, easy to revert)

For Medium/Low findings: list in the report, don't fix overnight (out of scope without Jez review).

### Estimated time

1-3 hours depending on what surfaces.

## Workstream 5 — Push + close out

Once Workstreams 1-4 done:
1. Run full test suite — must be 92+ passing (no regressions)
2. Run `pnpm build` — must succeed
3. `git push` — surface the chain of commits to origin
4. Update `.jez/artifacts/goanna-adoption-plan-2026-05-04.md` to status: complete
5. Comment on closed issues + leave audit summary on the GH repo
6. Final report at `.jez/artifacts/overnight-execution-report-2026-05-04.md` with:
   - Workstream completion summary
   - Audit verdicts (per pass)
   - Findings list with severity counts
   - Fixes shipped + their commits
   - Anything left for daytime review

## Constraints + gotchas to expect

### Wrangler auth lockout (recent precedent)

The 9109 lockout we hit earlier was triggered by rapid test runs hitting Cloudflare's edge-preview rate limit. **Mitigation**: don't run `pnpm test` more than once per 5 minutes. Cache test results between work blocks. If lockout fires, queue test runs for the morning and continue with type-check + build verification only.

### Cookie expiry

Test-auth cookies expire (default ~1 hour TTL on the underlying session). **Mitigation**: re-mint at the start of each pass. Watch for unexpected 401 → don't silently retry, terminate that pass and re-mint.

### Cloudflare Workers AI rate limits

Reflect + librarian skills will fire LLM calls during scenario testing. The free Workers AI tier has rate limits. **Mitigation**: don't manually trigger routine fires more than ~10 times per hour. If a fire is rejected, log + continue (the audit catches the user-facing error message either way).

### Screenshot context budget

A 4-pass audit generates 200-400 screenshots. Storing them all in conversation context will compact the session. **Mitigation**: write findings + evidence paths to `.jez/audit-evidence/2026-05-04/findings.md` as I go. Reference paths, don't embed images. Use sub-agents for screenshot review batches.

### Sub-agent dispatch friction

Each sub-agent starts cold and re-reads context. **Mitigation**: dispatch sub-agents only for screenshot-review batches (10-20 images each), not for the audit itself. The main session drives the audit per the skill's "execution discipline" rule.

### My specific tendency to under-do

See "Self-honest analysis" below.

## Self-honest analysis — what limits me on ux-audit

The user asked directly. Here's what I notice in my own behaviour against this skill:

### 1. **Pulling toward summary over interaction**

The model bias: I want to "see" the surface, synthesise, and produce a verdict. The skill explicitly fights this — it requires typing, clicking, screenshotting, console-reading, all logged with timestamps that the auditor (or a future me) can spot-check. Every time I've shortcut this in past audits, I've missed bugs that only surfaced under interaction.

**The forcing function I'll use overnight**: I'll write a manifest entry IMMEDIATELY after each interaction (not in a batch at the end). Each entry is a tool call, so timestamps come from real time. The "≥ 0.5s median gap" check is built to catch fictional logs.

### 2. **Over-pruning the scenario battery**

When Phase 3 looks clean, the temptation is "we don't need scenario 7 (destructive confidence)" or "scenario 9 (lifecycle position) doesn't apply here." Both of those are wrong defaults. Scenario 7 catches consent-clarity bugs that look fine until you delete the wrong thing. Scenario 9 catches the lifecycle bugs that make a fresh user vs a 6-week user see entirely different UIs.

**Mitigation**: I'll commit to running ALL 10 scenarios overnight. Document why each was skipped if any genuinely don't apply (RBAC for #8 doesn't exist in this app — that's the only legit skip).

### 3. **Skipping smaller viewports in multi-pane stress**

If 1920 + 1440 look fine, the temptation is "1024 will be fine too." It won't. The 2026-04-29 vertical-text bug specifically lived at 1024-1280 with 3 panes. Multi-pane stress is mandatory at all 7 viewport breakpoints.

**Mitigation**: scripted resize loop with screenshots at each breakpoint, no manual narrowing.

### 4. **Treating Phase 5 (stress) as optional after a clean Phase 3**

Phase 3 is the walkthrough. Phase 5 is stress (race conditions, slow network, reduced-motion, real-flavour data). When Phase 3 is clean, the model wants to ship the verdict. The skill mandates Phase 5 anyway because that's where the silent-failure bugs hide.

**Mitigation**: don't write the verdict block until Phase 5 + polish phase are both complete and logged.

### 5. **Inventing findings rather than reproducing them**

"A user might find this confusing" is not a finding without evidence. The skill rejects findings without reproduction steps + evidence path + suspected source location.

**Mitigation**: every finding gets the full template — ID, Layer, Severity, Surface, Persona, Reproduce (numbered steps), Observed, Expected, Evidence (file path), Suspected location, Suggested fix. If I can't fill all 8 fields, it's not a finding yet.

### 6. **The 5-min minimum on Phase 3 feels artificial**

The audit-the-audit meta-check requires Phase 3 to take ≥ 5 minutes. My instinct is to say "I covered everything in 90 seconds, why pad the timing?" The reason: a 90-second walkthrough physically cannot have produced enough interactions to satisfy the manifest. The 5-min floor is a forcing function, not a target.

**Mitigation**: don't try to game the timing. Real interactions take real time.

### 7. **Underweighting the polish phase**

Visual polish + axe-core + perf budget feel mechanical compared to Phase 3 thread-walking. They are mechanical — and they catch the structural bugs that thread-walking misses by design (heading skips, contrast failures, hidden focus, LCP regressions). Skipping them produces a verdict that's unrepresentative.

**Mitigation**: schedule polish phase with the same weight as Phase 3 in the time budget.

### 8. **Cost-of-screenshots context pressure**

The single biggest practical limit. A 4-pass audit produces hundreds of screenshots and the session compacts. **Mitigation**: write each pass's findings file to disk as I go, dispatch sub-agents for batch screenshot review (one sub-agent per pass), keep only the verdict block in main-context for cross-pass synthesis.

### 9. **My natural cadence wants to be ~30 min, the skill wants ≥ 30 min PER PASS**

A "thorough" audit I've done before was probably 30-60 min total. The skill expects 30-60 min per pass, four passes, plus polish + stress. That's the right calibration for this app's surface area but my model-default doesn't reach for it.

**Mitigation**: explicitly time-box each pass at minimum 30 min; don't ship the verdict until that time has elapsed AND all manifest checks are satisfied.

### What I'd want changed in the skill itself

Not changes — but two clarifications I'd find useful:

- **Sub-agent dispatch convention** — the skill says "use sub-agents for screenshot review" but doesn't pin down where the batch boundary should be (per pass? per 20 screenshots? per scenario?). My read: per pass works, since each pass produces a roughly bounded screenshot set.
- **Headless-vs-Chrome-MCP guidance for overnight** — the skill prefers Chrome MCP for authenticated apps but doesn't acknowledge headless-with-test-auth-cookies as a clean alternative. For overnight runs without a Jez-Chrome session, test-auth cookies + Playwright is the right call. Worth documenting.

These are docs improvements, not skill changes.

## Open questions for Jez

Before I start, a few things to confirm:

1. **Live URL right?** — `https://vite-flare-starter.webfonts.workers.dev/` based on the `webfonts` workers.dev subdomain.
2. **Push policy** — okay to `git push` to origin/main when done, or wait for morning review?
3. **Destructive testing** — scenario 7 (Destructive Confidence) tests delete/dismiss/reject flows. Run on freshly-seeded scratch entities (safe) or skip entirely?
4. **Anything off-limits** — connectors that should NOT be exercised (e.g. "don't actually fire any Gmail tools that send mail")?
5. **Wake conditions** — would you rather I bail to the morning summary on hitting any blocker (rate limit, cookie expiry I can't recover from, etc.), or push through with what's possible? My default is "log + continue, surface in the morning report."

## Stop list (when I would wake you)

- DB lockout / deploy down (can't proceed)
- Hard auth lockout that survives cookie re-mint
- Discovering a Critical security finding that needs immediate decision (e.g. PII leak)
- Finishing all five workstreams substantially earlier than expected (would surface for "anything else?")

## Order of operations summary

```
[ 0:00 ] Pre-flight: write personas, audit-config, mint cookies
[ 0:30 ] Workstream 1: slice 6 — local-hour cadence
[ 1:30 ] Workstream 2 #43: close Spaces issue
[ 1:35 ] Workstream 2 #52: TanStack Virtual phase 1
[ 4:00 ] Workstream 2 #62.1: Kanban primitive
[ 6:30 ] Workstream 2 #62.5: FTS5 → entities + search
[ 8:30 ] Workstream 3 Pass 1: first-time user persona
[ 9:30 ] Workstream 3 Pass 2: returning power user
[10:30 ] Workstream 3 Pass 3: multi-pane stress matrix
[11:30 ] Workstream 3 Pass 4: scenario battery + polish
[13:30 ] Workstream 4: fix-and-verify Critical/High
[15:00 ] Workstream 5: push + close-out report
[15:30 ] Done → final report at .jez/artifacts/overnight-execution-report-2026-05-04.md
```

(Times are session-time estimates; some workstreams are parallelisable mentally if a sub-agent handles screenshot review for an earlier pass while the main session continues to the next.)
