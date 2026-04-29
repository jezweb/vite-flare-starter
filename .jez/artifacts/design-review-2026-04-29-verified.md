# UX Audit — 2026-04-29 (verified, post-GPT-5.5 + spaces fixes)

```
═══════════════════════════════════════════════════════════
VERDICT: Fail

Persona: SME owner returning Tuesday morning to verify the
         friction Jez asked us to fix is actually gone.
Surfaces audited: 9 of ~14 routes (the 5 named in the post-GPT-5.5
                  prompt + the spaces flow + the live multi-pane stress)
Interaction Manifest: complete (input typed, mention picked,
                      message sent, agent replied, multi-pane stress
                      walked at 5 widths)
Browser: Playwright + headless test-auth cookie injection (Chrome
         MCP wasn't connected; this run is the first authenticated
         interaction-driven pass today)

Hard Gates:
  Console errors:        0   GREEN   (0 allowlisted)
  Console warnings:      0   GREEN   (0 allowlisted) ← VoiceClient +
                                       manifest enctype warnings both
                                       confirmed gone, fixes hold
  Network 5xx:           0   GREEN
  Network 403/404 auth:  0   GREEN
  Layout collapse:       1   RED     ← H-1 below: thread Reply button
                                       offscreen at viewport ≤ 1196px
                                       with members + thread panes open

Findings:
  Critical: 0
  High:     2  (H-1 layout collapse new; H-2 Skills editor-first still
                unaddressed from GPT 5.5)
  Medium:   2  (M-1 inbox empty-state internal vocabulary; M-2 Cmd+K
                single-char filter dilutes — confirmed live)
  Low:      2  (L-1 routine card affordance touch-blind; L-2 Cmd+K
                Review group duplicates Navigation entries)
═══════════════════════════════════════════════════════════
```

---

## Summary

Today's batch shipped clean on the five surfaces from the post-GPT-5.5 prompt, and the five spaces fixes from `b5c71fb` all hold up under a real interaction-driven walkthrough — message sent → agent replied → input cleared synchronously → exactly one chip rendered → typed prefix preserved. **All five spaces fixes verified live, on a headless authenticated session against the deployed worker.**

