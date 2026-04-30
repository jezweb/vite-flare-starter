# Design Review: Vite Flare Starter

**Date**: 2026-04-30
**URL**: https://vite-flare-starter.webfonts.workers.dev
**Worker version**: c7c2edf1 (post-axe-fix deploy)
**Modes audited**: Light + Dark
**Routes**: /dashboard, /chat, /chat/:id, /skills, /spaces/:id, /inbox, /projects, /connections

## Overall Impression

**Polished, professional, on-trend.** Looks like a real product, not a developer experiment. The visual language reads as "Linear meets shadcn meets claude.ai" — minimal chrome, generous whitespace, subtle borders, semantic accent colours. Dark mode is properly executed (no invisible elements, no contrast cliffs).

The big issues are about **coherence under stress** — the same pattern done two different ways across screens, mixed visual languages in the same hero area, and a few spots where the primary action isn't visually distinguished from secondary actions. None are individually broken. Together they create an "almost there" feeling.

A design-conscious person looking at this would say: "this is well made — but a couple of weekends of tightening and it'd be excellent."

---

## Findings

### High

- **Chat empty-state has three competing chip languages** at `/dashboard/chat`. Connection chips (green-dot + icon + label, thin border, pill-shaped) sit one row above starter category pills (plain outline, no dot, larger), which sit one row above suggestions ("Find good coffee shops near Newcastle NSW") rendered as **plain text lines with no chip styling at all**. Three things that semantically mean "click to start" use three different visual treatments. → Pick one chip primitive (recommend the starter-pill style) and use it for all three, or differentiate by hierarchy (chips for connections/categories, real card-like suggestion buttons for the prompts). Reference: claude.ai uses cohesive `Suggestion` cards for the prompt suggestions.

- **No primary CTA on dashboard quick-actions row.** The four buttons at the bottom (AI Chat / Skills / Connections / Projects) are all the same outline-button style. A first-time user has no signal that "AI Chat" is the most likely thing they'd want next. The squint test fails — no eye-draw. → Either: (a) make "AI Chat" filled-primary while the rest stay outline, OR (b) drop the row entirely and use the empty-state of "Pending review" / "Recent agent runs" cards as the call-to-action surface (the right card already has "Activity log →" which is a better entry point).

### Medium

- **Inconsistent time-format across surfaces.** Dashboard recent-runs use `about 18 hours ago`, project cards use `Updated 6h ago` / `Updated 1d ago`, and one project card uses `Updated 19/04/2026` (absolute date), while spaces messages mix `27/04/2026, 20:20:17` (full datetime) with `20h ago` / `19h ago` on adjacent messages. → Lock to one rule: relative for < 7 days, absolute (`19 Apr`) for older. Apply via a single `formatRelative()` helper used everywhere.

- **Project folder icons use inconsistent colours with no clear meaning.** Content Writing has a green folder icon, Quoting and Pirate Lab have blue. Looks semantic ("green = something special?") but appears to be either random hash-derived or alphabetical — unclear. → Either pick one accent colour for all project folders, or use folder colour intentionally (e.g. user-chosen, or category-based) and document that colour mapping in tooltips. Random colour reads as "broken" to a design-conscious eye.

- **Skill list selected-state lacks a strong "this is selected" cue.** Selected skill in left list (`Code Review`) gets a subtle `bg-muted` shade. Adjacent rows have hover `bg-muted/60`. The delta between hover and selected is small — at a glance the user can't tell which skill is the active one. → Add a left-border accent (`border-l-2 border-primary`) on selected, OR strengthen the selected bg with `bg-primary/5` so it visually steps further from hover.

- **Sidebar group labels (Work / Setup / Builder) sit in a small-caps style without a visual separator.** They look like they belong together with the items below — easy to miss as section breaks. → Add a thin top divider above each group label (1px `border-sidebar-border`), OR increase the top margin on the group block. Linear's sidebar groups use both small-caps + slightly increased gap above; either works.

- **Two visual languages for "selection" UI on Inbox.** Tab pills (Undecided / Unread / All) on the left use one chip style; the Importance filter (High / Medium / Low) on the right uses an identical-looking chip style. Both are technically right (both are filter selectors), but at a glance they look like **the same control split into two halves**. The first-time user has to read carefully to realise these are independent filters. → Either: (a) visually differentiate (tabs as underline-style on the left, pills only for Importance), OR (b) move Importance filter to a single dropdown (`Importance: All ▾`) so it's clearly a different control.

- **Dashboard "Recent agent runs" rows have no clickable affordance** despite looking like a list of runs. Hovering shows no state change; clicking goes nowhere. The `Activity log →` link in the header IS the way through. → Either make rows clickable (each row → activity log filtered to that agent), OR add a subtle "View all →" hover hint at the row level so the user knows the rows themselves aren't actions.

### Low

- **`Your projects` section header on /projects is rendered as a small badge/pill** which looks clickable but is just a label. Demote to a plain uppercase-tracking text label like `WORKSPACE INTEGRATIONS` on /connections (which gets it right).

- **Provider logos on /connections inconsistent**: Microsoft 365 has the real four-square logo, Google Workspace has a constructed gradient avatar with "G". Either use real brand assets for both, or constructed avatars for both.

- **Suggestion text below chat starter pills has no hover affordance** — the cursor doesn't change, no underline, no chip border on hover. Looks like static copy, not clickable. Same fix as the High-1 chip-language issue.

