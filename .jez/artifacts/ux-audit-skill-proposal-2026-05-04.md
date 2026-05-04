---
date: 2026-05-04
status: proposal (no skill changes yet)
owner: jez+claude
purpose: Response to Jez's "ideas from another AI" brief — read current ux-audit skill, propose changes that close the senior-designer-judgement gap.
related:
  - ~/Documents/claude-skills/plugins/dev-tools/skills/ux-audit/SKILL.md
  - ~/Documents/claude-skills/plugins/dev-tools/skills/ux-audit/references/visual-polish.md
  - ~/Documents/claude-skills/plugins/dev-tools/skills/ux-audit/references/perfection-checklist.md
---

# ux-audit skill proposal

Read the current skill end-to-end. The skill is **strong on rigour, weak on judgement**. It catches structural bugs (broken focus, layout collapse, axe violations, console warnings) very well. It produces **breadth-shaped findings** and rarely forces "what matters most" judgement.

The six ideas you brought back map cleanly. Three are already in the skill in some form, three are missing and would tighten the output meaningfully.

## Q1 — Which of the 6 ideas are already in the skill?

| Idea | Status | Where |
|---|---|---|
| 1. Make the model see the page | **Mostly in.** Phase 1 capability test forces 1 screenshot. Phase 3 walkthrough requires "screenshot every state change", before+after primary action, ≥ 2 screenshots per route. The audit-the-audit meta-check rejects audits with too few screenshots. | SKILL.md lines 124–134, 169, 360 |
| 2. One axis per pass | **Partial.** Phases ARE separated (walkthrough / polish / stress) but each phase covers many axes at once. Visual polish covers 10 AI-tells in a single sweep; component perfection covers 6 categories × ~7 checks. So the skill has *phase-level* sequencing but not *axis-level* sequencing within a phase. | SKILL.md Phase 4, references/visual-polish.md, references/perfection-checklist.md |
| 3. Spot deltas, not problems | **Missing in any structured way.** `dev-tools:brains-trust` does cross-model deltas. Reference apps are mentioned in visual-polish.md but only as "calibration". The skill never says *"pin three reference screenshots from Linear / Stripe / Vercel and list 10 specific things they do that we don't."* | n/a (gap) |
| 4. Force ranking | **Mostly missing.** Findings are bottom-up open-ended. The Perfection Roadmap groups by Quick Wins / Structural / Advanced Polish but doesn't force "top 5 ranked, one-sentence reason each". The skill explicitly avoids capping count. | SKILL.md "Perfection Roadmap" + references/report-template.md |
| 5. Critic pass | **Partial.** brains-trust is a cross-model second opinion (every 4–6 weeks cadence). The skill has no within-session critic pass that prunes filler from the same model before publishing. | SKILL.md "Cross-reference with ux-extract and brains-trust" |
| 6. Iterate, don't trust pass one | **Partial.** Phase 7 fix-and-verify is a single re-walk of the affected slice to verify the fix landed. It's not "see what NEW problems opened up after the fix" — it's "did the fix work?". The loop-to-exhaustion bullet exists at line 450 but isn't operationalised. | SKILL.md Phase 7, "Loop to exhaustion" line 450 |

## Q2 — Which are missing and worth adding?

In priority order:

### High value — Force ranking (idea #4)

The skill currently produces 30+ findings on a thorough run. Jez+team's actual decision is *"what 3-5 do I fix first?"* — and right now that decision is offloaded to the reader.

Proposal: add a mandatory **"Top 5 by senior-designer judgement"** section to the verdict block, between Findings and the Perfection Roadmap. Strict format:

```
TOP 5 (ranked by impact × ease, senior-designer pick)

1. [P3-002] Sidebar collapsed clips section labels — visible bug, every collapsed-state user, single-class fix
2. [P1-002] Edit-message button missing aria-label — Critical a11y, 30s fix
3. [P1-001] Chat tour reappears after Skip — every fresh chat visit interrupts; persistence single field
4. [P1-007] "Coming soon (builder preview)" leak — embarrassing, single feature-flag wrap
5. [P3-005] Skills card titles truncate mid-word — primary affordance for picking a skill
```

The constraint is the value. Forces comparison across findings. The agent has to argue "is this finding really top-5" against the alternatives.

### High value — Spot deltas (idea #3)

When the skill says "is this good?" it returns generic. When it says "what does Linear do that this doesn't?", it returns specifics.

Proposal: add a new optional but heavily-recommended phase between Polish and Stress:

