---
persona: first-time-user
date: 2026-05-04
audit_use: ux-audit Pass 1
---

# First-time user

## Who they are

A small-business owner or solo professional who has just been invited to vite-flare-starter via a fork (e.g. their developer set up an instance for their team). First time signing in. They've heard "AI dashboard with chat, routines, and findings" but not much more.

## Goals on first visit

1. Sign in and confirm "I'm in the right place"
2. Send their first chat message and see a useful response
3. Set up something automated — they've been told "daily reflection" is the obvious starter
4. Understand what each sidebar item does without clicking through every one

## Tech context

- Browser: Chrome on macOS (1440 viewport default)
- They aren't a developer. They don't read docs first.
- Time-pressed. Will give up if friction lasts >30s on the first thread.

## What good UX looks like

- The dashboard explains itself. Empty states have CTAs.
- Sidebar labels read as nouns or verbs ("Chat" is fine, "Findings" needs a tooltip on first visit)
- The first chat message returns *something* even if their setup is bare (no connectors, no tools)
- "Set up daily reflection" is the obvious next step on the Findings page when it's empty
- Errors are translated to plain English ("We couldn't reach the AI service" not "Workers AI 429")

## What they should never see on first visit

- Raw class names ("AssistantAgent")
- Raw enum strings ("trigger=schedule, outcome=ok")
- Skill IDs without descriptions
- Empty pages with no explanation of what they're for
- Modal dialogs offering 8+ choices without recommending one

## Audit threads

### Thread 1: "Set up daily reflection"

1. Land on `/dashboard` after first sign-in
2. Click `Findings` in sidebar
3. Empty state should explain what findings ARE
4. Empty state CTA → "Set up daily reflection"
5. Click → routine wizard opens pre-filled
6. User reviews + saves
7. Returns to `/dashboard/routines` → sees the new routine listed
8. Verify: routine row shows when it'll fire, what it does, an enable/disable toggle

### Thread 2: "Send my first chat message"

1. Sidebar → `Chat`
2. Empty conversation list → "New chat" or auto-created conversation visible
3. Type "Hello, what can you help with?" → enter
4. Response streams back within reasonable latency
5. Verify: no 500 errors, no broken markdown rendering, the response acknowledges they're new

## Friction signals to log

- Anywhere the user might say "what does this mean?"
- Anywhere a label is jargon (`agent_runs`, `routineId`, `entityType`)
- Empty states with no CTA
- Loading states that don't progress within 5s
- Errors with stack traces or framework names
