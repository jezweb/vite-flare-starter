---
name: reverie
description: Use when an agent has had N consecutive quiet runs with nothing to do. Pivots to bounded inward consolidation (promote findings, refresh memory, audit asks) anchored in own data — NOT generic news summarisation. Adapted from goanna's reverie cycle. Routine-only; loaded by the routine that detects the quiet condition.
disable_model_invocation: true
---

# Reverie cycle — what to do when there's nothing to do

When N consecutive routine fires have produced no real signal, an
agent could either coast ("monitoring continues") or drift into
make-work ("here's a summary of recent news"). Reverie is the third
option: **bounded inward consolidation** anchored in the agent's
own data.

## When this fires

Reverie is **activity-conditional, not time-scheduled**. A routine
fires reverie when its trigger condition is met:

- ≥3 consecutive routine runs produced no findings, no notifications,
  no inbox additions
- Or: explicit user request ("you're quiet, go to reverie")

Don't schedule reverie via cron. Schedule the routine; let the
routine trigger reverie when the quiet condition matches.

## Pick ONE inward task

From this menu, pick exactly one. Don't try to do all of them in
one cycle.

| Task | What it does | Tool used | When it fits |
|------|--------------|-----------|--------------|
| **Promote stable findings** | Walk findings from last 14 days; promote stable patterns to learnings, dismiss what didn't hold | `entity_search` + `promote_finding` + `dismiss_finding` | When `entity_search({type:'finding', status:'open'})` returns ≥5 items |
| **Refresh memory index** | Re-read your memories; merge near-duplicates; archive stale | `memory_search` + `memory_update` + `memory_remove` | When memory count > 50 and last consolidation > 14d |
| **Resolve open asks** | Pick one open ask; deep-think on it for 10-15 min; write a finding with the answer or escalate | `entity_search({type:'ask', status:'open'})` + `record_finding` + `entity_update` (close ask) | When asks.md (entity type=ask) has ≥1 open item |
| **Audit own findings** | Walk findings older than 60d; flag anything still 'open' that should be promoted/dismissed | `entity_search` + `entity_update` | Quarterly, not weekly |
| **Persona reflection** | Re-read your persona blocks; date-stamp any drift you've noticed | `entity_get(self)` + `setBlock` | Monthly |
| **Skill review** | Pick one skill you use often; mentally test it against today's reality; if stale, propose_patch | `load_skill` + `propose_patch` | When a skill hasn't been touched in 30d+ |
| **Cross-pollination read** | Read sibling agents' recent findings; surface relevant cross-cutting patterns into the user's inbox | `entity_search({type:'finding'})` (cross-agent) + `inbox_add` | Daily-rotation candidate |

## Bounded — 10-15 minutes

Reverie is NOT extended deep work. ONE artefact, then stop. If you
find yourself going longer, that's a finding worth surfacing as
*"this needed real work — should fire as a real task next cycle"*.

## Produce ONE artefact

By the end of reverie, you have produced exactly one of:

- A finding promoted to a learning (`promote_finding`)
- A finding dismissed with a reason (`dismiss_finding`)
- A memory consolidated (merged near-duplicates via `memory_update`)
- An open ask answered + closed (`record_finding` + `entity_update`)
- A skill patched (`propose_patch`)
- A cross-pollination row written to inbox (`inbox_add`)
- A persona block updated (`setBlock`)

If you produce NOTHING, that's the failure mode — you've drifted to
make-work or coasting. Stop reverie, accept the silent run.

## Anti-patterns

- **"Let me summarise the latest news"** — explicitly forbidden.
  Reverie is INWARD consolidation, not outward content generation.
- **Generic "research a topic"** — must be anchored in YOUR data
  (your asks, your findings, your memories). External research is
  reactive-cycle work, not reverie.
- **Doing all tasks in one cycle** — pick one. Reverie is bounded.
- **Skipping reverie because "I'm quiet but ok"** — if 3+ consecutive
  quiet runs have passed and you skipped reverie, you're coasting.
- **Reverie producing zero artefacts repeatedly** — if 3 consecutive
  reveries produce nothing, your routine cadence is too high. Use
  `record_finding` to surface "reverie cadence too aggressive" to
  the user.
- **Generative "let me think about how I could improve"** — too
  broad. Pick a specific task from the menu.

## Why this earns its place

Quiet routines drift. Reverie compounds value during quiet windows
instead of either coasting on "monitoring continues" or drifting into
make-work disguised as reflection.
