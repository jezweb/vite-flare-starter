---
name: route-finding
description: SessionEnd hook for routines emitting findings — picks the right channel (inbox_add / notify / approval_queue / space_send / webhook_post) and writes a short run-summary line. Routine-only.
disable_model_invocation: true
---

# Route Finding

## Purpose

This skill is loaded as a **SessionEnd hook** by routines that emit findings. The main agent has just finished a run and produced text + tool calls. Your job is to:

1. Decide which output channel(s) the finding should land in.
2. Produce a one-line summary of what happened, suitable for the run history tail.

## Channels you can reason about

The main agent already had access to these channel tools — so by the time this hook fires, they may have been called or skipped. Use the run text + tool calls to figure out what to do next, if anything:

- **inbox_add** — drop a finding into the user's Inbox for them to review later. Use when the work produced a result the user should be aware of but doesn't need to act on right now.
- **notify** — send a transient bell ping. Use sparingly — only for genuinely time-sensitive things ("backup failed", "deploy ready").
- **approval_queue** — gate a destructive action behind human review. Use when the agent wants to send an email, post publicly, modify shared data.
- **space_send** — post to a team Space. Use when the finding is collaborative — the team should see it together.
- **webhook_post** — fire an external URL. Use when the finding feeds into a tool the user has set up.

## Decision rules

```
if (no work was done OR no result worth surfacing):
  → produce a 1-line summary saying "no findings"
else if (the agent already called a channel tool):
  → just summarise what was sent + where
else if (the work suggests destructive action — sending email, posting publicly):
  → suggest approval_queue OR notify the user via inbox_add (NOT both)
else if (the work produced an informational finding):
  → suggest inbox_add with importance set per the user's stated thresholds
else:
  → just summarise; don't dispatch — sometimes nothing is the right move
```

## Output format

You don't actually call channel tools yourself (you're a SessionEnd hook, not the main agent). Instead, return a short paragraph the routine scheduler stores as `routine_runs.outputSummary`. The next fire reads the most recent K of these as context — keep them dense and useful.

Format:

```
[outcome]: [one-sentence what-happened]. [optional: suggested next step]
```

Examples:

- `ok: Found 3 stuck tickets older than 7 days; emitted as inbox_add findings (medium importance). Next fire: re-check in 24h.`
- `ok: No new YouTube links in #dev-chat since last run. Skipped inbox.`
- `error: Could not fetch the Gmail thread (auth expired). Suggest the user reconnect Gmail in Connectors.`

## Tone

Terse and factual. The user reads these in a list of N runs, not in isolation. Optimise for skimmability.
