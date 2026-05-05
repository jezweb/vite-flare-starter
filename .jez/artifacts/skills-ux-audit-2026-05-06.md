---
date: 2026-05-06
status: complete — ALL 6 findings shipped (F1 + M1 + M2 + M3 + L1 + L2)
owner: jez+claude
scope: /dashboard/skills + skill detail editor
viewports: desktop (1440x900)
themes: dark + light
---

# Skills UX + theme audit

## Verdict

**Solid foundation, two real bugs fixed today, four UX nits worth addressing.**

Listing page is well-designed in both themes. Skill detail page works but has redundancy + a couple of affordance gaps. AI Sparkle + History flows are functional. Light mode had one real bug (heading underlines in source editor — fixed in this session). Dark mode is clean throughout.

## Fixed in this session

| # | Severity | Issue | Fix |
|---|---|---|---|
| F1 | Bug — visual | Light-mode CodeMirror underlined every markdown heading (`# H1`, `## H2`, etc.) | Added `HighlightStyle` for light mode using bold + accent colour instead of underline. Verified: 18 underlined spans → 0 |

## Findings — ALL FIXED in this session

Status legend: ✓ shipped to live deploy

## Findings — UX nits

### ✓ M1 — Listing cards are `<button>`, not `<a href>` (FIXED)
- **Where**: `/dashboard/skills` skill cards
- **What**: Cards use onClick to navigate. Cmd+click, middle-click, right-click "Open in new tab" all fail.
- **Why it matters**: power users expect deep links to be openable in new tabs, especially when comparing multiple skills.
- **Fix**: change the SkillCard to a `<Link to={`/dashboard/skills/${name}`}>` from React Router, drop the imperative navigate.
- **Effort**: 5-10 min

### ✓ M2 — Description shown 3× on skill detail page (FIXED)
- **Where**: `/dashboard/skills/:name`
- **What**: The skill description appears as: (1) page subtitle under the h1, (2) inside the editor card under `/code-review` badge, (3) at the top of the markdown source as the frontmatter `description:` field.
- **Why it matters**: Burns vertical space, makes the page feel cluttered, doesn't help understanding.
- **Fix**: drop the page-subtitle copy. The card already shows it; the source is canonical. OR replace the page subtitle with something more useful (e.g. "last edited 5d ago · 800 estimated tokens").
- **Effort**: 5 min

### ✓ M3 — Save button visible even when no changes (FIXED)
- **Where**: skill editor card
- **What**: Save button is always present, just looks slightly disabled when there are no edits.
- **Why it matters**: minor visual noise; better feedback when state is dirty.
- **Fix options**:
  - (a) Hide Save until dirty — most opinionated
  - (b) Show "Saved" with a check when not dirty, "Save changes" when dirty — clearest
  - (c) Leave as-is, dim more aggressively when not dirty
- **Effort**: 5 min for any option

### ✓ L1 — History tab shows full file in each diff card (FIXED)
- **Where**: skill detail → History tab
- **What**: Every prior proposal renders the full SKILL.md content in its diff section. Even a 1-line change shows the whole file.
- **Why it matters**: hard to spot what actually changed; cards become tall and scroll-heavy.
- **Fix**: collapse identical context lines so only the changed lines + 3 lines of surrounding context show. Or render `+/-` line markers more visibly.
- **Effort**: 30 min — `ConfigDiffCard` would need a unified-diff renderer not a full-file dump

### ✓ L2 — Procedure heading hierarchy is doubled (FIXED)
- **Where**: skill detail → Overview tab
- **What**: Page shows `PROCEDURE` (small caps label) immediately followed by an h1 `Code Review` rendered from the markdown content. The `Code Review` h1 inside the markdown duplicates the page's own h1 above.
- **Why it matters**: visual redundancy — same name three times in close proximity (page h1 / procedure card h1 / markdown h1).
- **Fix options**:
  - (a) Strip the leading h1 from rendered markdown when it matches the skill name
  - (b) Drop the `PROCEDURE` label and just render the markdown directly
  - (c) Hide the page-title-h1 and let the markdown's h1 stand
- **Effort**: 10 min

## Pattern wins (preserve)

- **Two-pane info architecture** (page header + editor card + tabs) is consistent with other detail pages in the app.
- **Slash-trigger pill** in the header (`/code-review`) gives the user the actual command they'll type in chat — direct mapping from this surface to chat usage.
- **Bundled override warning chip** ("Bundled — edits create a personal override") is a clear, important affordance.
- **AI Sparkle button + textarea popover with placeholder examples** ("e.g. Make it shorter. Add an Australian context note. Rewrite for a senior engineer audience.") teaches the user what they can ask for.
- **Source / Overview / History tabs** is a good split — separates "what does this say" from "edit it" from "what changed".
- **24 skills bundled** is a strong starter set; cards are scannable in dark + light.
- **CodeMirror with foldGutter, search, lint** is the right tier of editor for this — VSCode-light without being intimidating.

## Theme-mode quality

| Surface | Dark | Light | Notes |
|---|---|---|---|
| Listing page | ✓ | ✓ | Clean both modes |
| Skill detail (Overview) | ✓ | ✓ | Clean both modes |
| Skill detail (Source) | ✓ | ✓ (after F1) | Light mode had heading underlines — fixed this session |
| Skill detail (History) | ✓ | ✓ | Diff bodies use bg-muted/20 — theme-aware |
| AI Sparkle popover | ✓ | ✓ | Clean both |

No outstanding theme bugs as of this commit.

## What I'd do next session

1. **M1 + M2 + L2** combined are ~20 min of work and would visibly tighten the detail page. Recommended pre-demo polish.
2. **L1 (better diff renderer)** is more involved — leave for a session where History gets a real workout.
3. **M3 (save state UX)** is opinionated — would prefer a quick user-side decision before implementing.

Optional bigger ideas if ever doing a Skills v2:
- **Side-by-side preview** — show the rendered markdown next to the source while editing, like a paired editor. Currently you have to switch tabs.
- **Token count + cost estimate** at the top of the editor — "this skill adds ~800 tokens to every chat that uses it"
- **"Used 24× in last 7d" stat** — shows which skills actually pull weight

