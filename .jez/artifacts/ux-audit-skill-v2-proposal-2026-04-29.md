# UX Audit Skill v2 — comprehensive improvement proposal

**Triggered by:** today's audit failure where the existing skill said "no Critical issues" while six bugs were live in the product, including a vertical-stacked-text catastrophe in spaces.

**Inputs:**
- Existing skill at `~/.claude/plugins/cache/jezweb-skills/web/.../skills/ux-audit/SKILL.md`
- Gemini's three docs in `audit-skill-gemini/`: Methodology, Report Template, Perfection Checklist
- Today's painful evidence: 6 bugs found by Jez in 60 seconds of dogfood AFTER my audit completed

**Goal of this document:** every idea I have for closing the gap between "audit says clean" and "user finds a catastrophe in 60 seconds". Not all of these will be adopted — Jez picks. Everything is concrete enough to act on.

---

## 0. Executive — the one-paragraph version

Today's audit failed because it was **structural** (read DOM, count elements, query CSS) when the bugs were **behavioural** (only surface under typing, sending, opening threads). The fix is not to look harder — it's to use a different method. The skill needs to require **interaction proof** before it can produce a verdict, plus a tooling layer (Playwright tests, dogfood drill, console + visual regression budgets) that catches behavioural regressions automatically. Gemini's docs add the right scaffolding (5-layer hierarchy, severity matrix, component-level checklist) but lack the interaction discipline. The merged skill is: **interaction-first walkthrough mode, structural sweep as verification only, scenario library for repeatable tasks, observability gates (console / network / a11y / perf), and a project-level dogfood drill that runs before any "done" verdict.**

---

## 1. Why audits keep missing real bugs

### The structural / behavioural split

Every bug Jez found in the post-audit dogfood today belongs to one of three categories:

| Bug | Category | Surfaces under |
|---|---|---|
| Vertical text in space messages (1 char/line) | Layout race | 3 panes open at lg-only viewport |
| @-mention inserts handle twice | Interaction state | Type `@`, pick from autocomplete |
| Send doesn't clear input | Race condition | Click Send and watch what happens |
| Spaces input below fold | Viewport flow | Scroll on lg viewport |
| Inbox keyboard hint visible by default | Discovery friction | First-time user (persona) |
| Eventually-empty input | Async timing | Watch over 1-2 seconds after click |

**None of these are visible in a static DOM probe.** Each requires an action followed by observation.

The existing audit skill has a "Walkthrough" mode that DOES require action, but it was demoted in practice because Sweep mode is faster and feels like progress. **Speed of the wrong method beats speed of the right method until something breaks.**

### Three classes of bug, three classes of detection

| Class | Detection method | Today's bugs in this class |
|---|---|---|
| **Structural** — element exists, text is right, class is correct | DOM query, screenshot diff | None today |
| **Behavioural** — action → reaction works correctly | Scripted Playwright, manual interaction | All 6 |
| **Perceptual** — feels off, wrong rhythm, jargon, broken trust | Persona walkthrough, brains-trust | Inbox hint visibility (persona) |

The current skill is biased toward Structural. It needs to be biased toward Behavioural with Perceptual as a layer on top.

---

## 2. What the existing skill has that's good (KEEP)

From `~/.claude/plugins/cache/jezweb-skills/web/.../skills/ux-audit/SKILL.md`:

1. **Three modes** — Walkthrough / QA Sweep / Targeted Check. Right idea, wrong default.
2. **Browser tool detection** — Chrome MCP / Playwright / playwright-cli, with sensible fallback. Keep.
3. **Severity rubric** — Critical / High / Medium / Low. Aligned with most other tooling. Keep.
4. **Walkthrough checklist** at `references/walkthrough-checklist.md` — Nielsen-derived heuristics, "if I landed here with no training, would I know what to do first?" — these questions are good. Keep them.
5. **Cross-cutting checks** — mobile (375px), dark mode, keyboard, loading states, empty states. Right list, but enforcement is weak.

**What's missing in the existing skill:**