The walkthrough also surfaced one **new** layout-collapse bug (H-1) that the morning's spaces work didn't address: at viewport widths between roughly 1024px and 1196px, with the members panel AND a thread aside both open, the thread's Reply button sits offscreen by 76-152px. That's a hard-gate-class issue — common laptop resolutions (1024×768 / 1366×768 with the sidebar's full width) hit it.

The deferred GPT-5.5 high-priority items still apply:
- **H1 Home first-run state** — empty state is actually pretty good as-is (clear copy, four quick-action chips, sensible "All clear" / "No agent activity yet" cards). I'd downgrade this from High to Medium going into the next session — there's room to improve, but it's not the critical UX gap GPT 5.5 made it sound like.
- **H2 Skills editor-first** — confirmed still active. Default tab is **Source** (raw markdown). A new user lands on raw SKILL.md content. Needs an Overview tab as default.

Hard-gate console verification was an explicit ask in the prompt:
- ✅ Manifest enctype warning — gone
- ✅ VoiceClient protocol warning — gone
- ✅ Dashboard load + Cmd+K open + Inbox + Approvals + Projects + Spaces + space-with-thread + Skills + Connections + /routines/new — every page loaded with 0 errors / 0 warnings (the only console output is one benign `[INFO] [Sentry] DSN not configured`).

---

## Critical

None.

---

## High

### H-1. Thread Reply button offscreen at ≤ 1196px viewport with both panes open  *(NEW)*

**Layer:** Interaction
**Surface:** /dashboard/spaces/:id at 1024-1196px viewport with members panel default-open and a thread aside open.
**Persona:** SME owner on a 13" laptop or external 1366×768 monitor. Both common.

**Reproduce:**

1. Sign in (any user).
2. Open or create a space (Solo workshop template fastest — instant create).
3. Click any message → opens thread aside on the right.
4. Resize the viewport to 1100×800 (or any width ≤ 1196px).
5. Look at the thread reply input row at the bottom of the right pane.

**Observed:** Reply button sits at fixed `right=1176px` in the page. At 1024px viewport it's clipped 152px offscreen; at 1100px it's clipped 76px offscreen. The textarea ("Reply in thread...") IS visible but the submit button isn't reachable with mouse / keyboard / touch.

**Expected:** Reply button stays in viewport at every supported width, OR one of the two panes auto-collapses below ~1200px so the layout fits.

**Probe data:**

```
1440 → reply.right=1420  inViewport=true   ✓
1280 → reply.right=1260  inViewport=true   ✓
1200 → reply.right=1180  inViewport=true   ✓ (just barely — 20px clearance)
1100 → reply.right=1176  inViewport=false  ✗ (76px clipped)
1024 → reply.right=1176  inViewport=false  ✗ (152px clipped)
```

The Reply button's x-position doesn't change with viewport — meaning the thread aside has a fixed width that pushes content beyond the viewport rather than shrinking. Members panel + thread aside + transcript column don't fit at < ~1200px.

**Evidence:**

- `.jez/audit-evidence/2026-04-29-verified/15-multipane-1100x800.png` (Reply text visible, button gone)
- `.jez/audit-evidence/2026-04-29-verified/15-multipane-1024x800.png` (input field cropped)
- `.jez/audit-evidence/2026-04-29-verified/14-thread-open-1280x800.png` (still works — baseline)

**Suspected location:** `src/client/modules/spaces/pages/SpacePage.tsx` — three-pane flex layout. The members panel (`PEOPLE / AGENTS` aside on the left of `<main>`) and the thread aside (right of `<main>`) both have fixed widths (~256px each) that don't auto-collapse below a threshold.

**Suggested fix (any of):**

1. **Auto-close one pane below 1200px.** Cleanest. Members panel auto-collapses to icons/avatars-only below `lg`, thread can stay full width. Or thread auto-closes (with a "Thread open" indicator on the message).
2. **Squeeze pane widths.** Drop members panel from 256→200px and thread from 256→200px below a threshold. Buys ~100px of horizontal room.
3. **Make thread a slide-out drawer** (Linear-style) at < 1200px so it overlays rather than competes with the transcript.

(2) is the cheapest patch. (1) is the right architectural answer because it generalises to mobile and avoids the textarea getting squeezed to 114px wide at 1200×800 — which is a separate readability issue at the same threshold.

---

### H-2. Skills page still leads with the source editor  *(unchanged from GPT 5.5; still applies)*

**Layer:** Architecture
**Surface:** /dashboard/skills with any skill selected.
**Persona:** SME owner, doesn't write markdown.

**Reproduce:**

1. Sign in.
2. Click Skills in the sidebar.
3. Select any bundled skill (e.g. "Code review").

**Observed:** Right pane defaults to the **Source** tab — raw `---name: ... description: ...---` YAML frontmatter + markdown body. Tabs are `Source / Preview / History`. There's no Overview tab.

**Expected:** Default tab for non-author users should be **Overview** — what does this skill let my AI do, when does it fire, how do I trigger it? Source/History remain available behind tabs for builders.

**Evidence:** `.jez/audit-evidence/2026-04-29-verified/17-skills.png` (Source tab active by default, raw markdown visible)

**Suspected location:** `src/client/modules/skills/pages/SkillsPage.tsx` (or `SkillEditor` / `SkillDetail` if split). Initial tab state likely `useState("source")`.

**Suggested fix:** Add an Overview tab as default. Render skill `description` + parsed body intro + "Use in chat" CTA + sample prompts. Move Source to second tab (still useful for builders editing the skill body).

GPT 5.5 sketched this and I agree with the shape — needs its own session to do well, ~1 hour. Confirmed this is the right next session topic.

---

## Medium

### M-1. Inbox empty state leaks internal vocabulary  *(NEW)*

**Layer:** Visual / Feedback
**Surface:** /dashboard/inbox empty state.

**Reproduce:**

1. Sign in as a fresh user with no inbox findings.
2. Land on /dashboard/inbox.

**Observed:**

```
• Findings come from Routines and ad-hoc agent runs (inbox_add tool).
• Approvals come from agents proposing destructive actions (approval_queue / requestApproval).
• Power tip: press j/k to move, x to select, m to mark read, a / r to approve / reject in bulk.
```

**First-time-user lens fires** on `inbox_add tool` and `approval_queue / requestApproval` — these are internal tool identifiers that mean nothing to a SME owner. Compare to the Approvals empty state on the same site, which says: *"When the AI proposes a destructive action (sending an email, posting a message, saving a memory), it'll queue here first."* — same idea, plain English, no tool names.

The Power tip with j/k/x/m/a/r is also premature — a fresh user with zero findings doesn't need to memorise bulk shortcuts yet.

**Expected:** Plain-language description ("Findings appear when AI agents notice something while running on a schedule. Approvals appear when AI agents want to send messages, save memories, or do other actions you should sign off on."). Hide the keyboard shortcuts behind a "?" link or surface them only after the inbox has 5+ items.

**Evidence:** `.jez/audit-evidence/2026-04-29-verified/03b-inbox-after-load.png`

**Suspected location:** `src/client/modules/inbox/pages/InboxPage.tsx` empty state.

**Suggested fix:** Drop the parenthetical tool names, soften the bullets, gate the Power tip behind keyboard-shortcut hover or a non-empty inbox.

---

### M-2. Cmd+K filter dilutes at single-character input  *(confirmed — was code-predicted in earlier audit)*

**Layer:** Interaction
**Surface:** Cmd+K command palette.

**Reproduce:**

1. Press Cmd+K anywhere in the app.
2. Type a single letter, e.g. `n`.

**Observed:** 12 visible items match `n` — `New chat`, `New project`, `New space`, `New routine`, `Open inbox`, `Pending approvals`, `Connect an app`, `Inbox`, `Connections`, `Routines`, `Components`, `Settings`. All matched because each contains an `n` somewhere. The list isn't usefully narrowed until typing 3+ chars.

**Expected:** Top items should rank by usefulness rather than substring presence. Either prioritise prefix match over substring, or weight Create/Review/Setup groups above Navigation when the query is short.

**Evidence:** DOM probe captured in `.jez/audit-evidence/2026-04-29-verified/manifest.md` line 24.

**Suspected location:** `src/client/components/CommandPalette.tsx` — `cmdk` library default scoring.

**Suggested fix:** Pass `value=""` strings on Create items with extra keywords (e.g. `value="new chat new conversation create chat"`) so prefix-typed queries land them first. Or override `filter` on the `<Command>` component to prefer prefix matches.

Same workaround that the morning's audit predicted. Verified with live DOM.

---

## Low

### L-1. Template card "Use this →" affordance is hover-only (no touch hint)

**Layer:** Visual / Delight
**Surface:** /dashboard/projects → New project modal; /dashboard/spaces → New space modal; /dashboard/routines/new template strip.

**Observed:** The "Use this →" label is `opacity-0 group-hover:opacity-100` with a 150ms transition. On touch devices (iPad / phone) there's no hover, so the affordance is invisible. Cards are still tappable (the entire card is a `<button>`), and they do have iOS tap-highlight feedback, so functionally it's fine — just no visual hint that "this card is the action."

**Expected:** A discreet always-visible chevron or arrow icon at low opacity (`opacity-50`) that pops to full on hover. Stays usable on touch.

**Evidence:** Computed style probe captured during audit:

```
class: absolute right-3 top-3 text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity
opacity: 0  (default state on touch)
```

**Suspected location:** Each create-modal component renders its own template card — `src/client/modules/{projects,spaces,routines}/components/...`. Pattern is consistent across all three.

**Suggested fix:** Replace `opacity-0` with `opacity-50` (or use a small chevron icon at `opacity-40 group-hover:opacity-100`). One-line CSS change in each card component, or extract a `<TemplateCard>` primitive and fix once.

Same finding as the GPT-5.5 audit's M-3. Still defer-able — not bad enough to block, but worth fixing in the next polish pass.

---

### L-2. Cmd+K Review group duplicates Navigation group entries  *(NEW)*

**Layer:** Architecture
**Surface:** Cmd+K command palette default state.

**Observed:** Same destinations appear twice with different labels:

| In Review group | In Navigation group | Both navigate to |
|---|---|---|
| Open inbox | Inbox | /dashboard/inbox |
| Pending approvals | Approvals queue | /dashboard/approvals |

The verbs in Review distinguish them (verb vs noun), but it's still noise — when the user types `inbox`, two items match.

**Expected:** Either drop the duplicates from Navigation when they're already in Review, or make Review items distinct actions (e.g. "Triage inbox" vs "Inbox" navigation). The Review entries are meant to be verb-led shortcuts; if they go to the same screen, just one entry suffices.

**Evidence:** DOM probe of `[cmdk-group]` returned both groups simultaneously with overlapping destinations.

**Suspected location:** `src/client/components/CommandPalette.tsx` — group definitions.

**Suggested fix:** Drop `inbox` and `approvals` from the Navigation group when Review is shown (they're redundant), or gate Review entries behind unread-count > 0 (then Review only appears when there's actually something to review, while Navigation always has them).

---

## Spaces fixes verification (commit b5c71fb)

All five fixes hold up under live interaction-driven test:

| Fix | Verification | Evidence |
|---|---|---|
| **1. @assistant chip count = 1** | After mention picker + send, posted message has exactly 1 `<span>` with `bg-emerald-500` + `@assistant` text. No double-render. | DOM probe + `12-after-send.png` |
| **2. Input fully visible at 1440×900** | Verified at the entry into the space and after every multi-pane resize back to 1440. | `09-space-after-template-pick.png` + `13-thread-open-1440.png` |
| **3. Send clears input synchronously** | Immediately after click, `textarea.value === ""` (probed before any await resolved). | DOM probe inline after click |
| **4. No char-per-line wrap at 1280×800 with thread + members open** | At 1280, 1200, 1100, 1024 — message text wraps at word boundaries. `singleCharLeafElements: 2` (the `@` glyph and similar — not text wrap). The 2026-04-29 morning vertical-text bug is gone. | `14-thread-open-1280x800.png` + `15-multipane-1024x800.png` |
| **5. Mouse-click autocomplete preserves typed text** | Typed `Hi `, then `@as`. Clicked `@assistant` row in picker. Resulting input value: `Hi @assistant ` — typed prefix preserved, mention prefix replaced cleanly. | `11-after-mention-click.png` |

The fact that an actual @assistant reply ("Hello! How can I help you today?") came back through the live `agents/chat` SDK + Workers AI also exercised the message-streaming pipeline end-to-end. No console warnings, no 5xx, no auth errors.

---

## Wins worth keeping

- **Headless test-auth flow worked first try.** `POST /api/test-auth/cookies` → cookie array → `playwright-cli state-load` → `goto /dashboard` and we were Alice Tester (owner of personal org). Skipped Chrome MCP entirely. This is what unlocks autonomous audits going forward.
- **Cmd+K group structure** (Create / Review / Setup / Navigation / Actions) is right. Verbs first, navigation second. The five sections + ordering match the design intent.
- **Project + Space + Routine template cards** all render with rich descriptions, emoji, and metadata badges. They feel concrete (e.g. "Quoting · Draft, refine, and review client quotes…" with `TONE & STRUCTURE MEMORY` / `AUD INC GST DEFAULTS` / `3 STARTER PROMPTS` chips). The "Use this →" hover affordance is the right shape.
- **Solo workshop creates instantly** — pick template → land in the space, no naming step. Friendly default.
- **/connectors → /connections redirect** verified live (URL changed in browser; page title is "Connections · Vite Flare Starter").
- **Connections page copy** ("Most take 30 seconds — sign in with the provider, click Approve") is the gold-standard onboarding tone for the rest of the app to match.
- **Routines /new page** passes the first-time-user lens cleanly. Plain-English section headers ("What's this for?", "Which AI agent runs this?"), agent picker shows useful descriptions instead of class names, helper text is friendly ("Name it so future-you knows what it does"), templates have emoji + clear use-case copy.
- **Approvals empty state** is the model the Inbox empty state should copy ("destructive action (sending an email, posting a message, saving a memory)" — no internal tool names).

---

## Perfection Roadmap

### Quick wins (24-48h)

1. **L-1 template-card chevron** — change `opacity-0` to `opacity-40` + `group-hover:opacity-100` in the three template-card components. ~5 min.
2. **L-2 Cmd+K dedup** — drop `inbox` / `approvals` from Navigation group, OR make Review items condition on unread-count > 0. ~10 min.
3. **M-1 Inbox empty state** — rewrite the bullets to plain English (mirror Approvals tone), gate the keyboard-shortcuts tip behind a "Tips" expandable. ~15 min.
4. **M-2 Cmd+K filter weighting** — add `value="new chat new conversation create chat"` to Create items. ~5 min per item.

### Structural (1-2 weeks)

5. **H-1 thread/members layout collapse** — auto-close members panel below 1200px viewport (or render it as an overlay drawer). The cleanest fix is also the right mobile fix. Touches `SpacePage.tsx` + Members aside. ~1 hr including responsive testing.
6. **H-2 Skills Overview tab** — default to Overview tab, show description + sample prompts + "Use in chat" CTA, move Source to second tab. ~1 hr.

### Advanced polish (post-launch)

7. **H1 Home first-run state** (downgraded from GPT 5.5's High) — current empty state is fine for v1, but a stateful SetupChecklist that rotates through "have you connected an app / chatted / set up a routine" is nicer. ~1 hr but optional.

---

## Fix-and-verify offer

Found 2 High and 2 Medium. Three of the four are quick wins (L-1 / L-2 / M-1 / M-2 are all under 30 min combined). H-1 is the meaningful structural fix.

**Fix and re-verify in this session?** — yes / no
- Quick subset (L-1, L-2, M-1, M-2 only): ~30 min, then re-walk Cmd+K + Inbox + each template modal.
- Full subset (above + H-1 thread/members layout): ~1.5 hr, then re-walk the spaces multi-pane stress at 1024 / 1100 / 1200.
- Full + H-2 Skills Overview: ~2.5 hr, then re-walk Skills as a fresh user.

---

**Audit run-time:** ~14 min from cookie mint to verdict file write.
**Tools used:** test-auth `/api/test-auth/cookies` + `playwright-cli` (Bash) + DOM probes via `eval`. No Chrome MCP needed.
**Manifest:** `.jez/audit-evidence/2026-04-29-verified/manifest.md`
**Evidence:** `.jez/audit-evidence/2026-04-29-verified/*.png`
