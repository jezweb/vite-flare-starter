---
name: agent-asks-tasks
description: Use to track open questions you owe the user (asks) and time-bounded commitments you owe yourself (tasks). Write OPEN entries when you commit; promote to CLOSED when answered/done. Survives session compaction. Adapted from goanna's asks.md/tasks.md pattern.
always_active: true
---

# Agent asks + tasks — durable commitments

Long-running agents lose context when sessions compact or routines
fire days apart. Anything you commit to in mid-conversation that
isn't immediately resolved should be written down — otherwise it
silently disappears.

This skill uses the existing **entities** store with two types:
- `type: "ask"` — a question YOU owe the user (waiting on their answer)
- `type: "task"` — a deliverable YOU owe yourself (you'll do it)

## When to write an ask

You realise you need information from the user to proceed, but they
haven't given it yet. Examples:
- "I need Jez's preferred timezone for these reports"
- "What's the deadline on the Q3 OKRs?"
- "Should the email go to the team alias or just to Sarah?"

Don't write asks for trivia (date format, single-word clarifications) —
those should be inline in the same response.

```
entity_create({
  type: "ask",
  title: "Confirm Q3 OKRs deadline",
  status: "open",
  fields: { body: "Need Jez's hard deadline for Q3 OKRs draft." }
})
```

## When to write a task

You committed to do something later, OR a routine surfaced something
that needs follow-through but isn't blocking the current turn.
Examples:
- "I'll review the 3 PDFs Jez uploaded by tomorrow"
- "Check whether Gmail OAuth is still authorised before next sweep"
- "Draft the marketing brief once research is in"

```
entity_create({
  type: "task",
  title: "Review 3 uploaded PDFs",
  status: "open",
  fields: { body: "Summarise each, surface findings.", dueAt: "2026-05-08" }
})
```

## When to close

When the answer arrives (ask) or the work is done (task), close the
entity:

```
entity_update({ id: "<entity_id>", status: "closed" })
```

Optionally store the answer or outcome in `fields.resolution`.

## Reading what's open

Before answering when you might have unfinished business, check:

```
entity_search({ type: "ask", status: "open" })
entity_search({ type: "task", status: "open" })
```

If anything is open and relevant, mention it: *"By the way, I'm still
waiting on your answer about X — should I proceed without it?"*

If a task is overdue, surface it: *"You asked me to review the PDFs by
yesterday — I haven't started yet, want me to do them now?"*

## What NOT to use this for

- **Approval queue** — destructive actions go through the existing
  approvals queue, not as asks.
- **External tickets** — Linear / Jira issues aren't your asks; reference
  them by id in the entity's body if relevant.
- **Findings** — observations you want to record (not commitments) go
  in the findings store via `record_finding`.
- **Memory facts** — long-term knowledge goes in memory_add.

The mental model: asks/tasks are short-lived, action-shaped, and
survive precisely until they're closed. Findings, memories, and
external tickets have different lifecycles.
