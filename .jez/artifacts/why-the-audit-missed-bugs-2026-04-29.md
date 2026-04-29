# Why the audit said "clean" while six obvious bugs were live

**Triggered by:** Jez finding six bugs in ~60 seconds of dogfooding immediately after I declared the post-GPT-5.5 batch "clean" with the ux-audit skill.

**Honest diagnosis:** the audit method I used was wrong, and the skill itself is partly to blame for letting me use it that way.

---

## The bugs we missed

| # | Bug | What surfaced it |
|---|-----|---|
| 1 | Inbox keyboard hint visible by default — distracting | Jez looking at the Inbox after login |
| 2 | Spaces chat input below the fold on desktop | Jez scrolling in spaces |
| 3 | @assistant autocomplete inserts the handle twice | Jez typing `@ass` and selecting |
| 4 | Send button doesn't immediately clear the input | Jez sending one message |
| 5 | Vertical-stacked text in space messages — 1 char per line | Jez opening a thread |
| 6 | Empty state of the message input in some cases | Jez glancing |

Bugs 3, 4, 5 are catastrophic — they make the Spaces feature unusable. Bug 5 was happening 5 minutes before I confidently wrote "no Critical issues" in the design review.

---

## Why the audit missed them

**Each of these six bugs only surfaces under interaction.**

- Bug 3 needs you to type `@` and pick from autocomplete
- Bug 4 needs you to actually press Send
- Bug 5 needs you to open a thread on a 1024-1280px viewport with members AND thread panes open simultaneously

I ran the ux-audit skill in **DOM-probe mode**:
- Navigate to /dashboard/spaces
- `document.querySelectorAll('[data-slot="list-row"]')`
- Read the textContent
- Move on to next page

That checks structure, not behaviour. None of these bugs are visible until something happens. The audit is functionally a static snapshot.

GPT 5.5's review was sharper than mine because it asked "does this still feel like a dev tool?" — a product question. But even GPT's audit didn't catch these — they're behavioural bugs that surface from real input, real send, real thread-open. Both audits were structurally limited to "what does the rendered DOM look like right now?"

---

## What the audit skill needs

The ux-audit skill at `~/.claude/plugins/cache/jezweb-skills/web/.../skills/ux-audit/SKILL.md` is fine in design — it has a "UX Walkthrough" mode that says "perform a realistic task as a first-time user". The problem is the skill doesn't ENFORCE the walkthrough discipline. Both me and the skill drift toward sweep mode (faster, but blind).

### Concrete changes I'd propose

**1. Make Walkthrough the default mode, demote Sweep**

The skill currently presents three modes: Walkthrough, QA Sweep, Targeted Check. In practice Sweep is what gets used because it's faster. Reverse the framing: Walkthrough is the default. Sweep is for verifying after a Walkthrough pass.

**2. Add an explicit interaction checklist**

Each walkthrough must execute at minimum:

- Type a message, send it, watch the input clear
- Open a thread, verify the layout doesn't break
- Click any "Create" button, verify form opens
- Submit a form with data, verify the result
- Use keyboard navigation, verify it doesn't get trapped

If any of those weren't done, the report can't say "clean".

**3. Add a "Console Budget" gate**

After each interaction:
- Read the console
- Any error or warning fails the walkthrough
- Manifest warnings, protocol mismatches, deprecation notices all count

This would have caught the VoiceClient warning weeks ago — it was logging on every chat page mount.

**4. Add a "Multi-Pane Stress" check**

For apps with collapsible sidebars / threads / drawers, audit must include:
- All panes open at viewport widths 1024 / 1280 / 1440 / 1920
- Verify no layout collapse, character wrap, overflow

This would have caught the vertical text bug because it ONLY shows when 3 panes overlap on a narrow desktop.

**5. Make screenshots mandatory at "before and after each interaction"**

Not just a screenshot of the final state. Take one before clicking Send, one after. Diff them. Did the input clear? Did the message appear? Did anything else change unexpectedly (e.g. the @assistant autocomplete leaving its handle behind)?

### What I'd add to your project's CLAUDE.md

A short hook: **"After any UI change, perform the 30-second dogfood drill before declaring done."** The drill is a literal list:

1. Open the affected page
2. Type into any input on that page
3. Submit / send / save / pick the primary action
4. Watch the next state
5. Open a related page (thread, detail, modal)
6. Watch the layout
7. Read the console

Six steps. ~30 seconds. Catches all six bugs from today.

---

## A different methodology entirely

The other angle Jez asked about: **"a method of taking a seemingly fine app and actually making it perfect."**

The honest answer is that audits — even good ones — find bugs at a slow rate. The fastest way to find behavioural bugs is to USE THE PRODUCT for real work. Three things compound:

### 1. Daily 5-minute dogfood

Pick a real task ("draft a quote", "research a topic", "set up a routine for one client"), do it, note every friction point. Don't fix yet — just write it down. After a week, the friction list is probably 30-50 items long, weighted by how often they hurt.

### 2. Scripted user flows in Playwright (as tests, not audits)

The killer bugs from today are testable:
- "After sending a message, input is empty" — a one-line `expect(input.value).toBe('')` after `send.click()`
- "After opening thread, message text is wider than 100px" — viewport pixel test
- "After @-mention selection, input contains exactly one mention pill" — count check

Write 10-15 of those as Playwright tests. Run them on every deploy. They'd catch regressions automatically.

### 3. Visual regression

Screenshot every page at 3 viewport widths. Diff after every deploy. Layout regressions show up as visual diffs immediately.

These three together turn "find bugs by audit" into "find bugs before they ship". The current model is "ship, audit, find, fix" which is exactly the cycle Jez is frustrated by.

---

## Where to from here

**Immediate (this session):** vertical-text bug fixed in commit `987525f`. The other 5 bugs from Jez's screenshots are queued for the next session — they're separate issues that need targeted fixes.

**Skill changes:** I can update the ux-audit SKILL.md to demote Sweep mode and require an interaction checklist. Pending Jez's approval on the direction.

**Methodology adoption:** writing the 10-15 Playwright tests for the killer flows would take ~2 hours and would catch every bug from today's set on the next regression. Worth a fresh session.

---

## What this means for the work today

- Today's "no Critical issues" verdict was wrong. The audit missed catastrophic bugs.
- The fix isn't to be more careful — it's to use a different method.
- I'll update the audit skill (or write a new one) before I do another audit on this app.
- The vertical-text bug is fixed live as of `987525f`.

Both audits today (mine + GPT 5.5's) had the same structural limit: read state, miss interaction. Better methodology > better attention.