> **Phase 4.5 — Reference Delta**
>
> Pin three screenshots from polished apps in adjacent product categories. For each, list 5 specific things they do that the audited app doesn't.
>
> Examples by category:
> - Internal AI tooling → Linear, Notion AI, Cursor, Raycast
> - Workflow / list-heavy → Stripe Dashboard, Vercel Dashboard, Plaid Dashboard
> - Chat / conversation → claude.ai, t3.chat, ChatGPT
> - Settings / config → Stripe Settings, Notion Settings, GitHub Settings
>
> Output template: 3 reference apps × 5 deltas each = 15 specific observations. Each delta is "X does Y; we do Z; the difference matters because W".

This works best with screenshot capture — the skill already supports running playwright sessions, can capture references from public-accessible URLs (Linear's marketing pages, Stripe's documented dashboard screenshots) without auth.

### Medium value — Critic pass (idea #5)

The current skill leans on brains-trust for "fresh eyes". But brains-trust runs every 4–6 weeks, not every audit. Within-audit pruning is missing.

Proposal: add **Phase 6.5 — Self-Critique** between findings draft and verdict block:

> Pass the draft findings list back to a fresh sub-agent with this prompt:
>
> *"Read this audit's findings. For each, answer: would this finding make sense applied to ANY web app, or is it specific to THIS app on THIS persona? Mark generic findings (could be deleted without loss). Mark specific findings (keep). Output a verdict per finding: KEEP / GENERIC / DUPLICATE."*
>
> Generic findings are filler. Drop them. Keep the verdict-block count honest.

A sub-agent works because the original drafter is invested in its own output. A fresh context has no ego.

### Medium value — Per-state screenshots (idea #1 extension)

Phase 3 already requires screenshots. But it's fuzzy on *which* screenshots. The walkthrough captures interaction screenshots; visual-polish doesn't require state-by-state captures of components.

Proposal: tighten Phase 4 component perfection. For each of the 6 component states (default / hover / focus / active / disabled / loading / empty / error), require an explicit screenshot OR a written justification for why it can't be captured. The 6-state matrix in perfection-checklist.md exists; the requirement to *photograph each state* is the missing forcing function.

The capture cost is real. 8 components × 8 states = 64 screenshots per page. Mitigate: require state coverage only for *flagged* components — those that surfaced one finding go through the full 8-state matrix to find related issues.

### Lower value — One axis per pass (idea #2)

The phase split already gives some sequencing. Going axis-by-axis within a phase would 5x the audit time without proportional findings gain.

Proposal: don't change the skill. But ADD a `audit-axis-only` mode invocation: "do a typography-only sweep across the app". Useful for follow-up audits after a tokens overhaul or a font swap, where the only thing that should have moved is one axis.

Discoverability: document the axis-mode invocations in SKILL.md description so triggers like "typography sweep" / "spacing audit" route here.

### Lower value — Iterate to exhaustion (idea #6)

Already at line 450 of SKILL.md ("Loop to exhaustion with variations"). The instruction exists, the discipline isn't enforced. This is documentation, not a real loop.

Proposal: tighten the meta-check. Add to audit-the-audit:

| Signal | Implies | Action |
|---|---|---|
| Same audit produced same findings twice in a row | Loop has saturated | Verdict can be Pass / Fail; loop terminates |
| Audit pass N+1 produced no NEW findings | Saturation reached | Stop |
| Audit pass N+1 still finding NEW Critical/High after a fix | Premature verdict last time | Continue loop |

This is a *light* enforcement — 3-line addition, no skill rewrite.

## Q3 — Where the skill generates filler-shaped output and how to fix

**Visual polish sweep**: 10 AI-tell categories → tempts the agent to "check all 10 found nothing on most" + a couple of single-instance findings. Output reads as completeness-theatre.

Fix: add at top of visual-polish.md — *"From the 10 categories, pick the 3 that produce the highest-impact findings on this run. Walk those 3 deeply. Note the others as 'scanned, no findings'. Don't enumerate clean checks."*

**Component perfection checklist**: 6 categories × 6+ checks. Risk: agent emits "all checks PASS" with shallow proof.

Fix: already partially solved by *"No proof = doesn't count"*. Tighten further — every PASS row also needs the agent to write one sentence on *why* it passes ("button uses `bg-primary` token; hover delta verified at hsl(220 100% 45%) → hsl(220 100% 40%)"). Vibe PASS rows get rejected by the meta-check.

**Scenario battery**: 11 scenarios is a lot. The agent will phone in scenarios 4-11 if 1-3 felt productive.

Fix: re-order scenarios by judgement-density. Currently they're roughly chronological. Move "Returning User", "Lifecycle Position", and "Round-Trip Workflow Integrity" to the front — those produce the highest-judgement findings. Move "First Contact" to the back — it's covered by the persona lock + first-time-user lens already.

**Findings template**: 8 fields per finding, including *Suggested fix*. Suggested fix is where agents write filler ("consider improving").

