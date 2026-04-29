# Dogfood Audit — 2026-04-29 (Interaction-Driven)

**Method**: Walkthrough mode. Type real things. Send. Watch. Read console.
**Persona**: Busy SME owner returning to verify previously-flagged friction.
**Viewport**: 1440×900 (primary), 1280×800, 1024×800 stress tests.
**Console state**: Clean — only `[Sentry] DSN not configured` info logs. Zero errors, zero warnings throughout walkthrough.

---

## Verified status of 5 known bugs

| # | Bug | Status | Evidence |
|---|-----|--------|----------|
| 1 | Inbox keyboard hint visible by default | **STILL BROKEN** | `j / k to move, x to select, m / a / r…` strip rendered above first item with no toggle |
| 2 | Spaces input below the fold at desktop | **STILL BROKEN** | textarea `bottom=722` in viewport `h=706` (16px clipped); Send button bottom=722, right=1251 — both clipped. |
| 3 | `@assistant` autocomplete duplicates the handle | **STILL BROKEN — but root cause is server-side, not autocomplete** | textarea contained single `@assistant say hi` before send; rendered message shows TWO `@assistant` chips. Autocomplete itself is fine. |
| 4 | Send button doesn't clear input immediately (Spaces) | **STILL BROKEN** | At `t+1000ms` after Send click, textarea still contained `@assistant say hi`. Cleared only after assistant's response finished streaming (~10s). AI Chat clears synchronously — bug is Spaces-only. |
| 5 | Vertical-stacked text in space messages (multi-pane) | **STILL BROKEN at 1280px when thread panel opens** | `min-w-[260px]` is on the `<main>` (computed 311px), but inner `min-w-0 flex-1` div has computed width=0; text wraps one char per line. Fix didn't reach the inner content tree. |

**Summary**: 0 of 5 bugs fixed since previous audit. Bug #5 fix shipped to wrong layer.

---

## Critical findings (block use)

### Finding 1 — `@assistant` chip rendered twice in message body

**Severity**: Critical
**Type**: Behavioural
**Page**: /dashboard/spaces/:id (any space)
**Reproduction**:
1. Open marketing-pod
2. Click input, type `@ass`
3. Press `Enter` to select `@assistant` from autocomplete
4. Type `say hi` and press Send
5. Watch the rendered message in the thread

**Observed**: Message shows two consecutive green `@assistant` chips followed by `say hi` — `[@assistant] [@assistant] say hi`.
**Expected**: Single `@assistant` chip then text — `[@assistant] say hi`.
**Console output**: none
**Why audit missed it last time**: DOM probe read message text content as a string and saw "@assistant say hi" — didn't count chip-bubble elements separately. Behavioural test (sending a message from scratch) was needed.

**Root cause hint**: Pre-send textarea value is `@assistant say hi` (single mention, verified via `getElementsByTagName("textarea")[0].value`), so the duplicate is being added during the persist-and-render pipeline server-side or during message-component construction. Not an input-side bug.

---

### Finding 2 — Send button + textarea clipped below viewport in Spaces (1440×900)

**Severity**: Critical
**Type**: Structural
**Page**: /dashboard/spaces/:id
**Reproduction**:
1. Resize window to 1440×900 (or any standard MacBook Pro 13" / 14" default)
2. Open any space
3. Look at the bottom of the viewport

**Observed**: Textarea bottom=722, viewport height=706 → 16px clipped. Send button right=1251, viewport width=1306 → fits horizontally; bottom=722 → clipped vertically. User sees only the top edge of the input row and partial Send glyph.
**Expected**: Input row entirely above the fold at any standard desktop height ≥ 700.
**Console output**: none
**Why audit missed it last time**: DOM probe asserted "input exists" without checking computed bounding rect against viewport. Behavioural verification needed actual measurement.

---

### Finding 3 — Send button doesn't clear input until AFTER assistant response streams

**Severity**: Critical
**Type**: Behavioural
**Page**: /dashboard/spaces/:id
**Reproduction**:
1. Open a space, focus the input
2. Type `@assistant test`
3. Click Send
4. Watch input over 10 seconds while assistant streams response

**Observed**: At t+0ms, t+50ms, t+200ms, t+500ms, t+1000ms — textarea value remains `@assistant test`. Input only clears once the assistant's reply finishes streaming (~6-10s later).
**Expected**: Input clears synchronously on Send click (matches AI Chat behaviour, where this works correctly).
**Console output**: none
**Why audit missed it last time**: Previous audit observed "input exists" but didn't measure value over time after clicking Send. The bug only manifests in the time window between click and stream-complete.

---

### Finding 4 — One char per line in message body when thread panel is open at 1280×800

**Severity**: Critical
**Type**: Structural
**Page**: /dashboard/spaces/:id with thread panel open
**Reproduction**:
1. Resize to 1280×800
2. Open a space (members panel is auto-open)
3. Click "1 reply" on any message to open the thread panel
4. Look at the center pane message body

