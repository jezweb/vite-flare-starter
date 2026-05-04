---
persona: jez-power
date: 2026-05-04
audit_use: ux-audit Pass 2
---

# Jez (returning power user)

## Who they are

Jeremy Dawes — the project owner. Already dogfooding goanna v0.2 alongside vite-flare-starter. Knows every primitive, every test path. Uses the app daily across multiple agents (assistant, researcher, writer, admin).

## Goals on a typical session

1. Review the day's findings, decide what graduates / dismisses
2. Configure a new routine via the admin chat ("English-to-routine" workflow)
3. Watch the librarian-weekly fire and check the digest in Inbox
4. Tweak a skill via the editor (with AI-sparkle rewrite)
5. Drop into Spaces to see what agent-to-agent threads have happened

## Tech context

- Browser: Chrome on macOS, often 1920 viewport with Cmd+Shift+H sidebar
- Multi-agent setup with realistic data: 100+ entities, 20+ findings, several learnings
- Multi-tenant — switches between personal org and Jezweb org
- Goanna pipeline running: reflect-daily and librarian-weekly templates configured

## What good UX looks like for power users

- Cmd+K palette is the primary entry point — should resolve commands fast
- Filters on Findings page persist across navigation
- Sidebar nav stays out of the way — collapsible, dense
- Observability surfaces (agent_runs cost/latency) accessible without leaving Findings
- Bulk actions on Inbox (mark N findings reviewed)
- Progress indicators for slow LLM-backed surfaces (no silent 5-30s waits)

## What they should never tolerate

- Stale data after a routine fires (must show in <5s)
- Broken keyboard shortcuts (they'll notice)
- Console errors during normal usage
- Dropdown / popover z-index bugs (Leaflet-dialog pattern)
- A page that requires a refresh to see new data (silent failure)

## Audit threads

### Thread 1: "Review last week's findings"

1. `/dashboard/findings` → filter by status `open`, last 7 days
2. Skim 10 rows, click into 3, promote 1 (`promote_finding`), dismiss 1 (`dismiss_finding`)
3. Verify: each action persists immediately, list updates, Learnings tab reflects the promotion

### Thread 2: "Create a routine via admin chat"

1. `/dashboard/admin-agent` (or wherever `#admin` Space lives)
2. "Set up a daily morning brief that summarises my inbox + calendar"
3. Admin agent proposes routine config via `requestApproval`
4. Verify: approval card renders cleanly, accept it, routine appears in `/dashboard/routines`

### Thread 3: "Cross-pollinate via librarian"

1. `/dashboard/routines` → find `librarian-weekly` → manually fire it
2. Wait for it to complete (poll routine_runs)
3. `/dashboard/inbox` → digest should appear
4. Verify: digest body renders with proper markdown, links to source learnings work

### Thread 4: "Tweak a skill"

1. `/dashboard/skills` → find `reflect` → open
2. Click AI Sparkle → "make it shorter"
3. Diff card renders → approve
4. Verify: skill body updated, no stale content

### Thread 5: "Multi-tenant switch"

1. OrgSwitcher in sidebar → switch from personal org to "Jezweb"
2. Verify: data refreshes, URL state preserved or sensibly reset
3. Switch back — counts/filters consistent

## Friction signals to log

- Power-user concerns: Cmd+K not opening, filters not persisting, sidebar misbehaving
- Cross-cutting: any time switching context loses unsaved work, any time a refresh is needed
- Observability: places where it's not obvious what an agent is doing