Fix: rename "Suggested fix" to "Smallest possible patch". Constrains output. *"Smallest possible patch: add `aria-label='Edit message'` to the button on line 42."* is harder to fluff than *"Suggested fix: improve the accessibility of this button."*

## Q4 — Lab-notebook version of an audit

Sub-question: what's the scrappy-pass-1 / distilled-pass-2 shape of building an audit?

**Pass 1 (lab notebook)**: agent freely walks the app, captures everything it sees, takes 200+ screenshots, writes whatever observations come to mind. No template, no severity, no audit-the-audit gates. Just *"what do I notice"*. Possibly 8-10× the volume of a normal audit.

**Pass 2 (distilled)**: read the notebook, apply ranking + critic + reference-delta + 5-by-judgement. Throw away 90% of pass-1's findings. The 10% that survives is the report. Each surviving finding cites one or two pass-1 observations as evidence ("I noticed this in screenshots N and M of the notebook").

How this would look as a skill change: a `--lab-notebook` mode that disables the audit-the-audit gates, no severity required, no template enforced. THEN the normal audit-skill consumes the notebook as input and produces the rigorous distilled report.

Why this is interesting: the current skill optimises for *not missing things*. The lab-notebook version optimises for *seeing things you wouldn't have looked for*. Both have a place. We don't need to choose; we can layer.

I'd add lab-notebook as an opt-in pre-pass for *new* products being audited for the first time, where you don't yet know what to look for. Established surfaces don't need it — you know the failure modes.

## Q5 — Anything you haven't thought of

Five additions:

### A. Audit a slice, not the app

The skill defaults to whole-app audits. Most actual audit needs are *per-feature*. Right now the agent audits the whole dashboard when you wanted just `/dashboard/findings`. Add a `scope` argument that limits the surface inventory:

```
/ux-audit scope=findings
/ux-audit scope=routines
/ux-audit scope=chat,inbox
```

Each scoped audit goes deep on its slice. Encourages running the skill more often.

### B. Persona overload at audit-time

The skill says "lock one persona" but real apps have 3-5 personas. Currently you'd run the skill 3-5 times. Better: locked-persona audits in series, then a *cross-persona delta finding pass* — what one persona finds easy, another finds opaque. That delta is itself the finding ("admin sees X clearly, member can't reach X via UI affordances").

### C. The brains-trust hookup is underused

brains-trust is mentioned but not auto-invoked. Make it part of Phase 6.5: after self-critique, if Critical or High findings exist, dispatch brains-trust automatically as a final confirmation pass. Outputs of brains-trust merge into the same report. Closes the "did one model overlook this" gap.

### D. The "hold this thing in your hands" check

Every audit could end with: *"if this app were a physical object, would I want to hold it?"*. Forces a holistic vibe judgement that no checklist captures. Output: one paragraph, no template.

### E. Sub-skill for the "does it ship" question

A separate, lighter skill that doesn't audit *quality* but audits *can-this-ship-today*: zero Critical, zero High, all hard gates green, top-5 list captured. 5-minute runtime. Ship/no-ship decision. Different tool than the deep audit.

## What I'd actually propose changing

If we're picking *one* change to ship soonest, it's **forced ranking** (idea #4) — adding the "Top 5 by senior-designer judgement" block to the verdict. That single change forces comparative thinking on every audit, costs almost nothing, and the cumulative effect across many audits is large.

After that:

1. **Reference delta phase** (idea #3) — most likely to close the senior-designer gap on visual quality
2. **Self-critique sub-agent pass** (idea #5) — biggest cost-to-value ratio for cleaning up filler
3. **State-coverage screenshots on flagged components** (idea #1 extension)
4. **Smallest-possible-patch rename** in the findings template (filler reduction in finding bodies)

I'd hold idea #2 (one-axis-per-pass) and idea #6 (iterate to exhaustion) — they're either too expensive (#2) or already documented but unenforced (#6).

## A note on this very audit

The overnight audit currently running uses the skill as-is. P1 returned 17 well-shaped findings; P3 returned 6 (with one false positive caused by audit-script bugs I've since fixed). Reading the findings now, I can tell where the skill served well (every finding has reproduction + evidence + suggested fix) and where it didn't (no top-5, no reference deltas, no per-component-state coverage, several "consider X" filler fixes that I'd rewrite as smallest-possible-patch).

The proposal above is partly informed by these immediate experiences, not just abstractions.

## Decision needed from Jez

- Pick which proposals (if any) to ship
- Confirm whether to add them as a v3 of the skill or amendments to v2
- For the lab-notebook idea — confirm whether new-product audits are common enough to justify a second mode

I'll wait for your reply before touching the skill file.
