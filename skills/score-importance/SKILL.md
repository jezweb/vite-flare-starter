---
name: score-importance
description: Calibrates finding importance (high / medium / low) before inbox_add — used by routines for consistent thresholds. Routine-only.
disable_model_invocation: true
---

# Score Importance

## Purpose

`inbox_add` accepts an `importance` field — `high`, `medium`, or `low`. Without consistency, what one routine calls "high" another calls "medium" and the user stops trusting the field.

This skill defines what each level means so all your routines agree.

## Definitions

### high

Action is needed within the day. If the user ignores it, something will break or get worse.

Examples:
- Backup failed. Quota exceeded. Auth expired on a connector the user relies on.
- A new high-value lead replied; a hot conversation needs follow-up by EOD.
- Cost overrun on a paid integration.
- Security signal: unfamiliar login, unusual API rate.

### medium

Action is helpful within the week. Not blocking, but skipping has a cost.

Examples:
- Stuck items (tickets, leads, drafts) older than the user's threshold.
- A meeting summary the user might want to skim before tomorrow.
- A summary of activity the user usually checks daily but missed today.
- A trend (search volume, engagement) worth knowing about.

### low

FYI. Skipping has no cost. The user is happy to know but won't act.

Examples:
- A YouTube/article summary; "the X talk you bookmarked is now public".
- Counters: "you sent 14 messages today, your average is 11".
- Routine status: "all 12 sites checked, all healthy" (when the user wants to see proof of work).

## Heuristics

| Signal | Suggests |
|---|---|
| Time-bound (deadline, expiry) | high |
| Money-bound (cost, revenue) | high or medium |
| Failure / regression | high |
| Volume / count change | medium or low |
| New content (article, video, message) | low (unless from a key relationship) |
| "Should I look at this?" — user-paced | medium or low |

## Confidence

Pair `importance` with `confidence` (0..1). High confidence + medium importance is more actionable than low confidence + high importance. If you're not sure something matters, lean low + add a `reasoning` line so the user can confirm.

## Anti-patterns

- Don't mark routine work `high` to get the user's attention. The user disables routines that cry wolf.
- Don't use `low` for things you secretly think are `high` — that's still crying wolf, just inverted.
- Don't fill `importance` if you genuinely don't know. Leave it null and let the user filter.
