---
name: librarian-curate
description: Weekly cross-agent curation routine — surfaces patterns across agents, promotes stable ones into shared knowledge, writes a weekly digest into Inbox. Routine-only.
disable_model_invocation: true
---

# Librarian curate

Weekly cross-pollination. Read across every agent's learnings, surface patterns that recur in multiple places, promote stable ones into the user's shared knowledge store, and digest the week into one Inbox post.

> Goanna's coaching/curation review is the librarian's standing duty. Here, the same skill runs in any AssistantAgent acting as librarian-for-the-week. Don't add a new agent class — wear the role for one fire.

## When to run

- Once per week. Friday afternoon or Sunday evening — quiet times where reflection won't compete with active work.
- After several reflect cycles have accumulated learnings (running this on day 1 with no learnings is a no-op).
- Skip if no learnings have been added since the last librarian fire.

## Steps

### 1. Survey learnings across all the user's agents

Call `entity_list` with `type: 'learning'` and `limit: 100`. The list is user-scoped, so you see every agent's graduated patterns in one query.

Bucket each learning by:
- **Agent identity** — `fields.agentName` (or `fields.agentClass` as fallback)
- **Created in the last 7 days** vs older
- **Body theme** — read the body, group by topic (auth / data / ux / cost / perf / process / etc.)

### 2. Identify cross-cutting patterns

A cross-cutting pattern is a learning that appears in 2+ agents' work, OR a single agent's learning that's stable enough to graduate to the user's shared knowledge.

Filter to candidates:

| Signal | Action |
|---|---|
| 2+ learnings from different agents on the same topic | Strong candidate — promote to shared knowledge |
| 1 learning, recurrenceCount on its source finding ≥ 3 | Stable enough — promote |
| 1 learning, recent, single agent, hasn't recurred | Leave it — let next week's review re-evaluate |
| Multiple learnings disagree (one says "always X", another "never X") | Surface the conflict in the digest, don't auto-promote |

### 3. Promote stable patterns into shared knowledge

For each cross-cutting candidate, call `entity_create` with:

```yaml
type: note          # piggybacks on the existing notes entity type
title: "[Librarian] <one-line pattern>"
status: active
fields:
  body: <distilled prose — combine the source learnings, lead with the rule, cite the agents that found it>
  category: <topic>
  source_learning_ids: [<id1>, <id2>, ...]
  promoted_by: librarian
  promoted_at: <unix timestamp>
```

Distillation discipline:
- **Lead with the rule**, not the discovery story
- **Cite source agents** so future readers can trace lineage
- **Cap at ~300 words** — knowledge entities are reference, not narrative
- **Use the same shape** every week so the user can scan multiple weeks side-by-side

### 4. Write the weekly digest into Inbox

Call `inbox_add` with importance medium and a body shaped like:

```markdown
## Librarian — week of <YYYY-MM-DD>

**Promoted to shared knowledge** (N):
- [Pattern title 1] — <one-line summary> (from <agent A>, <agent B>)
- [Pattern title 2] — <one-line summary> (from <agent C>)

**New learnings this week** (N): one-line per learning, grouped by agent

**Cross-agent themes**: 1-2 sentences on what stood out across the team

**Conflicts to resolve**: anything where agents disagreed (skip if none)
```

If nothing graduated this week, the digest can be brief:

```markdown
## Librarian — week of <YYYY-MM-DD>

Quiet week. 3 new learnings across 1 agent, none stable enough to graduate yet. Will re-evaluate next week.
```

### 5. End with a SessionEnd summary

Two-three sentences summarising the curation pass. Goes into routine_runs.outputSummary so the next-fire run-tail context can see "what happened last week without re-reading the digest."

## Anti-patterns

- **Promoting on the first occurrence** — that's the reflect skill's territory (finding → learning). Librarian operates one level higher: learnings → shared knowledge.
- **Polluting the user's notes with low-signal entries** — the `[Librarian]` prefix and tag let users filter; use them. Aim for high-signal sparse output, not week-by-week noise.
- **Cross-promoting other users' learnings** — every entity_list query is user-scoped. You can't see other users' work and shouldn't try to.
- **Converting reflections into knowledge** — reflection summaries are agent_runs.outputSummary, not learnings. Don't try to mine them; the reflect skill already filed what mattered.

## Output

By the time librarian-curate is done:
- Every cross-cutting learning that earned promotion has a `[Librarian]`-prefixed shared knowledge entity
- The Inbox has one weekly digest entry summarising the cycle
- A 2-3 sentence SessionEnd summary captures the pass

Target: 10-15 minutes of work, longer if many learnings to weigh. Don't expand the cycle to fill more time.

## Goanna lineage

Adapted from goanna's `goanna-coaching-review` skill at `~/Documents/goanna/skills/coaching-review/`. Goanna's version is `librarian/` reading `<agent>/findings/` and writing to `~/goanna/den/knowledge/`; this version is the AssistantAgent acting AS librarian for one fire, reading entity_list and writing notes.

When this routine has earned its keep over weeks of dogfooding, consider graduating to a dedicated `LibrarianAgent` class with this skill baked in. Until then, role-by-skill is sufficient.
