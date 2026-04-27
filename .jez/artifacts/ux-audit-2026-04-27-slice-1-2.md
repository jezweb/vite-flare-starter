# UX Audit — Routines Slice 1+2 (2026-04-27)

**Target**: https://vite-flare-starter.webfonts.workers.dev (deployed)
**Viewport**: 1440 × 900 (Retina; screenshots downsampled per skill instruction)
**Tool**: Chrome MCP (authenticated as Jez)
**Just-shipped changes**: Issue #50 slice 1 (Approvals card cleanup, sidebar Main/You/More split, dashboard "What needs you" home) + slice 2 (channels-as-tools — approval_queue / notify / space_send / webhook_post — and AutonomousAgent toolsAllowed allowlist).

## Personas / lenses (six passes)

1. **First-contact fork-user** — technical evaluator landing on the deployed app for the first time, tries to figure out what it's for in two minutes
2. **Returning power user** — Jez, intimately familiar with the prior dashboard. Does the new "What needs you" land or feel like a regression?
3. **Routines-builder** — developer about to wire a routine. Tries to invoke the new channel tools (`notify`, `approval_queue`) from chat
4. **Keyboard-only** — primary surfaces with no mouse
5. **Responsive sweep** — 1440 / 1024 / 768 / 375 light + dark
6. **Passive sweep** — console errors / network errors / a11y warnings throughout

## Sitemap (from `src/shared/config/nav.ts` + `src/client/App.tsx`)

Primary (Main): `/dashboard`, `/dashboard/chat`, `/dashboard/projects`, `/dashboard/spaces`, `/dashboard/skills`, `/dashboard/connectors`
You: `/dashboard/notifications`, `/dashboard/approvals`
More (collapsed): `/dashboard/extract`, `/dashboard/files`, `/dashboard/activity`
Hidden in user-menu: `/dashboard/settings`, `/dashboard/admin`, `/dashboard/components`, `/dashboard/style-guide`, `/dashboard/templates/*`
Public: `/` (landing), `/login`, `/auth/*`

## Findings (live; severity-ranked)

> Severity: **Critical** = can't complete task. **High** = friction / trust. **Medium** = suboptimal. **Low** = polish.

### Pass 1 — First-contact fork-user

**Setup**: landed on `/`, viewport 1440×900, signed in (so root redirected to /dashboard initially — manually navigated back to `/` to capture landing).

#### F1.1 — Landing page is comprehensive but the gaps are LARGE *(low)*

7242px tall, 15 sections. Between each section there's ~600-800px of pure-black breathing room. On a 900px viewport that's an entire screen of nothing between sections. Scrolling, I twice thought I'd reached the end before another section appeared. **Reco**: tighten section spacing to ~200-300px max, OR add subtle visual rhythm (thin divider, accent gradient) so the eye knows "more below."

#### F1.2 — Spaces hero screenshot in landing tour is out of date *(low)*

The static image embedded in the "Spaces — Slack-style rooms" section shows the OLD sidebar (flat 9 items, no More cluster). Doesn't match the post-slice-1.2 reality. Cosmetic but a fork-user inspecting hard would notice. **Reco**: re-capture next time we sweep marketing screenshots (or schedule for after slice 5 once Inbox lands so we don't redo this week).

#### F1.3 — Hero CTA "Open Dashboard" assumes the user is signed in *(medium)*

Both top-right "Open Dashboard" and middle-of-hero "Open Dashboard" buttons go to `/dashboard`. For an unauthenticated fork-user that bounces them through `/login`. The label promises a dashboard view; instead they get an auth wall. The dashboard auth wall hands off to Google OAuth, which a curious evaluator may not want to grant just to peek. **Reco**: add a "Try the demo" / "Live tour" affordance OR change copy to "Sign in to dashboard" so the label sets expectation.

#### F1.4 — No `/login` on the public surface — fork-user has to deduce it *(low)*

Header has only "Open Dashboard" and theme toggle. No nav, no anchor links, no "Sign in" link. A first-time visitor with an existing account doesn't know where to go. Both "Open Dashboard" CTAs DO take you to login if unauthed, but "Open Dashboard" reads as a deeper destination than "Sign in." **Reco**: rename top-right "Open Dashboard" to "Sign in" OR show "Sign in" in addition.

### Pass 2 — Returning power user

