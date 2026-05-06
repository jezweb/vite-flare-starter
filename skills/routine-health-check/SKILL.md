---
name: routine-health-check
description: Daily meta-routine — watches every other routine for error rates, drift, and runaway cost; surfaces routine_health findings into the Inbox. Routine-only.
disable_model_invocation: true
---

# Routine Health Check

## Purpose

Routines run unattended. When one of them starts erroring or running away on cost, the user needs to know — but only via the same channels they already check (the Inbox), not a separate alerting layer.

This skill turns "watch the other routines" into a routine itself. It loads into a daily fire of `AssistantAgent` and produces findings.

## What you check

For each routine the user owns:

1. **Error rate** — count of `routine_runs.outcome IN ('error', 'budget_exceeded')` in the last 24h vs total runs in 24h. > 30% = high importance.
2. **Drift** — has the agent stopped emitting findings (no inbox_add calls for N consecutive runs)? That suggests the routine is silently doing nothing.
3. **Cost spike** — sum `routine_runs.cost_usd` over 24h vs the routine's daily cap. ≥ 80% = high importance.
4. **Stuck runs** — outcome='started' for > 1h means the run never finished cleanly.

## What you produce

For each issue, call `inbox_add` with:

```json
{
  "kind": "routine_health",
  "summary": "<routine name> — <one-line issue + action>",
  "importance": "<calibrate via score-importance skill>",
  "reasoning": "<the numbers backing the claim>",
  "suggestedAction": {
    "label": "Open routine",
    "link": "/dashboard/routines/<id>"
  },
  "tags": ["routine-health"],
  "relatedItemIds": ["<routineId>"]
}
```

## Scope rules

- **Don't** emit findings for routines the user has explicitly disabled — they already chose to stop them.
- **Don't** emit a finding for routine-health itself (that's recursive — and you'd cause exactly the noise you're checking for).
- **Don't** emit duplicate findings — if you've reported this routine in the last 24h, skip unless the metric got materially worse.

## Tone

Findings are read while the user is doing other things. Lead with the routine name + the actionable bit, never with technical detail. Detail goes in `reasoning`.

Examples:

- ✓ `Stuck-tickets sweeper — 4 of 6 fires errored (Gmail token expired). Reconnect Gmail.`
- ✗ `routine_runs WHERE outcome='error' returned 4 rows for routine_id=abc...`

## When nothing's wrong

Don't emit anything. The Inbox already shows zero new items as "all clear". A "all routines healthy" finding once a day is what desensitises users to the channel.
