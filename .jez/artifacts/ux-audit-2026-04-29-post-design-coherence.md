# UX Audit — 2026-04-29 (post Phase 0–6 design coherence ship)

**Site:** https://vite-flare-starter.webfonts.workers.dev
**Persona:** First-time user, just signed in. Has heard "AI workspace",
no prior knowledge of the platform internals. Tech comfort: medium
(uses Notion + Slack daily, not a developer).
**Method:** Live signed-in walkthrough via Chrome MCP. Walked Home →
Inbox → Connections → Skills → Settings → Admin → Organisation →
Files → Extract → Routines → Components → Style guide → Activity →
Chat. Builder Mode toggled on; sidebar verified end-to-end. Mobile
spot-check at ~600px.
**Goal:** Verify Phase 0–6 work landed without regressions. Catch any
new gaps the contract didn't cover.
**Reviewer:** Claude Opus 4.7.

---

## Executive summary

**Phase 0–6 work landed cleanly and made an obvious difference.** Every
audited page passes the page-grammar contract: PageHeader present,
PageContainer type set, document.title correct, subtitle voice
consistent, container widths matched to type. The page-title bug
(B1, 5 surfaces showing "Home · Vite Flare Starter") is fixed
universally. The mode split works — sidebar shows Work / Setup;
Builder section appears when the toggle is on.

**Three regressions / leftover items** worth fixing before next ship:

| Severity | Finding | One-liner |
|---|---|---|
| **High** | A1 | Quick-actions strip on Dashboard still says "Connectors" — 4-pill row didn't get the rename sweep |
| **High** | A2 | "Recent agent runs" on Dashboard says "Another agent" as the trigger — confusing, reads like an agent name |
| **High** | A3 | Inbox row source label still leaks `memory_extraction` enum string |
| Medium | A4 | Skills row labels still slug-first (`/code-review`) — display name + when-to-use is the deeper fix |
| Medium | A5 | Admin stats row didn't get the StatGrid migration — `AdminStats` component still hand-rolled |
| Medium | A6 | "Recent agent runs" rows aren't clickable (no link to detail) |
| Medium | A7 | Settings 8 tabs overflow horizontally on narrow viewports (≤768) — already-known M14 |
| Low | A8 | Chat: dropped greeting is good, but no capability chip row showing what's connected (planned-but-not-shipped) |
| Low | A9 | Builder section sidebar SR text reads "Builder expand Builder" (lucid duplication) |
| Low | A10 | Skills page `<Card>` chrome wraps the empty state but everywhere else uses bare EmptyState — minor inconsistency |

Everything else verified ✓.

---

## Coverage

| Surface | Visited | First-time-user lens | Visual polish | Mobile | Notes |
|---|---|---|---|---|---|
| `/` (landing) | — | not in scope this run | — | — | Already covered in product-design-review-2026-04-28.md |
| `/sign-in` | ✓ (code) | ✓ | ✓ | — | Phase 6 trust copy verified in source |
| `/dashboard` | ✓ | ✓ Pass with caveats (A1/A2) | ✓ | spot-check | Hub type, PageHeader, mode-aware CapabilityTour |
| `/dashboard/chat` | ✓ | ✓ | ✓ | spot-check | Greeting fix verified — "What can I help with, Jeremy?" |
| `/dashboard/inbox` | ✓ | ✓ Pass with caveat (A3) | ✓ | spot-check | Queue type, PageFilters wired, ListRow rendering |
| `/dashboard/connectors` (Connections) | ✓ | ✓ Pass | ✓ | — | Catalog type, HelpDisclosure, "Coming soon" hidden |
| `/dashboard/skills` | ✓ | ✓ Pass with caveat (A4) | ✓ | — | Catalog type, CTA hierarchy fixed |
| `/dashboard/settings` | ✓ | ✓ Pass with caveat (A7) | ✓ | overflow-tested | Form type, 8 tabs known issue |
| `/dashboard/admin` | ✓ | ✓ Pass with caveat (A5) | ✓ | — | Form type, AdminStats not migrated |
| `/dashboard/organization` | ✓ | ✓ Pass | ✓ | — | Form type, H1=tab name, KeyValueList in disclosure |
| `/dashboard/files` | ✓ | ✓ Pass | ✓ | — | Queue type, StatGrid wired |
| `/dashboard/extract` | ✓ | ✓ Pass | ✓ | — | Form type, dev-tone subtitle gone |
| `/dashboard/routines` | ✓ | ✓ Pass | ✓ | — | Queue type, ListRow rendering |
| `/dashboard/activity` | ✓ | ✓ Pass | ✓ | — | Queue type, StatGrid wired, builder-mode-only |
| `/dashboard/components` | ✓ | ✓ Pass | ✓ | — | Form type, builder-mode-only |
| `/dashboard/style-guide` | ✓ | ✓ Pass | ✓ | — | Form type, builder-mode-only |