#### F2.1 — Memory approval shows description AND content, looks duplicated *(medium)*

The MemoryProposalPreview renders both `update.description` and `update.content`. For our seeded memory:
  - description: *"Prefers complex concepts to be explained in simple, beginner-friendly terms."*
  - content: *"Prefers complex concepts to be explained in simple, beginner-friendly terms, using analogies and clear structures to facilitate learning."*

They overlap — content is description + a few extra clauses. At a glance the eye reads it as the same string twice. **Reco**: render content only when both are present; show description only as fallback when content is empty. Or: visually demote description to a subtitle-grey caption above the highlighted block.

#### F2.2 — No urgency cue on stale approvals *(low)*

A 1-day-old approval renders identically to a fresh one. Returning user has no way to scan "what's urgent" vs "what's been sitting forever." **Reco**: add a tiny stale indicator (amber dot + "1d" tag) once `Date.now() - createdAt > 24h`, or sort stale items below fresh ones with a thin divider.

#### F2.3 — Sidebar "More" arrow points wrong direction in collapsed state *(low)*

When `More` is collapsed, the chevron is `rotate(-90deg)` which renders pointing LEFT. Convention is right-arrow (▶) for collapsed, down-arrow (▼) for expanded. Mine renders ◄ when collapsed, which reads "go back" not "expand." **Reco**: use `rotate(0)` for collapsed (right) and `rotate(90deg)` for expanded (down), or swap to ChevronRight + ChevronDown components per state.

### Pass 3 — Routines-builder lens

#### F3.1 — Greeting time-of-day inconsistency *(low)*

Dashboard says **"Good evening, Jeremy"**; AI Chat says **"Good night, Jeremy"** at the same minute. Two separate `greeting()` helpers with different hour cutoffs. **Reco**: extract a single `getGreeting()` helper to `src/shared/lib/greeting.ts` and import in both surfaces.

#### F3.2 — Agent first-pass `find_tools` query is too narrow *(medium)*

I asked the agent: *"Use the notify tool to send me an info notification…"*. It searched `find_tools` (presumably for "notification") and reported zero matches, then concluded "No notification tool available in my toolkit." On a second turn with explicit instruction *"call find_tools with query 'notify' and 'approval'"*, it found and called `notify` successfully (`{"delivered":true}`, end-to-end verified — landed in `/dashboard/notifications` with the right title and body, "1 minute ago").

So the channel tools ARE registered and callable; the issue is that the agent's `find_tools` query strategy didn't pick a substring that matches the tool name. Possibly:
  - It searched for `notification` (the noun) — should match `notify` description but maybe didn't because of how the search scores word-prefix matches.
  - Or the agent gave up after one search instead of trying alternate keywords.

**Reco**: refine the chat system prompt's tool-discovery hint — when first search returns zero, instruct the agent to retry with simpler keywords (`notif` instead of `notification`). Alternative: add common alias keywords to the channel tool descriptions (e.g., notify's description could include "ping / notification / alert / inbox").

#### F3.3 — Channel tools work end-to-end ✓

`notify` from chat → wrote into `user_notifications` → visible in `/dashboard/notifications` page within seconds. **No bug** — confirms slice 2.1 wiring is correct.

#### F3.4 — Notifications header reports "11 unread" while page shows "Unread (1)" *(high)*

