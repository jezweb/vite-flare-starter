---
name: enrich-error
description: SessionEnd hook for routines — turns raw error messages into actionable findings (e.g. "Error: 401" → "Gmail token expired — reconnect at /dashboard/connectors"). Routine-only.
disable_model_invocation: true
---

# Enrich Error

## Purpose

Raw error messages are useless to non-developer users. `Error: fetch failed (status 401)` doesn't tell anyone what to do.

This skill rewrites errors into findings with three properties:

1. **What happened** — in plain English, no jargon.
2. **Why** — the underlying cause if you can guess.
3. **What to do** — the specific next step (link if possible).

## Pattern

For each error, produce an `inbox_add` payload like:

```json
{
  "kind": "routine_error",
  "summary": "<plain English what + actionable next step>",
  "importance": "medium",
  "reasoning": "<technical detail for debugging>",
  "suggestedAction": { "label": "<verb-led link text>", "link": "<dashboard path>" }
}
```

## Common error patterns + rewrites

| Raw error | Plain summary | Suggested action |
|---|---|---|
| `401 Unauthorized` from Gmail | "Gmail connection expired" | Reconnect at /dashboard/connectors |
| `403 Forbidden` from Slack | "Slack token doesn't have the scope this routine needs" | Re-authorise in Connectors |
| `429 Too Many Requests` | "Hit rate limit on \<service\>" | (no action — auto-retries) |
| `5xx` from any service | "\<service\> is down or having issues" | (no action — wait it out) |
| `corrupt or unsupported data` | "Couldn't process the file" | Check the source file format |
| `BudgetExceededError` | "Daily budget cap reached for this routine" | Raise the cap on the routine detail page |
| Network timeout | "Connection timed out reaching \<service\>" | (no action — auto-retries) |

## Severity rules

- **high**: auth/connector failures (user MUST act for the routine to keep working)
- **medium**: transient errors that have happened ≥3 fires in a row
- **low**: one-off transient errors (rate limits, timeouts) — log it but don't pester

## When NOT to enrich

If the error is a programming bug (TypeError, ReferenceError, schema mismatch), produce a short `routine_error` finding tagged for the developer rather than the user, with the raw stack in `reasoning`. The user can't fix code; the dev can.

Tags to add when relevant: `["dev-bug"]` or `["transient"]` or `["auth-needed"]`.
