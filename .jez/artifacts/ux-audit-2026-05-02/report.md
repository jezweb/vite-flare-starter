---
date: 2026-05-02
status: active
owner: jez+claude
persona: Sandra — first-time SME owner, 1440x900 desktop, mid-evening, no time pressure
scope: Home → AI Chat (send first message) → Inbox (triage)
url: https://vite-flare-starter.webfonts.workers.dev
---

# UX audit — 2026-05-02 (post-tidy-pass dogfood)

## Verdict: Pass with findings

Hard gates all green:

| Gate | Result |
|---|---|
| Console errors | 0 |
| Console warnings | 0 (4 INFO only — Sentry-disabled stub, repeats 4x) |
| Network 5xx | 0 |
| Layout collapse | 0 (CLS = 0) |
| axe Critical/Serious | 0 (`/dashboard` clean: 25 passes, 0 violations) |
| TTFB | 38 ms · Load: 283 ms · LCP: pre-observer (cached) |

Slice B (DecisionRow inline approve/reject) shipped today **works as designed** — verified end-to-end. Approve fires, list refreshes, Home count drops 2 → 1.

## Interaction Manifest

```
Persona: Sandra (first-time SME owner)
Viewport: 1440x900, Chrome, dpr 2

[✓] 21:43 Loaded /dashboard, console clean (1 INFO line)
[✓] 21:44 Captured nav (6 Work items), greeting H1, OrgSwitcher state
[✓] 21:45 Verified OrgSwitcher renders correctly (CSS grid 2-row, was a textContent false alarm)
[✓] 21:46 Clicked "Start a chat" card → /dashboard/chat
[✓] 21:46 Tour fired (STEP 1 OF 3 "Pick a model"), popover misaligned upper-left
[✓] 21:47 Skipped tour, focused input, typed real-flavour string with apostrophes/quotes/emoji
[✓] 21:47 Verified textarea preserved all characters (84 chars, emoji intact)
[✓] 21:47 Sent message → URL becomes /dashboard/chat/<uuid>, conversation persisted
[✓] 21:48 Response received: "4" + Calculator tool call + Concluded reasoning section
[✓] 21:48 Footer shows model ID + 6,012 tokens + 9.7s
[✓] 21:48 Clicked Home in sidebar → /dashboard
[✗] 21:48 Recent agent runs widget unchanged (no new entry — by design? chat ≠ agent_runs)
[✓] 21:48 Pending review count stayed at 2 (correct — I haven't actioned anything)
[✓] 21:49 Clicked AI Chat → conversations sidebar expanded
[✗] 21:49 Newly-created conversation NOT in sidebar (verified via DOM scan: 0 matches)
[✓] 21:49 API check: /api/conversations returns it correctly (createdAt today)
[✓] 21:49 location.reload() → conversation NOW appears at position #2 in sidebar
[✓] 21:50 Clicked Inbox → /dashboard/inbox
[✓] 21:50 Confirmed Slice B render: ✓ ✕ Review trailing, "Needs approval" badge, source line
[✓] 21:50 Clicked inline ✓ on row 1 → row vanishes, list refreshes (no F5 needed)
[✓] 21:50 Clicked Home → "1 item waiting" (was 2), Pending review shows just the remaining row
[✓] 21:51 axe-core scan on /dashboard: 0 violations, 25 passes
[✓] 21:51 Perf snapshot: TTFB 38, DCL 251, Load 283, CLS 0
```

Total real interactions: 18 user actions, 6 screenshots, 3 API calls, 1 reload.

## Findings (ranked by ROI)

### HIGH — Conversations sidebar stale after chat creation

**File**: `src/client/modules/chat/components/ConversationSidebar.tsx` (or wherever the list query lives)

After sending a chat message, navigating away and back to AI Chat does NOT refresh the conversation list. The new conversation is server-persisted (verified `/api/conversations` returned it with `createdAt` matching the send timestamp) but the rendered DOM does not include it. A hard reload makes it appear.