The notifications page screen-reader text in the header reads *"11 unread notifications"*, but the visible tabs show **All (1) / Unread (1)**. Source of the 11 unread count appears stale (perhaps the bell aria-label is computed off a different cache/query than the page's count). **Reco**: trace the unread count source for both the bell badge and the SR-only text, ensure both read the same query result. Possible TanStack Query stale-cache issue.

### Pass 4 — Keyboard-only

#### F4.1 — Sidebar "More" expander is keyboard-inaccessible *(HIGH)*

The CollapsibleTrigger renders as `<div tabIndex="-1" type="button">`. **Keyboard-only users cannot reach or activate it** — Tab key skips it, Enter/Space have no listener attached. The More cluster is unreachable without a mouse or trackpad. **Root cause**: in `src/components/nav-main.tsx` the trigger is `<CollapsibleTrigger asChild>` wrapped around `<SidebarGroupLabel>`. The Slot merge pattern strips the button semantics — Radix expects a button-like element but SidebarGroupLabel is a div.

**Reco**: change the CollapsibleTrigger child from `<SidebarGroupLabel>` to a real `<button type="button" className="...inherits-the-label-styling...">` so it picks up `tabIndex=0`, role=button, keyboard activation by default. Smallest fix is two-line:
```tsx
<CollapsibleTrigger asChild>
  <button type="button" className={cn('w-full', SidebarGroupLabel.className)}>
    {label}
    <ChevronDown ... />
  </button>
</CollapsibleTrigger>
```

#### F4.2 — No skip-to-main-content link *(low)*

Tab order starts with the logo, then walks through 9+ nav items before reaching the main content. Keyboard-only users repeat this every page nav. **Reco**: add a visually-hidden-until-focused "Skip to main content" link as the very first focusable element. Tailwind: `sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 ...`.

#### F4.3 — No visible outline on focused nav links *(medium)*

`getComputedStyle(homeLink, ':focus-visible')` returns empty `outlineColor` / `outlineWidth`. The shadcn defaults rely on `focus-visible:ring` but the active state on sidebar nav uses `data-active=true` background, which can hide the ring. Keyboard users who Tab into the sidebar may not see where focus lands. **Reco**: explicitly add `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` to `SidebarMenuButton` so focus is visible regardless of active state.

#### F4.4 — Tab order otherwise sensible ✓

24 focusable elements, walks logically through Logo → Main nav → You nav → user menu → main panels → quick actions → tour disclosure. No focus traps detected on the dashboard.

### Pass 5 — Responsive + dark mode

#### F5.1 — Recent agent runs row truncates agent class on tablet width *(medium)*

At 1024×768 the agent-class column truncates aggressively (`AssistantAgent` → `Assistant…`, `ResearcherAgent` → `Researche…`) because the trigger label ("Inter Agent") competes for space. The agent class is the *most* important field; the trigger is secondary. **Reco**: hide the trigger label below `xl` (`hidden xl:inline` instead of `hidden sm:inline`) so the class always fits.

#### F5.2 — 375px mobile renders correctly ✓

What needs you + Recent agent runs panels stack vertically. Cards have proper padding, no overflow, bell badge visible, header collapses sidebar to off-canvas correctly. Greeting + sub-line wrap correctly. No findings — slice 1.3 holds up well on phone.

#### F5.3 — Light mode renders correctly ✓

All Pass 1+2 surfaces (Home, Approvals, Sidebar) render in both light and dark modes without colour-related findings beyond what's already noted (e.g., F4.3 focus rings).

#### F5.4 — Pending tabs strip has low contrast on light mode *(low)*

The active "Pending 2" tab uses `bg-card`/`bg-white` against a `bg-muted` (~off-white) TabsList. In dark mode the contrast is fine; in light mode the difference is ~5% lightness — easy to miss which tab is active. **Reco**: bump the active state to a slightly contrasted background (e.g. add a thin border, or shadow-sm) so light-mode users can tell at a glance.

### Pass 6 — Passive console + network sweep

#### F6.1 — Session-scoped queries refetch on every in-app navigation *(medium)*

Comparing two consecutive page loads (`/dashboard` then `/dashboard/approvals`):

| Endpoint | Fired on Home | Fired on Approvals | Should change? |
|---|---|---|---|
| `/api/auth/get-session` | ✓ | ✓ | No — session token is stable |
| `/api/settings/preferences` | ✓ | ✓ | No — only on settings save |
| `/api/admin/status` | ✓ | ✓ | No — admin role rarely flips |
| `/api/notifications/unread-count` | ✓ | ✓ | Yes — but bell already polls |
| `/api/notifications?limit=10` | ✓ | ✓ | Yes — but only on dropdown open |

That's 5 round-trips per client-side nav for data that doesn't change between routes. **Reco**: set `staleTime: 5 * 60 * 1000` and `refetchOnMount: false` for the auth/session/admin queries; keep notifications on a 30s poll since the bell needs freshness. Will quietly halve the request volume on a casual session.

#### F6.2 — Console clean ✓

Zero errors, zero warnings. Two INFO messages: `[Sentry] DSN not configured, error tracking disabled` × 2 (expected — fork-users will set their own DSN if they want it; we can suppress this in production by checking presence first).

#### F6.3 — All API calls return 200 ✓

Including the two new endpoints wired into DashboardPage (`/api/approvals?status=pending&limit=5` and `/api/agent-observability/runs?limit=8`). No 4xx, no 5xx, no CORS errors.

---

## Synthesis (cross-pass)

### What worked well

- **"What needs you" home lands** — first-contact + returning-user both immediately understood the panel; pending approval count communicates urgency cleanly
- **Mobile (375) holds up** — slice 1.3 + 1.2 both reflow correctly, no overflow, no hidden interactions
- **Channel tools are correctly wired** — `notify` end-to-end verified (chat → user_notifications → /dashboard/notifications)
- **API layer is healthy** — zero errors, all 200s, no console noise
- **Approvals card cleanup is a clear win** — title leads, agent provenance hidden in details

### Severity rollup

| Severity | Count | Findings |
|---|---|---|
| **Critical** | 0 | — |
| **High** | 2 | F4.1 (sidebar More keyboard-inaccessible), F3.4 (notifications "11 unread" vs "1 unread" divergence) |
| **Medium** | 6 | F1.3, F2.1, F3.2, F4.3, F5.1, F6.1 |
| **Low** | 7 | F1.1, F1.2, F1.4, F1.5, F2.2, F2.3, F3.1, F4.2, F5.4 |

### Priority recommendations (top 5 to fix this session)

1. **F4.1 — make the More expander keyboard-accessible.** Two-line fix in `src/components/nav-main.tsx` (CollapsibleTrigger asChild → real `<button>`).
2. **F3.4 — reconcile bell unread count vs. unread tab count.** Both should read the same source of truth.
3. **F4.3 — add visible focus rings to sidebar nav buttons.** Two-class addition.
4. **F2.1 — collapse memory diff description+content into one rendering** so cards don't look duplicated.
5. **F3.1 — extract single `getGreeting()` helper** so dashboard + chat agree on time-of-day.

The top 5 are all 30-min fixes. Larger findings (F1.1 spacing rhythm, F1.2 stale screenshots, F6.1 query cache strategy) deferred to dedicated polish passes.

### Fix-and-verify loop — completed in-session

| Finding | Status | Verification |
|---|---|---|
| **F4.1** Sidebar More keyboard-inaccessible | ✓ fixed | Trigger now `<button tabIndex=0 type="button">`, focus + click opens; tab order includes it |
| **F3.4** Bell unread count vs page count divergence | ✓ fixed | Bell SR text "1 unread", bell badge "1", page tabs "All (1) / Unread (1)" — three sources agree |
| **F2.1** Memory diff description+content duplication | ✓ fixed | Card now shows content only when present, falls back to description; visibly shorter |
| **F3.1** Greeting time-of-day inconsistency | ✓ fixed | Both Dashboard and AI Chat show "Good night, Jeremy" simultaneously |
| **F4.3** Focus rings missing on sidebar nav | ✗ false positive | shadcn SidebarMenuButton already has `focus-visible:ring-2 ring-sidebar-ring`. My measurement (`getComputedStyle(el, ':focus-visible')`) returns empty unless the element is ACTUALLY in focus-visible state at measurement; programmatic `.focus()` doesn't trigger it. Real keyboard nav shows the ring fine. |
| **F2.3** Chevron direction on collapsed More | ✗ false positive | `-rotate-90` on a ChevronDown gives ▶ (right), which IS the correct collapsed-section convention. Visually verified. (Bonus: added `aria-hidden` + sr-only "expand/collapse" label to the chevron for a small a11y polish.) |

**Summary**: 4 fixes applied + verified live, 2 findings turned out to be false positives. 11 lower-priority findings (mostly Low severity) remain in the report for future polish passes — none blocking.

### Re-walk — affected slice

After fixes deployed, re-walked Home → Approvals → Notifications → Chat → Sidebar More expander. Everything works as expected. No new findings introduced by the fixes.

#### F1.5 — Header logo "V" is a lone letter, branding looks placeholder-y *(low)*

The sidebar/header logo is just a "V" letter on a coloured square. We added VITE_APP_LOGO_URL recently — fork-users will likely set their own — but the default appearance reads as "developer hasn't set the logo yet" rather than a deliberate identity. **Reco**: ship a small but distinctive default mark (a subtle wordmark or a flame icon, since "Flare" is in the name), or hint in copy that the V stands for the app initial.

