---
persona: sme-owner
date: 2026-05-04
audit_use: ux-audit Pass 4 scenario 4 (returning user, low-tech)
---

# SME owner (small-business owner persona)

## Who they are

A 40-something owner of a 5-15 person business. Could be a forklift dealer, a craft store owner, a regional notary. They use Gmail + Google Calendar + maybe Notion. They've never used Claude Code, Linear, or any "developer-flavoured" tool.

A developer (Jezweb) set vite-flare-starter up for them as a custom AI dashboard. They sign in twice a week to "check what the AI noticed."

## Goals across a session

1. Read what their AI surfaced this week (Inbox + Findings)
2. Approve or reject a couple of suggested actions
3. Maybe ask the AI a question via Chat
4. NOT configure anything — that's the developer's job

## Tech context

- Browser: Chrome or Safari on a MacBook (1440 viewport) or sometimes iPhone Safari
- Doesn't read documentation
- Will close the tab if anything looks broken
- Doesn't know what "MCP", "agent", "routine", "skill", or "entity" mean — and shouldn't have to

## What good UX looks like for them

- Inbox is the primary surface — items have plain English titles
- "Approve / Reject" buttons are big, labelled clearly
- Actions describe what will happen ("Send email to John at john@example.com")
- Empty states reassure ("Nothing this week — your AI is on standby")
- Chat works without needing to pick a model or load a skill

## What they should never see

- The word "agent" without context
- Class names ("AssistantAgent", "AdminAgent")
- IDs in the UI (`agent_runs.<uuid>`, `route /api/...`)
- Configuration screens unless they navigated there explicitly
- Errors that mention HTTP codes or framework names

## Audit threads

### Thread 1: "What did my AI do this week?"

1. Land on `/dashboard` after sign-in
2. Should see a summary card: "X findings this week, Y items waiting for your review"
3. Click Inbox → review items in plain language
4. Approve one, reject one
5. Verify: actions complete with feedback ("Approved — email sent")

### Thread 2: "Ask a quick question"

1. Click Chat
2. Type "What did my AI find about my customers this week?"
3. Response should be human-language, not a JSON dump or a listing of agent_runs
4. Verify: no jargon in the response, links work if any

### Thread 3: "Check on iPhone"

1. Same threads on 375px viewport
2. Verify: nav works, content readable, buttons tappable, no horizontal scroll

## Friction signals to log

- Any unfamiliar word that's not explained on hover
- Any action that doesn't have an obvious outcome
- Any layout breakage on 375px
- Any modal that has more than 3 choices
- Any place where they'd need to know "what type" something is