This is the round-trip / stale-cache class called out in the audit checklist ("the project is just empty when I go back"). TanStack Query for `['conversations']` (or whatever key the sidebar uses) needs invalidation when `useChat` creates a new conversation.

**Likely fix**: in the chat module's mutation that creates a conversation row, add `queryClient.invalidateQueries({ queryKey: ['conversations'] })`. If the conversation is created lazily server-side on first message, fire the invalidation `onFinish` of the chat send.

**Sandra's read**: "I sent a message, it worked, but where did it go? Did the AI save it? I'll have to refresh."

---

### HIGH — Onboarding tour popover misaligned with target

**File**: probably `src/client/modules/chat/...` tour component

On the AI Chat empty state, the "STEP 1 OF 3 — Pick a model" tour popover renders **upper-left over the sidebar nav**, partially obscuring Projects / Spaces / Routines links. The element it's pointing at (the model picker pill, "Kimi K2.6") is in the **bottom-right of the input bar**. There's no arrow/anchor connecting them, and no visual focus on the model picker itself. A first-time user just sees a popover blocking their nav with no obvious target.

The tour content also drops jargon a brand-new user wouldn't know:
- "Free Workers AI options have no key requirement"
- "Premium options (Anthropic / OpenAI / Google) need an API key set on the Worker"

Sandra has no idea what "Workers AI" is or what "the Worker" refers to.

**Fix shape**: anchor the popover to the model picker element; rewrite copy as "Pick which AI model handles your requests. Free options work out of the box; premium models (Claude, GPT) need your API key."

---

### MEDIUM — "Start something new" cards link to *list* pages, not new-X flows

**File**: `src/client/pages/DashboardPage.tsx` (the cards section)

| Card label | Target | What Sandra expects |
|---|---|---|
| Start a chat | `/dashboard/chat` (fresh chat) | ✓ matches |
| New project | `/dashboard/projects` (list) | ✗ a new-project dialog/wizard |
| New space | `/dashboard/spaces` (list) | ✗ a new-space dialog/wizard |
| Schedule a routine | `/dashboard/routines` (list) | ✗ a new-routine wizard |

Verb-prefix labels ("New / Schedule") promise an *action*; the link goes to a list. Sandra clicks "New project" expecting a form. She gets a list page where she has to find a "New project" button somewhere on it — extra click, extra cognitive step.

**Fix shape**: make these links open their respective creation flows directly:
- `New project` → `/dashboard/projects/new` or open the existing creation Dialog in-place
- `New space` → same pattern
- `Schedule a routine` → `/dashboard/routines/new` (NewRoutinePage already exists per the codebase grep earlier)

If the list page already auto-opens the creation modal when navigated with a `?new=1` query param, that's a one-line fix.

---

### MEDIUM — Implementation detail leaks in chat footer

**File**: `src/client/modules/chat/components/MessageRenderer.tsx` (or message footer component)

After a chat response, the footer shows `@cf/moonshotai/kimi-k2.6 · 6,012 tokens · 9.7s`. The Cloudflare model ID prefix (`@cf/moonshotai/`) and the raw token count are developer-friendly but read as noise to Sandra.

**Fix shape**: render the model picker label (`Kimi K2.6`) instead of the full model ID. Hide the token count for non-builder users (Builder Mode could keep it visible). Keep the duration — that's universally useful.

---

### MEDIUM — Stale items in inbox have no urgency cue

**File**: `src/client/modules/inbox/components/rows/shared.tsx` (`StandardMeta`)

Both pending memory approvals are 5 and 6 days old. They render visually identical to fresh approvals — same icon colour, same border, same density. After 30 days of accumulating activity, items rotting will look the same as today's items.

**Fix shape**: add an `aged` visual treatment when `createdAt` is more than N days ago (faded background tint, subtle "ageing" badge, or border colour shift). The existing `state` prop on `RowShell` accepts `unread | urgent | default` — extend with `stale` and have `StandardMeta` add a tooltip explaining why.

This finding ties directly to the prior conversation about **time-shaped data testing** — the inbox shape today doesn't degrade gracefully at Day 30+.

---