**Element coverage (sampled):** ~80% of inventoried interactive
elements across the audited surfaces. PageHeader trailing CTAs,
PageFilters tabs/chips, sidebar nav, command palette, theme toggle,
builder-mode toggle, skill expand/collapse, approval card, inbox
row click — all verified. Not exercised in this run: file upload
flow (no test fixture), routine create flow (already covered earlier),
chat tool execution (already covered in dogfood-audit-2026-04-24).

---

## Findings (severity-ordered)

### High

**A1. Quick-actions strip on Dashboard still says "Connectors" — vocabulary leak**
File: `src/client/pages/DashboardPage.tsx` (`QuickActions` function, around line 280).
What I see: Bottom of dashboard hero shows pill row "AI Chat / Skills /
Connectors / Projects". But the sidebar (after Phase 1 vocabulary sweep)
now says "Connections". Two surfaces, two different words for the same
thing — first-time user sees "Connectors" and "Connections" within 50px
of each other and can't tell if they're different things.
Fix: Rename the QuickActions item from "Connectors" to "Connections".
One word, one file, ~5s patch.
Severity: High (vocabulary contract violation; appears on the most-visited surface).

**A2. "Recent agent runs" rows say "Another agent" with no context**
File: `src/shared/format/agent.ts::formatTrigger` (returns "Another agent"
for `trigger: 'inter_agent'`).
What I see: Dashboard right panel shows "AI assistant · Another agent · 1
day ago". To a first-time user, "Another agent" reads as the *name* of
the agent that fired — confusing, because it sits next to "AI assistant"
which IS the agent name. The trigger column is meant to explain *how* the
run started.
Fix: Either drop the trigger column when it'd render as "Another agent"
(noisiest case), OR re-word to a verb-led phrase like "via another agent",
OR hide on small viewports. Recommended: render "Another agent" as
"via another agent" with the lighter colour, OR drop unless trigger ∈
{schedule, webhook}.
Severity: High (confusing on a hero surface).

**A3. Inbox row source label leaks `memory_extraction` enum**
File: `src/client/modules/inbox/pages/InboxPage.tsx::formatKind` (line ~318).
What I see: Inbox row metadata strip reads "Add from memory_extraction"
— the underscore-cased enum value bleeds through. The `formatKind`
helper does general snake_case → Title Case, but `memory_extraction` →
"Memory Extraction" still reads as internal jargon, not user voice.
The Approvals page solved this by collapsing memory_extraction to
"From AI memory"; Inbox didn't get the same treatment.
Fix: Add a special case for `memory_extraction` in `formatKind`:
return "AI memory". Apply same pattern to other known agent_class /
kind strings as they emerge.
Severity: High (vocabulary leakage on a hero queue surface).

### Medium

**A4. Skills row labels lead with the slash-name, not the display name**
File: `src/client/modules/skills/pages/SkillsPage.tsx`.
What I see: Each row shows `/code-review` as the bold lead, then a
description below in muted text. The slug serves as the human label.
A first-time user reading "/code-review" doesn't know what to do with
the slash — the slash is for the chat command syntax, but here it
looks like CLI vibes.
Fix (deeper change): Generate a display name from the slug
(titleCase), use that as the lead. The slash-name moves to a smaller
second line as "Type /code-review in chat" or as a kbd-style chip.
Skip this if you'd rather wait until an explicit `displayName` field
is added to SKILL.md frontmatter — both paths are valid.
Severity: Medium (works fine for builders; awkward for end users).

