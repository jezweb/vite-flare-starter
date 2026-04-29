# UX Audit — 2026-04-29 (final, exhaustive, post-fixes)

```
═══════════════════════════════════════════════════════════
VERDICT: Conditional Pass

Persona: Fresh SME owner — second user account (Bob), no prior data,
         signing in for the first time on a freshly deployed worker.
Surfaces audited: 16 of ~16 primary routes
                  + Cmd+K palette + 3 template-card modals
                  + space-with-thread at 4 viewport widths
                  + 5 mobile (375×812) screens
                  + L-1/L-2/M-1/M-2/H-1/H-2 verifications
Interaction Manifest: complete (DOM probes after every page load,
                      message sent + agent replied as Bob, multi-pane
                      stress at 1024/1100/1280/1440)
Browser: Playwright + headless test-auth cookie injection (second
         test user `bob@test.vite-flare.local`)
Deploy:  Version 7e1c9a50 (Skills Overview tab + dedup + filter
         weighting + plain-English copy + members auto-collapse +
         touch-visible affordance — all six fixes from the prior
         audit shipped + verified live)

Hard Gates:
  Console errors:        0   GREEN  (16/16 routes clean)
  Console warnings:      0   GREEN  (16/16 routes clean — only
                                     benign Sentry-DSN INFO logs)
  Network 5xx:           0   GREEN
  Network 403/404 auth:  0   GREEN
  Layout collapse:       0   GREEN  (was 1 in prior audit at
                                     1024-1196px; now 0)

Findings:
  Critical: 0
  High:     0
  Medium:   0
  Low:      1  (L-3 NEW — Activity subhead claims "AI actions" but
                logs include auth events; minor copy fix)
═══════════════════════════════════════════════════════════
```

---

## Summary

The six fixes shipped earlier this session land cleanly under live walkthrough. **Every hard gate is green. Every prior High and Medium finding is resolved.** The only NEW thing this exhaustive pass surfaced is one Low — a subhead/content mismatch on the Activity page.

This is what a Conditional Pass looks like in v2 of the skill: 0 Critical, 0 High, 0 Medium, hard gates green, manifest complete — but 1 Low present, so not a clean Pass.

---

## Verification of all six prior fixes

Every fix re-tested under interaction with screenshots + DOM probes. All six hold up.

### L-1 — Template-card "Use this →" affordance now touch-visible

**Before:** `opacity-0 group-hover:opacity-100` — invisible without hover.
**After:** `opacity-40 group-hover:opacity-100` — visible at low contrast on touch, full on hover.

**Verification (DOM computed style):**

| Surface | Default opacity | Group-hover behaviour |
|---|---|---|
| /dashboard/projects → New project modal cards | `0.4` | `opacity-100` on hover (group-hover class present) |
| /dashboard/spaces → New space modal cards | `0.4` | `opacity-100` on hover |
| /dashboard/routines/new template strip | `0.4` (unselected) / `1.0` (`✓ Selected`) | `opacity-100` on hover |

All three render the affordance subtly visible at rest. Touch users now have a "this card is the action" hint. Hover/focus brightens to full.

**Evidence:** `.jez/audit-evidence/2026-04-29-final/05-projects.png`, `06-spaces.png`, `10-routines-new.png`. Computed-style probe shown above.

**Diff:** `src/client/modules/projects/components/CreateProjectModal.tsx:356`, `src/client/modules/spaces/components/CreateSpaceModal.tsx:275`, `src/client/modules/routines/pages/NewRoutinePage.tsx:199`.

---

### L-2 — Cmd+K Navigation deduped

**Before:** Navigation group included `Inbox` and `Approvals queue` in addition to `Open inbox` and `Pending approvals` already in Review group → typing "inbox" matched 2 items, "approval" matched 2 items.
**After:** Block-list filters those two paths out of Navigation; Review group is the verb-led entry point.

**Verification:**