- No interaction enforcement (a sweep can produce a "clean" verdict without typing or clicking anything)
- No multi-pane / multi-state stress (vertical text bug needs all 3 panes open)
- No console budget (today's audit literally read VoiceClient warnings and didn't fail)
- No persona enforcement (the inbox keyboard hint is fine for a power user, intrusive for a first-time SME — the audit didn't pick which persona)
- No proof requirement (a finding can be reported without a screenshot, console line, or DOM selector)

---

## 3. What Gemini's docs add (ADOPT)

### From `Methodology.md`

Adopt:

1. **The five-layer audit hierarchy** — Architecture / Interaction / Visual Logic / Feedback / Delight. This is a useful taxonomy that separates concerns cleanly. Today's bugs span Interaction + Visual Logic + Feedback, which the existing single-pass walkthrough conflates.
2. **Phase 3 Stress Test** — "What happens with 0 items? 10,000 items? A 100-character name?" — explicitly listed in Gemini's flow but absent from the existing skill. Today's vertical-text bug is exactly an under-tested layout edge case.
3. **Phase 1 Persona Mapping** — explicitly identify the user before auditing. Today's audit was vague ("first-time user") which led to me reading "Inbox keyboard hint" as discoverability help (good for power users) when Jez's persona (SME owner) treats it as noise.

### From `Perfection Checklist.md`

Adopt the **component-level granularity**. Today's audit was page-level ("Inbox renders correctly"). Gemini's checklist forces per-component review:

- Buttons & Triggers — state clarity, intent matching, micro-copy, loading state, hierarchy
- Inputs & Forms — persistent labels, masks, inline validation, error clarity, defaulting
- Navigation — "Where am I?" test, click depth, search logic, sticky headers
- Visual Coherence — icon consistency, empty states, border radii, contrast ratio
- Mobile & Touch — tappable surface, keyboard optimization, swipe gestures
- Performance & Feedback — skeleton screens, success toasts, confirmation modals only for high-stakes

**This is a checklist that can't be cheated.** Each item needs a yes/no answer with proof.

### From `Report Template.md`

Adopt the **Perfection Roadmap** — Quick Wins (24-48h) / Structural Updates (1-2 weeks) / Advanced Polish (post-launch). Today's report dumped all findings into one ranked list; the roadmap framing makes prioritisation obvious.

Also adopt the **Final Scorecard** (Usability / Accessibility / Visual Polish / Total Perfection Score) — but with caveats. Numerical scores feel pseudo-precise; better to use qualitative bands (Strong / Adequate / Weak) per category so the agent can't fake "8.3/10" out of vibes.

### What Gemini's docs are missing

The three docs are templates, not enforcement. They tell the agent WHAT to look for but not HOW to be sure it actually looked. The same gap as the existing skill — a careful reader could check every box in the Perfection Checklist by reading the DOM only, missing all of today's behavioural bugs.

The merged v2 skill needs Gemini's structure + an enforcement layer.

---

## 4. The proposed v2 skill

### 4.1. Mode reordering — Walkthrough is the default

Existing: Walkthrough / Sweep / Targeted, with Sweep used in practice.

Proposed: **Walkthrough is the only audit mode**. Sweep is renamed to "Verification Pass" and is only legal AFTER a walkthrough has produced findings — to verify fixes, not to discover.

Rationale: sweep mode catches structural drift but never the bugs that hurt users. By making it a verification step it can't masquerade as audit.

### 4.2. Interaction Manifest (NEW — non-negotiable)

Every walkthrough produces a manifest of interactions performed. Without entries here, the audit cannot output a verdict — it terminates with "incomplete".

```
INTERACTION MANIFEST
  Page: /dashboard/spaces/marketing-pod
    [✓] Typed in message input: "@assistant test"
    [✓] Picked @assistant from autocomplete
    [✓] Clicked Send
    [✓] Verified input cleared within 200ms
    [✓] Verified message appeared in transcript
    [✓] Opened thread on the message
    [✓] Verified thread pane rendered without layout collapse
    [✓] Captured console after each step
    [✓] Captured screenshot before + after each step
```

Each `[✓]` requires a tool call (a click, a screenshot, a console read) and the timestamps + selectors are logged. The agent can't produce a "clean" report without a reasonable manifest.

### 4.3. Console Budget (NEW)

After every interaction:
- Read `mcp__claude-in-chrome__read_console_messages`
- ANY `console.warn` or `console.error` since the previous read = audit fails
- Manifest warnings, deprecation notices, protocol mismatches all count

Today's VoiceClient warning would have failed every audit since it shipped. The existing skill noted console reads as optional; v2 makes them mandatory + scoring.

### 4.4. Multi-Pane Stress (NEW)

For apps with collapsible UI (sidebars, threads, drawers, sheets), the walkthrough must execute:

- Viewport widths: 375 / 768 / 1024 / 1280 / 1440 / 1920
- Pane combinations: closed / 2-pane / 3-pane / overlapping
- For each combination, scroll the longest content and capture a screenshot

The vertical-text bug only manifests at 1024-1280px with all 3 panes open. The existing skill's "Mobile (375px)" check found nothing; v2's stress matrix would have caught it.

### 4.5. Persona Lock (NEW)

Audit cannot start without a declared persona. The persona file lives at:

```
.jez/audit-personas/sme-owner.md
.jez/audit-personas/power-user.md
.jez/audit-personas/first-time-developer.md
```

Each persona has:
- Goals (what they want to do)
- Constraints (time, knowledge, device, attention)
- Pain triggers (what makes them close the tab)
- Wins (what makes them come back)

The audit walks through the app AS that persona. The verdict "Inbox keyboard hint feels intrusive" is correct for SME owner, wrong for power user — locking the persona makes the verdict defensible.

### 4.6. Five-Layer Hierarchy (ADOPT from Gemini)

Each finding is tagged with one of:

1. **Architecture** — nav, hierarchy, IA
2. **Interaction** — buttons, forms, toggles work as expected
3. **Visual Logic** — design system, layout, rhythm
4. **Feedback** — state communication (loading, success, error)
5. **Delight** — micro-interactions, polish, premium feel

Plus, each finding gets a Severity (Critical / High / Medium / Low) AND a layer. The roadmap is then "Layer × Severity" — Critical Architecture issues block ship; Low Delight issues wait for a design pass.

### 4.7. Component-Level Perfection Checklist (ADOPT from Gemini)

Adopt Gemini's 6-category checklist verbatim as `references/perfection-checklist.md`:

1. Buttons & Triggers
2. Inputs & Forms
3. Navigation & Hierarchy
4. Visual Coherence
5. Mobile & Touch
6. Performance & Feedback

Add to v2: each `[ ]` checkbox in the report MUST cite a proof artefact (screenshot, console line, code reference).

### 4.8. Stress Test Phase (ADOPT + EXTEND from Gemini)

Gemini lists three stress tests; extend to a comprehensive list:

| Stress | What to do |
|---|---|
| **Empty state** | List with 0 items, conversation with 0 messages, project with 0 files |
| **Saturated state** | List with 100+ items, conversation with 200+ messages, project with 50+ files |
| **Long content** | Name 100 chars, description 10 paragraphs, message 5000 words |
| **Race conditions** | Double-click submit, fast type and immediately blur, slow network (3G throttle) |
| **Keyboard-only** | Tab through every page; verify focus visible and not trapped |
| **No JS for layout** | Disable JS, verify the page still loads core content |
| **Dark mode** | Every contrast pair WCAG AA |
| **Reduced motion** | `prefers-reduced-motion: reduce` — animations respect it |
| **i18n** | Long German nouns, RTL Arabic, CJK character widths |
| **Network** | Offline mode (every action retries or queues) |

### 4.9. Reproduction Steps in Findings (NEW)

Every finding must include:

```
ID: H-2
Layer: Interaction
Severity: High
Surface: /dashboard/spaces/:id (lg viewport, all 3 panes open)
Reproduce:
  1. Sign in
  2. Open any existing space
  3. Open the members panel (md+ default)
  4. Click any message → opens thread aside
  5. Look at the timeline column
Observed: message text wraps one character per line (vertical column).
Expected: message text wraps at word boundaries within the available column width.
Evidence: screenshot at .jez/audit-evidence/2026-04-29/spaces-vertical-text.png
Suspected location: src/client/modules/spaces/pages/SpacePage.tsx:200 (main flex-1 min-w-0)
Suggested fix: add a min-w-[260px] to prevent the catastrophic squeeze, or hide one pane at lg.
```

A finding without reproduction + evidence + suspected location is rejected. Forces the agent to actually pin down the bug, not just gesture at it.

### 4.10. Brains-trust Rotation (NEW)

The audit skill itself acknowledges that any single perspective drifts. Add a recommendation:

- Every 4-6 weeks, run an outside-model audit (Gemini, GPT-5.5, DeepSeek, Claude Opus 4.7) and compare findings
- The model that finds bugs the others missed gets nominated as the next default
- Fresh perspective > attention

This is what GPT 5.5 brought to today's review — questions my audit didn't think to ask.

---

## 5. Supporting tooling (outside the skill)

The skill alone won't catch every regression. Pair it with three tooling layers:

### 5.1. Playwright "killer flow" tests

Write tests for the bugs that hurt most. Target ~10-15 scenarios. They run on every deploy.

```ts
test('spaces: send clears input', async ({ page }) => {
  await page.goto('/dashboard/spaces/test-space')
  const input = page.locator('textarea[placeholder*="message"]')
  await input.fill('hello world')
  await page.locator('button:has-text("Send")').click()
  await expect(input).toHaveValue('', { timeout: 1000 })
})

test('spaces: thread does not collapse timeline', async ({ page }) => {
  await page.goto('/dashboard/spaces/test-space')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.locator('[data-message-id]').first().click()
  // Open thread
  const timeline = page.locator('main')
  const width = await timeline.evaluate(el => el.getBoundingClientRect().width)
  expect(width).toBeGreaterThan(200)
})

test('spaces: @-mention does not duplicate', async ({ page }) => {
  await page.goto('/dashboard/spaces/test-space')
  await page.locator('textarea').type('@ass')
  await page.locator('text=@assistant').click()
  // After picking, exactly one mention pill in the input parts
  const pills = page.locator('[data-slot="mention-pill"]')
  await expect(pills).toHaveCount(1)
})

test('chat: console emits no warnings on mount', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'warning' || msg.type() === 'error') {
      warnings.push(msg.text())
    }
  })
  await page.goto('/dashboard/chat')
  await page.waitForLoadState('networkidle')
  expect(warnings).toEqual([])
})
```

These belong in `e2e/critical-flows.spec.ts`. ~2 hours to write the first 10. Run on every deploy via CI or wrangler post-deploy hook.

### 5.2. The 30-Second Dogfood Drill (NEW project hook)

Add to `CLAUDE.md`:

> **Before declaring any UI change "done", run the 30-second dogfood drill:**
> 1. Open the affected page
> 2. Type into any input
> 3. Click the primary action
> 4. Watch the next state for 2 seconds
> 5. Open a related view (thread, detail, modal)
> 6. Read the console
>
> If any step shows unexpected behaviour, the change isn't done.

This is the discipline change. Not a skill, just a project rule the agent must follow.

### 5.3. Visual regression baseline

Storybook + Chromatic, or simpler: a Playwright `page.screenshot()` per surface stored in git LFS. Diff after every deploy. Layout regressions show as visual diffs immediately.

Trade-off: maintenance cost for image baselines. Skip until Playwright tests stabilise.

### 5.4. Console + a11y + Lighthouse gates

- `axe-core` — accessibility violations on every page → fail audit
- `lighthouse-ci` — Core Web Vitals budget per page → fail audit
- Console error/warning count — fail audit

Add to GitHub Actions on PR if there's CI; otherwise to the agent's "Verification Pass" checklist.

---

## 6. Cadence — when to use what

| Trigger | Method | Time |
|---|---|---|
| Single-component change (button colour, icon swap) | Component perfection checklist | 1 min |
| Page-level change (new section, layout tweak) | Walkthrough on that page + 30s drill | 5 min |
| Cross-cutting change (primitive replaces ad-hoc, route rename) | Walkthrough across affected pages | 30 min |
| Pre-deploy gate | Playwright killer flows + console budget | 2 min (automated) |
| Weekly | Full Walkthrough as primary persona | 1 hr |
| Bi-weekly | Brains-trust round (outside-model audit) | 1 hr |
| Per-quarter | Stress test phase (saturated states, edge cases) | 2 hr |
| Per-release | Full Perfection Checklist sweep | 4 hr |

The schedule keeps each task scoped. **The biggest lesson today: a 1-hour walkthrough cannot replace a 30-second drill after every change.** Do both.

---

## 7. Concrete spec for v2 SKILL.md

Here's what I'd write into `~/.claude/plugins/cache/jezweb-skills/web/.../skills/ux-audit/SKILL.md` for v2:

### Header

```yaml
---
name: ux-audit
description: |
  Walk through live web apps as a real user to find usability + behavioural bugs that static reviews miss.
  REQUIRES interaction (typing, clicking, sending) before producing any verdict.
  Trigger with 'ux audit', 'walkthrough', or 'qa test'.
compatibility: claude-code-only
---
```

### Mode order

1. **Walkthrough (default)** — required. Persona-locked. Interaction-enforced.
2. **Stress Test** — sub-mode that adds saturated states + edge cases.
3. **Verification Pass** — only after Walkthrough produces findings, to verify fixes.
4. **Targeted Check** — quick check on one component.

### Mandatory pre-flight

Before any walkthrough begins:
1. Persona declared (file at `.jez/audit-personas/{slug}.md` or inline statement)
2. Browser tool detected and confirmed
3. Console reading capability tested (one read call)
4. Screenshot capability tested (one screenshot)

### Mandatory output sections

A walkthrough report MUST include:
1. Persona used + goals
2. Interaction manifest (≥ 1 entry per surface, ≥ 1 click/type per page)
3. Console budget result (errors / warnings count, must be 0 to pass)
4. Multi-pane stress matrix (for apps with collapsible UI)
5. Findings table with Layer × Severity per item
6. Each finding has reproduction steps, evidence path, suspected code location
7. Perfection Roadmap (Quick wins / Structural / Advanced)
8. Verdict: Pass / Conditional Pass / Fail

If any required section is missing, the report is "incomplete" not "passed".

### Severity definition (sharper)

- **Critical** — user CANNOT complete a primary task. Or: data loss. Or: security exposure.
- **High** — user gets confused or takes wrong path. Or: console error. Or: layout broken at a common viewport.
- **Medium** — friction; user succeeds with extra effort
- **Low** — polish

A console error or layout collapse is automatically High minimum. No "Medium console warning" — they don't exist.

### Reference files

| When | Read |
|---|---|
| Component-level review | `references/perfection-checklist.md` (from Gemini) |
| Per-screen heuristics | `references/walkthrough-checklist.md` (existing, keep) |
| Browser tools | `references/browser-tools.md` (existing) |
| Stress recipes | `references/stress-test-recipes.md` (NEW) |
| Persona library | `references/personas/` (NEW) |

---

## 8. Migration path — how to roll this out without breaking flow

I wouldn't ship all of v2 at once. Phased adoption:

### Phase 1 (this week, ~2 hr)

- Update SKILL.md to make Walkthrough the default
- Add the Console Budget check (one-line addition, big payoff)
- Add the Persona Lock (forces the agent to declare persona at start)
- Adopt Gemini's Perfection Checklist as a reference file

This catches ~80% of the gap with minimal effort.

### Phase 2 (next week, ~3 hr)

- Add the Interaction Manifest requirement
- Add Multi-Pane Stress matrix
- Add Reproduction Steps in findings format
- Write 5 starter Playwright killer flow tests (the ones for today's bugs)

This catches the long tail of behavioural bugs.

### Phase 3 (month, ongoing)

- Visual regression baseline
- axe-core / lighthouse-ci gates
- Brains-trust rotation cadence
- 10-15 Playwright tests for the most common flows

This makes regressions impossible to ship unnoticed.

---

## 9. What this changes in CLAUDE.md (project-side)

Add a one-paragraph section to the project's CLAUDE.md:

```markdown
## UX dogfood drill (mandatory before "done")

Before declaring any UI change done, perform the 30-second drill:

1. Open the affected page
2. Type into any input on that page
3. Click / submit the primary action
4. Watch the next state for 2 seconds (does it match expectations?)
5. Open a related view (thread, modal, detail) — does layout hold?
6. Read the console (any new warnings or errors?)

Six steps, ~30 seconds. Catches behavioural bugs that audits miss.
For larger changes (new page, primitive adoption), run the full
walkthrough via the ux-audit skill instead.
```

---

## 10. The honest meta-takeaway

Today's audit said "no Critical issues" while six bugs were live. Both my skill use AND GPT 5.5's review missed them. Not because either of us was lazy — because **structural audits are blind to behavioural bugs by definition**.

The fix is a different KIND of audit:
- Interaction-first (typed, clicked, sent before verdict)
- Persona-locked (audit AS someone, not "as a user")
- Layered (Architecture / Interaction / Visual / Feedback / Delight)
- Stress-tested (empty / saturated / edge / multi-pane / dark / mobile)
- Console-budgeted (warning = fail, no exceptions)
- Reproducible (each finding has steps + evidence + code location)

Plus tooling outside the skill:
- Playwright "killer flow" tests that run automatically
- 30-second dogfood drill enforced via project CLAUDE.md
- Visual regression baseline
- Brains-trust rotation every few weeks

None of these are exotic. Most are 1-2 hour additions. Together they turn "audit said clean, then user found 6 bugs" into "audit says clean and the user finds nothing weird in 5 minutes of dogfood."

Worth doing. Order: Phase 1 first (skill update + console budget + persona lock + Gemini checklist) — biggest payoff per hour. Phase 2 + 3 stack on top.