**A5. Admin stats didn't get the StatGrid migration**
File: `src/client/modules/admin/components/AdminStats.tsx` (separate
component, hand-rolled cards).
What I see: Admin still shows the 4-up "Total Users / Active Sessions /
New (7 days) / New (30 days)" using bespoke Card chrome — different
from the new `StatGrid` shape now used on Files and Activity.
Fix: Migrate `AdminStats` to use `<StatGrid items={…}>` like Files and
Activity. ~10 minutes.
Severity: Medium (visual drift between admin and other surfaces).

**A6. Dashboard "Recent agent runs" rows not clickable**
File: `src/client/pages/DashboardPage.tsx::RunRow` (line ~246).
What I see: Each row shows the run summary but has no link to the
agent_run detail. To audit a run, the user has to click "Activity log"
in the panel header and find the row again.
Fix: Wrap RunRow in a Link to `/dashboard/activity?run=<id>` (or a
detail route). Same affordance Inbox rows have.
Severity: Medium (friction on a hero surface).

**A7. Settings 8 tabs overflow on narrow viewports**
File: `src/client/modules/settings/pages/SettingsPage.tsx` (already-known M14).
What I see: At 606px viewport (well below mobile 768px breakpoint),
the 8 settings tabs scroll horizontally. They fit, just need a
horizontal scroll. Functional but not great.
Fix: On viewports < sm, replace the TabsList with a `<NativeSelect>`
("Profile", "Organization", …) that drives the same `?tab=` param.
Linear / GitHub / Vercel all do this for ≥6-tab settings on mobile.
~30 minutes.
Severity: Medium (works, just clunky).

### Low

**A8. Chat empty state has no capability chip row**
File: `src/client/modules/chat/pages/ChatPage.tsx::EmptyStateBody`.
What I see: "What can I help with, Jeremy?" is great. The next line is
"Ask anything, drop a file, dictate with the mic, or pick a starter
below." But there's no visible signal of *what's connected* — Gmail,
Drive, Calendar status, # of skills available, # of routines running.
The CapabilityChip primitive exists; it just isn't wired here.
Fix: Add a `<CapabilityRow>` below the subtitle showing connected
apps (call `/api/connections` for the chip data) and skill count.
Severity: Low (delight + trust; not blocking).

**A9. Builder section sidebar accessible-name reads "Builder expand Builder"**
File: `src/components/nav-main.tsx::CollapsibleSection`.
What I see: The collapsible section trigger has both a visible "Builder"
label and an `<span class="sr-only">expand Builder</span>` for screen
readers. The combined accessible name is "Builder expand Builder" —
slightly redundant.
Fix: Drop the `<span className="sr-only">…</span>` and rely on the
`aria-expanded` state of the `<button>` itself — screen readers
announce expand/collapse from that automatically.
Severity: Low (accessibility polish).

**A10. Skills empty state still uses Card wrapper**
File: `src/client/modules/skills/pages/SkillsPage.tsx` (~line 159).
What I see: Skills empty state uses `<Card><CardContent><EmptyState …`
— but everywhere else in the app, EmptyState renders directly without
Card chrome. Minor visual inconsistency.
Fix: Drop the `<Card>` wrapper around the EmptyState in Skills.
Severity: Low.

---

## What works well

Verified ✓ this run:

1. **PageHeader contract enforced everywhere I checked** — title + subtitle in user voice on Connections, Skills, Settings, Admin, Organization, Files, Extract, Routines, Activity, Components, Style guide, Inbox, Notifications, Approvals, Spaces, Projects, Dashboard, Chat. 18 surfaces.
2. **document.title correctly set on every page** — the B1 bug (5 pages reading "Home · Vite Flare Starter") is fully resolved both via the new PageHeader effect AND the fallback DocumentTitleSync fix.
3. **PageContainer type matches the contract** — queue/index/detail/form/catalog/hub picked correctly per page.
4. **Mode split works end-to-end** — Builder Mode off → Work + Setup sections only. Builder Mode on → adds collapsed Builder section with Approvals queue / Activity / Extract / Files / Components / Style guide. CapabilityTour on Dashboard hidden by default, shown when Builder is on.
5. **Vocabulary sweep on subtitle voice** — Settings/Files/Admin/Activity/Organisation/Extract all reading like a user speaking, not internal docs.
6. **Connections (rename from Connectors) consistent** in sidebar, page H1, page title, and tab title.
7. **HelpDisclosure pattern used uniformly** — Connections technical detail, Organisation org details, Extract SDK detail. All collapsed by default with the "TECHNICAL DETAILS" eyebrow label.
8. **StatGrid wired on Files + Activity** — replacing hand-rolled cards. Visual consistency restored.
9. **Inbox PageFilters** — tabs + chips primitive lifted out of Inbox-specific code.
10. **Stale meta description fixed** in `index.html` — now reflects multi-user multi-agent product.
11. **Sign-in trust copy** — "Google sign-in lets the app securely connect to Workspace tools (Gmail, Drive, Calendar) if you choose to enable them later. We never see your password." + "← Back to home" link.
12. **Motion tokens in CSS** — `--motion-fast/normal/slow`, easings, `prefers-reduced-motion` handler.
13. **Chat greeting deduplication** — "Good night, Jeremy" no longer appears on Chat empty state; replaced with "What can I help with, Jeremy?" action prompt.
14. **PageLoading skeletons** match body shape — list-shaped skeleton for queue pages, no bare spinners in body content (still in narrow contexts like the Mark-all-read button — appropriate).
15. **Vocabulary contract documented** — `docs/PAGE_GRAMMAR.md` + `docs/PRIMITIVES.md` + extended `docs/VOCABULARY.md` provide the bar future PRs can be reviewed against.

---

## Priority recommendations

1. **Fix A1, A2, A3 today** — three small patches, all quick wins, all
   on hero surfaces. Restores vocabulary consistency on the most-visited
   pages.
2. **Migrate AdminStats to StatGrid (A5)** — half-hour. Last hand-rolled
   stat row in the codebase.
3. **Defer A4, A7, A8** to a follow-up session — each is bigger and has
   working alternatives today (slug-first labels, horizontal-scroll tabs,
   model picker carries the capability info).
4. **A9, A10** — fold into the next polish pass.

---

## Fix-and-verify loop — CLOSED THIS SESSION

Patched in two follow-up commits (`d6cc773` + `1c03d82`):

| # | Status | Verification |
|---|---|---|
| A1 | ✓ fixed | Dashboard QuickActions now reads "Connections" — verified live |
| A2 | ✓ fixed | `formatTrigger('inter_agent')` now returns "via another agent" — drops the noun-confusion. Trigger column hidden on viewports < xl regardless |
| A3 | ✓ fixed (after second patch) | First fix patched `formatKind` but the leak was actually `formatAgentClass`; second patch added `memory_extraction → "AI memory"` special case. Inbox now reads "Add from AI memory" — verified live |
| A5 | ✓ fixed | `AdminStats` migrated to `<StatGrid>`; admin page now renders 4 `data-slot="stat-card"` items with the same chrome as Files / Activity |
| A9 | ✓ fixed | Builder section uses `aria-expanded` on the trigger; dropped the `<span class="sr-only">expand/collapse Builder</span>` duplicate |
| A10 | ✓ fixed | Skills empty state drops `<Card>` wrapper to match every other empty state |

Remaining (deferred to **Phase 5 — Power layer + polish**):

- A4 — Skills row labels lead with display name, not slug
- A6 — Dashboard "Recent agent runs" rows clickable to detail
- A7 — Settings 8 tabs use `<NativeSelect>` on mobile
- A8 — Chat empty state gets a CapabilityChip row showing connected apps

These batch nicely with the Phase 5 work (keyboard shortcuts, mass
actions, stateful greetings). Logging here so the next session has a
clean punch list.

---

**Audit complete. Three regressions worth fixing before next ship; the
rest verified clean.**

Authored: Claude Opus 4.7 — 2026-04-29.