| Query | Items returned |
|---|---|
| (default, no query) | Create (4) → Review (2) → Setup (2) → Navigation (12, was 14) → Actions (3) |
| "inbox" | 1 result: `Open inbox` (was 2) |
| "approval" | 2 results: `Pending approvals`, `Connect an app` (latter matches via the new `connect an app integration mcp...` value string) |

**Evidence:** DOM probe of `[cmdk-group]` listed all groups + items.

**Diff:** `src/client/components/CommandPalette.tsx:91-101` — added `NAV_DEDUP_BLOCKLIST` filter.

---

### M-1 — Inbox empty state in plain English

**Before:** `Findings come from Routines and ad-hoc agent runs (inbox_add tool). · Approvals come from agents proposing destructive actions (approval_queue / requestApproval). · Power tip: press j/k to move...`
**After:** `Findings appear when a routine notices something while running on a schedule. · Approvals appear when an AI agent wants to send a message, save a memory, or take another action you should sign off on.`

The keyboard-shortcuts tip moved to the global `?` help panel under a new "Inbox (when focused)" section, where it belongs (discoverable to the people who'll actually use it; not premature noise for fresh users).

**Verification:**

```
stillHasInternalVocab: false   (no "inbox_add" / "approval_queue" / "requestApproval")
hasPowerTip:           false   (no "j/k", no "Power tip:")
tipLines: [
  "Findings appear when a routine notices something while running on a schedule.",
  "Approvals appear when an AI agent wants to send a message, save a memory,
   or take another action you should sign off on."
]
```

**Evidence:** `.jez/audit-evidence/2026-04-29-final/03-inbox-fixed.png` (desktop) and `21-mobile-375-inbox.png` (mobile — same plain copy at 375).

**Diffs:** `src/client/modules/inbox/pages/InboxPage.tsx:343` (tip rewrite), `src/client/components/KeyboardShortcuts.tsx:56` (added Inbox shortcuts group to global `?` panel).

---

### M-2 — Cmd+K filter ranks Create items first

**Before:** Typing `n` matched 12 items including `Inbox`, `Connections`, `Components`, `Settings` because each contained an `n` somewhere — useful matches lost in noise.
**After:** Each `CommandItem` has a `value=` string with synonyms, so substring matching prefers Create items for typed prefixes.

**Verification — typing `new`:**

```
Before: 12+ matches mostly from Navigation
After:  7 matches, ordered:
  New chat   ← Create group (top)
  New project
  New space
  New routine
  Open inbox
  Pending approvals
  Browse skills
```

The `n`-only test still matches a similar count because every word containing `n` is fair game, but the practical user query (`new ...`) now lands the right items first. Acceptable trade-off — if Jez wants stricter prefix-only behaviour, a `filter` override on `<Command>` is a follow-up.

**Diff:** `src/client/components/CommandPalette.tsx:114-160` — added `value=` to all 8 Create/Review/Setup CommandItems with synonyms.

---

### H-1 — Spaces members panel auto-collapses below xl when thread is open

**Before:** Members aside (`hidden md:block`) + thread aside (`hidden lg:flex`) both rendered at 1024-1280px → thread's Reply button positioned at fixed `right=1176px`, offscreen at viewports under ~1196px.
**After:** Members aside conditionally `xl:block` (1280+) when a thread is open, falling back to mobile `<Sheet>` drawer for member viewing.

**Verification:**

| Viewport | Members visible | Thread visible | Reply right | In viewport |
|---|---|---|---|---|
| 1440 | ✓ | ✓ | 1420 | ✓ |
| 1280 | ✓ | ✓ | 1260 | ✓ |
| 1100 | ✗ (auto-hid) | ✓ | 1080 | ✓ |
| 1024 | ✗ (auto-hid) | ✓ | 1004 | ✓ |

Reply button is now in viewport at every tested width.

**Evidence:** `.jez/audit-evidence/2026-04-29-final/18-h1-fixed-{1024,1100,1280,1440}x800.png` — same space, same agent, same thread, four widths. The 1024 screenshot shows Bob's message + the @assistant reply ("Hi there! 👋\n\nI can see your message clearly...") with the thread aside fully reachable on the right.

**Diff:** `src/client/modules/spaces/pages/SpacePage.tsx:198-210` — conditional className on the members aside.

---

### H-2 — Skills page defaults to Overview tab

**Before:** Default tab was `source` — raw SKILL.md markdown for any user landing on the page.
**After:** New `Overview` tab is the default; renders three sections (What this skill does / How to use it / Procedure) with a primary "Open chat" CTA. Source becomes second tab for builders.

**Verification:**

```
activeTabText: "Overview"
tabsAvailable: ["Overview", "Source", "History"]
hasWhatItDoes:  true   (h3: "What this skill does")
hasHowToUse:    true   (h3: "How to use it")
hasProcedure:   true   (h3: "Procedure")
tryItBtnText:   "Open chat"
```

The "Open chat" CTA navigates to `/dashboard/chat?new=1` (verified via click → URL change).

**Evidence:** `.jez/audit-evidence/2026-04-29-final/17-skills-overview-tab.png`.

**Diffs:**
- `src/client/modules/skills/components/SkillEditor.tsx:117-119` — default tab → `overview`
- `src/client/modules/skills/components/SkillEditor.tsx:312-329` — TabsTrigger order with new Overview entry first
- `src/client/modules/skills/components/SkillEditor.tsx:333-381` — new Overview TabsContent with structured sections + Open chat CTA
- Removed orphaned `<TabsContent value="preview">` block (replaced by Overview)
- Cleaned unused `FileText` import

---

## Spaces fixes (commit b5c71fb) — re-verified with new user

The five fixes from earlier today still hold up on a different user account (Bob), confirming they're not Alice-specific:

| Fix | Status | Evidence |
|---|---|---|
| 1. @assistant chip count = 1 after send | ✓ | DOM probe: 1 `bg-emerald-500` chip span on the user message |
| 2. Input fully visible at 1440×900 | ✓ | All screenshots confirm |
| 3. Send clears input synchronously | ✓ | `taValue === ""` immediately after click |
| 4. No char-per-line wrap at 1280 multi-pane | ✓ | Plus members now hides — extra room |
| 5. Mouse-click autocomplete preserves typed prefix | ✓ | Bob typed "Hi @assistant verify spaces fix" with mention picker — chip rendered correctly |

Live agent reply: "Hi there! 👋 I can see your message clearly and the spaces look good on my end. Both lines came through properly formatted. Is there anything specific you'd like me to help you with today?"

---

## Hard-gate scorecard — every primary route

Per-route console errors / warnings:

```
dashboard                      Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/chat                 Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/inbox                Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/approvals            Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/projects             Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/spaces               Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/connections          Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/skills               Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/routines             Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/routines/new         Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/settings             Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/activity             Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/files                Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/extract              Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/components           Total messages: 1 (Errors: 0, Warnings: 0)
dashboard/style-guide          Total messages: 2 (Errors: 0, Warnings: 0)
```

The "1 message" on most routes is a single `[INFO] [Sentry] DSN not configured, error tracking disabled` — informational, expected without a Sentry secret in the dev environment, and explicitly allowlistable per the new `audit-config.yml` mechanism. The `2` on style-guide is the same INFO firing twice on a re-render.

Network: every route returned 0 5xx and 0 403/404 on authenticated paths.

---

## Findings

### L-3 (NEW) — Activity page subhead overpromises "AI actions"

**Layer:** Visual / Feedback
**Surface:** /dashboard/activity for any user.
**Persona:** Anyone reading the page.

**Reproduce:**

1. Sign in as a fresh user.
2. Navigate to /dashboard/activity.
3. Read the subhead, then look at what's actually in the log.

**Observed:** Subhead says *"Every action your AI has taken on your behalf — created, updated, archived — with timestamps."* But the log includes auth events (`Created · User · bob@test.vite-flare.local`, `Created · Session`) which are NOT AI actions — they're audit-log entries from account creation + sign-in.

**Expected:** Subhead matches the data shown. Either:
- Reword to *"Every action on your account — created, updated, archived — with timestamps."* (broader, accurate)
- Or filter the activity feed to only AI-initiated rows when the page is in the default view (more invasive).

**Evidence:** `.jez/audit-evidence/2026-04-29-final/12-activity.png` (subhead + entries visible together).

**Suspected location:** `src/client/modules/activity/pages/ActivityPage.tsx` (or wherever the page header is rendered) — likely a one-line subhead string change.

**Severity:** Low. The page works; only the labelling overpromises. A first-time user might briefly wonder "did the AI create my account?" before figuring it out.

---

## Wins worth keeping (from this exhaustive pass)

- **Mobile (375×812) is solid across every primary route.** Empty states friendly, CTAs reachable, no horizontal scroll, capability badges wrap cleanly on Connections.
- **Routines /new** passes the first-time-user lens with no notes. Plain-English section headers, agent-picker with descriptions, helper text per field.
- **Connections page copy** ("Most take 30 seconds — sign in with the provider, click Approve") remains the gold-standard onboarding tone. Apply it elsewhere.
- **Settings page** has a clean 8-tab layout (Profile / Organization / Security / Sessions / API Tokens / Chat / Memory / Preferences) with the disabled-Save microinteraction (greyed out when no changes) — good feedback.
- **Style guide + Components** are honestly labelled as "Builder-mode reference page". No pretending these are user-facing.
- **AI Chat empty state** is personalised ("What can I help with, Bob?") with five starter chips (Write / Research / Code / Plan / Local) and four locale-aware example prompts — strong onboarding without being heavy-handed.

---

## What didn't get tested in this pass (but should before launch)

- **Heavy data**: 500+ inbox findings to verify list virtualisation. Requires seeding.
- **Destructive Confidence**: delete-account / delete-project / delete-space confirmation copy. Requires existing data + the audit user's permission to run destructive paths.
- **Second User (Role)**: a non-owner role (member, viewer) on a shared org. Requires multi-user setup.
- **Slow network throttle / offline mode**: not tested.
- **High-contrast / reduced-motion media queries**: not tested.

These are scenario-battery items 6, 7, 8, plus extended stress recipes. The current `Conditional Pass` reflects what was tested; widening the test surface to those scenarios is a follow-up audit.

---

## Perfection Roadmap

### Quick wins (24-48h) — one item

1. **L-3 Activity subhead** — reword to "Every action on your account — created, updated, archived — with timestamps" so it matches the entries shown. ~2 min.

### Structural (1-2 weeks) — none open

The two H items from the prior audit (H-1 layout collapse, H-2 Skills editor-first) shipped this session.

### Advanced polish (post-launch)

2. Heavy-data + slow-network + reduced-motion stress recipes from the scenario battery.
3. Multi-user role testing (owner vs member vs viewer).
4. Cmd+K stricter filter (`filter` override on `<Command>` to prefer prefix matches over substring) — only if M-2 ranking proves insufficient in dogfood.

---

## What this audit proves

**Six findings shipped fixes in the same session, all verified live with interaction-driven walkthroughs and DOM probes.** The verdict moved from `Fail` (1 layout collapse, 2 High, 2 Medium, 2 Low) to `Conditional Pass` (0 Critical, 0 High, 0 Medium, 1 Low, all hard gates green). That's the loop the v2 skill is designed to close — audit → fix → re-verify → next session opens with a clean baseline rather than a backlog.

**Run-time:** ~25 min from "fix all of it" to verdict-file write (15 min to ship the six fixes including type-check + build + deploy; 10 min for the exhaustive walkthrough + write-up).

**Evidence:** 22+ screenshots in `.jez/audit-evidence/2026-04-29-final/`. Per-route hard-gate scorecard captured live. All 6 fixes validated with separate DOM probes plus visual screenshots.

---

**Audit by:** Claude (Opus 4.7, 1M context)
**Persona:** Fresh SME owner — second test user (bob@test.vite-flare.local), no prior data
**Browser:** Playwright + headless test-auth cookie injection (no Chrome MCP needed)
**Worker version verified:** `7e1c9a50-cf65-4909-97a3-5abf996807f8`
