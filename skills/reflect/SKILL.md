---
name: reflect
description: End-of-day distillation routine — reads recent runs + findings, decides what graduates / dismisses / stays open, writes a one-paragraph day summary. Routine-only.
disable_model_invocation: true
---

# Reflect

End-of-day consolidation. Distil what happened today into the right primitives so tomorrow starts informed.

> Goanna's reflect cycle treats reflection as discipline, not output volume. Most days, the right answer is "things went normally — nothing graduates, nothing dismisses." Don't manufacture findings just to fill the page.

## When to run

- Once per day, typically 22:00-23:00 local
- After all the day's work is done; before sleeping the agent
- If you skipped a day, run it anyway — better than not at all

## Steps

Run in this order. Don't shortcut — the order is what makes the cycle work.

### 1. Survey the day

Call `entity_list` with `type: 'finding'` and a generous `limit` (50). Read each finding's title + body + status + recurrenceCount.

Mentally bucket findings by:
- **My agent's findings** (where `fields.agentName` matches my own instance) — these are MY craft
- **Other agents' findings** (visible in the same user's store) — read for cross-pollination but don't promote those

### 2. For each of MY recent findings, decide

Walk through findings I created or that target me. For each:

| Status now | Decision logic | Action |
|---|---|---|
| `open`, recurrenceCount = 0 | Has it been ≥7 days since createdAt with no recurrence? → Dismiss as one-off. Otherwise leave open. | `dismiss_finding` (with reason "No recurrence in 7 days, treating as one-off") OR leave |
| `open` or `recurred`, recurrenceCount ≥ 1 | Pattern is real and repeating. Promote it. | `promote_finding` (refinedBody optional — distil if the original is verbose) |
| `promoted` | Already a learning. Skip. | (none) |
| `dismissed` | Already filed. Skip. | (none) |

**Discipline**: don't promote a finding the first time you see it. The whole point of the open → recurred → promoted lifecycle is to filter for repeatability. If you find yourself wanting to promote-on-first-sight, write a learning directly via the librarian-curate skill instead.

### 3. Look for unrecorded patterns from the day

Call your context tools (search_memory, recall, etc.) to surface anything from today's work that wasn't already filed. For each genuine new pattern:

- Use `record_finding(body, category?, tags?)` to file it. Use specific bodies — "auth tokens with trailing whitespace fail validation silently" beats "auth bug".
- Categories that work well: `auth`, `data`, `ux`, `perf`, `tooling`, `process`, `client`, `cost`.
- Don't file:
  - "Things went normally" — not a finding.
  - "Completed task X" — that's an agent_run, not a finding.
  - General reflections — those are journal notes, not findings.

### 4. Compose a one-paragraph summary

Write a single paragraph of 2-4 sentences covering:
- What I did today (broad strokes)
- What graduated (titles of newly promoted learnings, if any)
- What dismissed (count, not list)
- What I'm watching tomorrow (the open thread, if any)

This becomes the routine's `outputSummary` via the SessionEnd hook. Keep it tight — the next reflect run will see this and the prior 4 summaries as context. Don't summarise the summary.

Example:

> Worked through the connector OAuth refactor most of the day. One finding promoted to a learning (PKCE state cookies need explicit SameSite=None; recurred 3rd time). Two open findings dismissed as one-offs. Tomorrow: revisit the new approval queue UI feedback the user flagged.

If the day was quiet:

> Quiet day. Held the cron, processed three inbox items, no novel patterns surfaced. Nothing to file.

That's a complete reflection. Short is fine.

## Anti-patterns

- **Generating tech-news summaries** — reflection is about distilling YOUR work, not external content.
- **Promoting on first sight** — the lifecycle exists for a reason. Open findings ferment until they earn promotion.
- **Filing "things went normally" as a finding** — that's the absence of a finding, not a finding.
- **Long preamble in the summary** — assistant turns burn tokens; the next-fire run-tail block has limited budget.
- **Cross-promoting other agents' findings** — that's the librarian's job in `librarian-curate`. Stay in your lane.

## Output

By the time reflection is done:
- Recurring patterns from MY findings have been promoted to learnings (where applicable)
- One-off open findings older than 7 days have been dismissed with a reason
- Any unrecorded patterns from today's work have been filed via `record_finding`
- A one-paragraph summary exists as the run's outputSummary

Target: 5-10 minutes of work. Don't expand the cycle to fill more time.

## Goanna lineage

This skill is adapted from goanna's `goanna-reflect` skill (`~/Documents/goanna/skills/reflect/SKILL.md`). Goanna's version writes to filesystem markdown; this version writes to the entities table via the `record_finding` / `promote_finding` / `dismiss_finding` tools. Same discipline, different transport.