- **Spaces message timestamps switch format mid-list**: oldest message has `27/04/2026, 20:20:17`, recent ones have `20h ago`. → Same `formatRelative()` helper as the Medium-1 fix.

- **AI Sparkle button on /skills detail has a sparkle icon but the icon is the same weight as plain glyphs.** Sparkles usually get a subtle gradient or accent colour — currently it's flat. Low-priority polish; current is fine.

- **Notification bell badge "1" sits offset-right of the bell** — looks correct on dashboard, but at narrower widths could clip. Should add a `min-w-[1.25rem]` to keep the circle round when count goes to two digits.

- **Theme toggle icon doesn't preview which mode it'll switch to**. Currently shows the moon icon in light mode (going to dark) and sun in dark (going to light) — that's actually correct. Re-checked, this is fine. (Initial impression was wrong.)

---

## What Looks Good

These patterns are well-executed and should be preserved across forks:

- **Sidebar org switcher** at top-left — avatar + name + role-pill is genuinely good design. Many SaaS apps get this wrong; this one's right.
- **Card style across the app** — white/dark bg, 1px border, consistent rounded radius, no shadow. Conventional shadcn but applied with discipline.
- **Status pills** (`Connected` green, `bundled` muted, `OWNER` neutral, `BOT` neutral) — uppercase tracking, semantic colour, consistent height. Good reusable primitive.
- **Mention chips in /spaces** — green-tinted bg + @-prefix + icon — clear, scannable, semantic.
- **Empty state on /chat** — "What can I help with, Jeremy?" claude.ai-style hero is the right pattern for an AI app empty state.
- **Cmd+K palette** — sectioned (Create / Review), kbd shortcut hints in the trigger, keyboard navigation works.
- **Dark mode discipline** — every surface tested rendered cleanly. No invisible text. No contrast cliffs. The `--background` / `--card` / `--muted` distinction holds in both modes.
- **Notification bell badge** — small, red, top-right, only visible when count > 0. Standard but well done.

---

## Top 3 Fixes

Ranked by visual impact for the time spent.

### 1. Unify the chat empty-state chip language (High-1)

The chat home is the single most-visited screen and has the worst chip-language fragmentation. One reusable `<Suggestion>` primitive that all three rows use — connection chips, starter categories, prompt suggestions — would make this screen feel cohesive. Time: ~1 hour. Reference: claude.ai's home.

### 2. Add a primary CTA hierarchy (High-2)

Three places have "all-equal" button rows that should have a primary:
- Dashboard quick-actions (4 outline buttons)
- Connections page top-right (Browse apps + Add custom — currently both filled-primary; only one should be)
- Chat starter pills (5 outline pills — at least the most common one could be filled)

Pattern: one filled-primary + others outline. Time: ~30 min total.

### 3. Lock time format to one helper (Medium-1)

Audit every place that renders a relative time. Centralise on one `formatRelative(date, { now })` helper that returns `just now` / `5m ago` / `6h ago` / `3d ago` / `19 Apr` / `19/04/2026`. Use it everywhere. The current fragmentation reads as "this app was built by 4 different developers". Time: ~2 hours including grep + replace + e2e check.

---

## Shadcn component audit (bonus — you asked)

Components currently in use across the audited surfaces: Button, Badge, Card, Switch, Checkbox, Tabs, Dialog, Sheet, Tooltip, Avatar, Skeleton, Select, DropdownMenu, Sidebar, Command (palette), Toast (Sonner?).

**Gaps where a primitive would consolidate ad-hoc patterns:**

| Where | Currently | Recommend |
|---|---|---|
| `/skills` skill selector + `/inbox` agent picker + filter chips | Custom list-row with switch / custom pills | **Combobox** — searchable + keyboard-nav single-select. shadcn ships it. |
| `/activity` (didn't audit but presumed list-of-events) | Likely bespoke | **DataTable** — sortable, filterable, pagination. shadcn cookbook recipe is solid. |
| Model picker in chat input | Looks like a custom dropdown | Could be the same Combobox primitive — tighter UX. |
| Agent / Skill / Tool pickers across routines + chat | Mixed list views | A shared `<EntityPicker>` built on Combobox + Command would replace the 4–5 ad-hoc list patterns. |

**Components I would NOT add:**

- `DataTable` for /activity unless you actually need sort + filter + pagination there. If it's just a chronological log, current list-row is correct.
- `Form` shadcn primitive — only worth adding if you have many forms with complex validation. Doesn't look like the case here.
- `Calendar` / `DatePicker` — no surface here uses date input that I saw.

**Honest tradeoff**: the Combobox / DataTable additions are real wins ONLY if you commit to refactoring 3–4 existing surfaces to use them. Adding the primitive without consolidating ad-hoc usages is bundle bloat without UX gain. Worth doing if you're touching pickers in the next milestone anyway.

---

## What this review does NOT cover

- Animation timing / easing curves (need DevTools Performance tab)
- Print stylesheet (no surfaces use one)
- Mobile viewport (Chrome MCP couldn't go below 1305px — same gap noted in the ux-audit)
- Component accessibility beyond what axe-core already covered
- Internationalisation (long German, RTL Arabic, CJK) — mentioned in real-data battery from ux-audit, didn't repeat here

---

**Time spent**: ~25 minutes (light + dark sweep across 6 routes, no fix work).
**Severity total**: High = 2, Medium = 5, Low = 6.
**Verdict**: ✅ Conditional Pass — none of the High findings are broken, all are coherence improvements.
