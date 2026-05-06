---
name: caretaker
description: Day-of-week rotating proactive sweep — Mon=connections / Tue=routines / Wed=skills / Thu=memories / Fri=findings / Sat=cross-cutting / Sun=weekly summary. Forces outward scan instead of inward thrash. Routine-only; load this skill into a daily routine that fires AssistantAgent. Adapted from goanna's caretaker.
disable_model_invocation: true
---

# Caretaker — daily rotating focus sweep

Catches drift before it becomes urgent. Provides "what to do today"
so an agent always has real outward work — never coasts on
"monitoring continues."

## When this fires

Daily, once per day in the morning (recommended cadence: 06:00
user-local). Different from heartbeat / reactive cycles — caretaker
is one focused outward sweep per day.

Wire as a routine targeting AssistantAgent with `loadSkills:
['caretaker']` and `cron: '0 6 * * *'` (or local equivalent).

## The rotation

Each day-of-week gets a different focus. Adapted to the entities and
modules in vite-flare-starter:

| Day | Focus | What to do |
|-----|-------|------------|
| **Mon** | Connections | Walk `mcp_connections` rows. Any expired tokens? Any unused for 14+ days? Any test connections leaked into prod? Surface as findings. |
| **Tue** | Routines | Walk `routines` table via `list_routines`. Any routines that errored 3+ times this week? Any with no runs at all? Any whose `lastRunCost` exceeds budget? Surface findings. |
| **Wed** | Skills | Walk `skills` via `list_skills`. Any skills not loaded in 30+ days (check tool-usage stats)? Any skills with descriptions missing "Use when…"? Surface as findings. |
| **Thu** | Memories | `memory_search` for memories older than 90d with low recall_count. Candidates for archive. Surface count + IDs as a finding. |
| **Fri** | Findings audit | Walk `findings` with status='open' older than 30d. Stale opens are red flags — promote, dismiss, or extend explicitly. |
| **Sat** | Cross-cutting | Read findings across ALL agents this week. Look for cross-cutting patterns (same gotcha discovered by multiple agents). Promote shared patterns to learnings. |
| **Sun** | Weekly summary | Distil the week into one paragraph: what shipped, what landed, what's open, what's queued. Write to inbox via `inbox_add` with importance='medium'. |

For non-developer agents, adapt the rotation to the agent's surface
area (e.g. for a customer support agent: Mon=tickets / Tue=common
asks / Wed=knowledge gaps / etc).

## State entity

Caretaker maintains a state entity to track rotations across runs.
Use `entity_search({type: 'caretaker_state', status: 'open'})` to
find it; if missing, create one:

```
entity_create({
  type: 'caretaker_state',
  title: 'Caretaker rotation state',
  status: 'open',
  fields: {
    lastVisitDate: '2026-05-06',
    weeklySummaryLast: '2026-05-04',
    rotationProgress: { ... }  // per-focus pointers
  }
})
```

For the codebase / connections rotation specifically, use
`fields.rotationProgress.lastConnection: 'gmail-personal'` so the
next visit picks the next one in alphabetical order. Without state,
the rotation drifts back to inward thrash.

## Steps

### 1. Determine today's focus

```ts
const dow = new Date().getDay()  // 0=Sun … 6=Sat
const focus = ['weekly-summary', 'connections', 'routines', 'skills', 'memories', 'findings-audit', 'cross-cutting'][dow]
```

### 2. Read your caretaker_state entity

What did you do last time on this focus? Where do you pick up?

### 3. Run the focus-specific sweep

**Time-bounded: 15-30 min wall clock. Caretaker is surveillance, not
deep-work.** Find, surface, move on. Reactive cycles fix.

### 4. Write findings

For each thing worth surfacing:

```
record_finding({
  body: '...',
  category: 'caretaker-flag',
  tags: ['caretaker', focus],
})
```

Don't fix what you find unless trivial — surface it. Reactive cycles
or curate skill decide.

### 5. Update caretaker_state entity

`entity_update` with new dates + rotation pointers.

### 6. Update memory + write Sunday summary if applicable

Sunday only: `inbox_add` a weekly summary to the user's inbox with
the week's highlights.

## Anti-patterns

- **Skipping when "nothing's happening"** — that's exactly when
  caretaker fires. Quiet weeks accumulate small drift; caretaker
  catches it before it bloats.
- **Doing deep-work during caretaker** — surveillance, not deep-work.
  Find, surface, move on.
- **No state entity** — without it, the rotation drifts back to
  inward thrash.
- **Manufacturing findings** — if nothing surfaces, the right output
  is *"caretaker ran <focus>; nothing to flag this week."* Empty
  days are valid; they prove the system is working.
- **Caretaker eating reactive routine budget** — caretaker is
  once-per-day, time-bounded. Don't run it inside other routines.

## Output

By the end of caretaker:
- Today's focus has been swept
- Any items worth surfacing are in `findings`
- `caretaker_state` is updated
- A `memory_add` entry is written for the day
- Sunday only: weekly summary written to inbox
- Agent has done something REAL this morning, not just coasted

## Pairs with

- **Reverie skill** — different mechanism. Reverie is INWARD
  consolidation when quiet; caretaker is OUTWARD scanning on a
  schedule.
- **Routine-health-check** — caretaker reports findings; routine-
  health-check checks whether the caretaker routine itself is
  healthy.