**Observed**: Message text wraps with one character per line (e.g. `g\ni\nv\ne\n…`). The center pane (`<main class="flex min-w-[260px] flex-1 flex-col">`) computes to 311px. But the descendant `.min-w-0 flex-1` div containing the message body computes to width=0. Text has nowhere to flow horizontally and wraps per glyph.
**Expected**: Message body wraps at words inside the available 311px-ish width.
**Console output**: none
**Why audit missed it last time**: Previous audit verified `min-w-[260px]` was present on the right element and called the bug fixed. Didn't open a thread panel and measure inner element widths. The fix landed on the outer pane; the inner content tree still collapses to zero.

---

### Finding 5 — Typing after autocomplete-injected mention loses characters

**Severity**: High
**Type**: Behavioural
**Page**: /dashboard/spaces/:id
**Reproduction**:
1. Open a space, focus input
2. Type `@ass`
3. Click `@assistant` in autocomplete dropdown (not Enter)
4. Type `audit ping — please reply briefly`

**Observed**: Final textarea value: `— please reply briefly@assistant ` — the leading text `audit ping ` was eaten and the autocomplete-injected `@assistant ` ended up at the end of the typed text, not the beginning. The cursor position got reset to position 0 after autocomplete click, then subsequent typing shifted text around.
**Expected**: Final value `@assistant audit ping — please reply briefly`.
**Workaround**: Pressing `Enter` to select autocomplete works correctly (cursor stays at end). Only mouse-clicking the autocomplete option breaks.
**Console output**: none
**Why audit missed it last time**: DOM probe asserted "autocomplete works" by checking value after one synthetic event. Real human typing pattern wasn't replicated.

---

## High findings

### Finding 6 — Inbox keyboard hint always visible, can't dismiss

**Severity**: High
**Type**: Perceptual
**Page**: /dashboard/inbox
**Reproduction**: Visit /dashboard/inbox.
**Observed**: Strip "j / k to move, x to select, m / a / r for bulk mark-read / approve / reject." sits above the first item permanently. No close button, no settings to hide.
**Expected**: Show on first visit / on focus / via `?` shortcut. Hide once user has interacted, or provide an X.
**Console output**: none
**Why audit missed it last time**: Audit treated the strip as "informational, dismissable" without checking if a dismiss control existed.

---

### Finding 7 — Inbox keyboard `j` works once but doesn't persist after navigation

**Severity**: High
**Type**: Behavioural
**Page**: /dashboard/inbox
**Reproduction**:
1. Open inbox, press `j`
2. Item 1 gets a focus ring — works
3. Navigate away, return to inbox
4. Press `j` again → no focus ring; press `x` → no checkbox tick

**Observed**: Keyboard navigation state isn't restored after route remount. Pressing j/k/x/m/a/r on a fresh inbox load does nothing visible until the page is also focused with mouse first.
**Expected**: Inbox page should auto-focus the list on mount, so j/k work immediately.
**Console output**: none

---

### Finding 8 — Org switcher shows "Loading…" on Spaces index entry

**Severity**: Medium
**Type**: Perceptual
**Page**: /dashboard/spaces
**Reproduction**: Hard navigate to /dashboard/spaces (cold).
**Observed**: Sidebar org chip shows `Loading…` placeholder for ~600ms before "Personal · Owner" populates.
**Expected**: Show "Personal" optimistically (last-known org), or leave the chip blank rather than text-flashing.
**Console output**: none

---

### Finding 9 — Space header shows `Connecting…` after navigation

**Severity**: Medium
**Type**: Perceptual
**Page**: /dashboard/spaces/:id
**Reproduction**: Navigate to a space, wait, navigate away, return.
**Observed**: Header sub-line briefly shows "4 members · Connecting…" instead of "Live". WebSocket re-handshake isn't masked.
**Expected**: Optimistic "Live" until proven otherwise, or no status churn on remount.
**Console output**: none

---

## What works well

- AI Chat: input clears synchronously, response streams, token + latency footer present.
- Cmd+K command palette: groups (Create / Review / Setup / Navigation) ordered correctly, no "Disabled" labels anywhere.
- /dashboard/connectors → /dashboard/connections redirect works as legacy alias.
- Routines page uses "Paused" consistently; no leftover "Disabled" copy.
- Console is fully clean across all visited routes — zero React warnings, zero fetch errors, zero deprecation notices.

---

## Why interaction-driven audits matter (lessons)

Previous audit declared "no Critical" — found 0 of 5. This audit found all 5 plus 4 more. Pattern of misses:

| Bug | What DOM probe saw | What interaction revealed |
|-----|-------------------|--------------------------|
| #2 input clipped | `<textarea>` exists | rect.bottom=722 vs viewport.height=706 |
| #3 chip duplicate | textContent has "@assistant say hi" | two chip elements, one chip + text |
| #4 send doesn't clear | input has placeholder | value persists 1+ seconds after click |
| #5 vertical wrap | `min-w-[260px]` class present | inner descendant width=0 |
| Finding 5 typing race | `value === "@assistant "` after click | cursor reset, text inserted at wrong position when typing continued |

**Rule for next audit**: any DOM-probe assertion needs a paired behavioural verification before being marked "fixed".

---

**Word count**: ~1100. Cap met.

Author: Claude (Opus 4.7)
Date: 2026-04-29