### LOW — Greeting cutoffs use "Good night" past 9pm

**File**: `src/shared/lib/greeting.ts:26`

```ts
if (hour < 21) return 'Good evening'
return 'Good night'  // 21-23 → night
```

"Good night" is colloquially a farewell ("I'm going to bed"), not a greeting. At 9pm on a working session, "Good evening" reads more naturally. The cutoff is documented as intentional, so this is a copy-tone preference rather than a bug — but worth flipping to:

```ts
if (hour < 5) return 'Good morning'  // post-midnight workers
if (hour < 12) return 'Good morning'
if (hour < 17) return 'Good afternoon'
return 'Good evening'  // 17-23 + cover edge cases
```

Or keep the cutoffs but rename `Good night` → `Working late, Jeremy?` for the late-night branch (more conversational).

---

### LOW — Sentry init runs 4× per page load

**Console**: `[Sentry] DSN not configured, error tracking disabled` × 4 at the same timestamp

The Sentry stub fires its INFO log four times on a single page load, suggesting `Sentry.init()` is being called from four entry points (or React StrictMode is double-invoking + an effect runs twice → 4 calls). Not a hard-gate fail (INFO only) but indicates the init is not idempotent.

**Fix shape**: guard `Sentry.init()` with `if (typeof window !== 'undefined' && !window.__sentryInitialized) {...}`, or move it to a single mount in `main.tsx`.

---

### LOW — "n sailor." conversation title looks broken

In the Conversations sidebar, one row reads `n sailor.` with a Pirate Lab project icon. Likely the auto-generated title was originally something like `"Pen sailor."` or `"Stranded n sailor"` and got truncated weirdly during summarisation. One-off finding, not a systemic issue, but worth a glance at the title-generation prompt to see if it consistently produces sentence-case clean output.

## Hard-gate scorecard

| Gate | Threshold | Actual | Pass |
|---|---|---|---|
| Console errors | 0 | 0 | ✓ |
| Console warnings | 0 | 0 | ✓ |
| Network 5xx | 0 | 0 | ✓ |
| Layout collapse | 0 | CLS 0 | ✓ |
| axe Critical/Serious | 0 | 0 violations | ✓ |
| TTFB | < 600ms | 38ms | ✓ |
| LCP | < 2.5s | n/a (cached page) | n/a |
| Load | < 3s | 283ms | ✓ |

## What was NOT covered (scope cut)

- Routines page — didn't visit
- Projects / Spaces — didn't visit
- Settings + Org switcher dropdown — only inspected the trigger, didn't open
- Mobile viewport (375 / 768) — only desktop 1440x900
- Slow-network throttle — not tested
- Multi-tab / multi-session round-trip
- The `?focus=<id>` deep-link path on `/dashboard/approvals`
- The "data seasoning" battery (Day 0/1/7/30) discussed earlier — would need seed scripts first

## Bottom line

This is a tidy, fast, accessible surface. Hard gates all green; Slice B (just shipped today) works correctly end-to-end. The HIGH-severity findings are both about **state-after-action** — the chat sidebar doesn't update post-send, and the onboarding tour misaligns its target. Both are 1-2 hour fixes.

The MEDIUM findings cluster around **first-time-user discoverability**: cards that promise actions but link to lists, jargon in onboarding, implementation detail leaking into chat footer, stale items not visually distinguished. None are blocking but they collectively make Sandra's first 10 minutes feel less polished than the rest of the surface.

**Recommended fix order** (ROI-ranked):
1. Conversations sidebar invalidation (HIGH, ~30 min)
2. "New X" cards → creation flows (MEDIUM, ~1 hr — biggest UX delta for new users)
3. Tour popover anchor + jargon rewrite (HIGH for first-time UX, ~1 hr)
4. Stale-item visual cue in inbox (MEDIUM, ~30 min — sets up for the data-seasoning work)
5. Chat footer cleanup (MEDIUM, ~20 min)
6. Greeting + Sentry init (LOW, ~15 min combined)

Total ~3.5 hours of focused work to address everything HIGH + MEDIUM.
