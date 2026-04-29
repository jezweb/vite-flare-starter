# Design Review — 2026-04-29 (post-GPT-5.5 fixes)

**Site:** https://vite-flare-starter.webfonts.workers.dev
**Persona:** SME owner returning Tuesday morning to verify the friction Jez asked us to fix is actually gone.
**Method:** code-level review of the changes shipped between commits `201eeb8..e87061d` (Chrome MCP extension was disconnected; this audit reads the diffs + reasons through the rendered code paths).
**Scope:** only the surfaces touched by today's batch — Command Palette, template cards, approval badge, /connections rename, console warnings.

---

## Summary

Today's batch lands cleanly. The big move — turning Cmd+K from a navigation list into an action layer — works. The "Use this →" affordance is the right shape (subtle, on hover, doesn't compete with primary content). The route rename was overdue; vocabulary now matches everywhere.

Two of GPT 5.5's high-priority items remain unaddressed because they're real redesigns, not polish:
- **H1 Home first-run state** — still important; the existing Home presumes you've already done setup.
- **H2 Skills user-first overview** — still important; the page still leads with editor surface.

Both should be a fresh session. Today's batch was about closing rough edges; those two are product reframes.

---

## Critical
None. Today's batch shipped clean.

---

## High — open from GPT 5.5 review (deferred to a fresh session)

### H1. Home still needs a first-run state — confirmed still important

The existing Dashboard home leads with "Pending review" and "Recent agent runs". For a brand-new user with zero connections, zero projects, zero approvals, zero runs, the home is mostly empty cards with explanatory text. Today's batch made the rest of the app friendlier but didn't change Home itself.

**What "still important" looks like in practice**: a new SME owner lands and the page asks "have you connected an app yet?" with a one-click Connect Gmail. Then "have you tried a chat?" Then "want to set up a routine?" Stateful — the moment Connections has an entry, the prompt rotates to the next.

This is meaningfully bigger than a sweep. It needs the `<Welcome>` / `<SetupChecklist>` primitive design + a state-driven render. Defer to a session that focuses on it.

### H2. Skills page still editor-first — confirmed

The Skills page renders a 320px list on the left and a Markdown editor on the right. For a user who hasn't done builder work, opening Skills and being shown raw SKILL.md content is the wrong first impression. They want "what does this skill let my AI do, and how do I trigger it?"

The fix sketched by GPT 5.5 — add an Overview tab that shows description + example prompts + "Use in chat" — is the right move. Source/History tabs stay for builders. Worth a fresh session.

---

## Medium — minor issues from today's batch

### M-1. Static command palette items don't dim/hide while typing
**Surface:** Cmd+K with a query like "morning"

cmdk filters CommandItems by their visible text. Typing "morning" doesn't match "New chat"/"New project"/"Connect an app" — so they correctly hide. Good. But typing "n" matches almost every item ("New", "Open", "Connect an", "Browse"), so the palette doesn't usefully filter until the user types 3+ chars.

Not a regression, just a property of the new content. **No fix this session.** If it bites in dogfood, the workaround is to add explicit `value=` strings on the create items so cmdk can match keywords beyond the visible label (e.g. `value="new chat new conversation create chat"`).

### M-2. "New chat" command palette item passes `?new=1` to a route that ignores it
**Surface:** Cmd+K → New chat
**Diagnosis:** ChatPage routes off `:conversationId` from URL params, not query strings. Navigating to `/dashboard/chat?new=1` shows the empty state correctly because there's no conversationId — the `?new=1` is decoration that does nothing.

Not broken (empty state shows as intended), just slightly confusing in the URL. Trivial cleanup — drop `?new=1` from the New chat item OR have ChatPage strip the param on mount for cosmetic reasons. Defer.

### M-3. Template card "Use this →" affordance only on hover — no touch hint
**Surface:** /routines/new template cards

The hover affordance "Use this →" is opacity-0 → opacity-100 on `:hover`. On touch devices (mobile, iPad), there's no hover state, so the affordance never appears. The card is still tappable (the entire button has onClick), but the affordance is desktop-only.

Mitigation: cards on touch are still obviously buttons (they have a border + padding + the text "Routine health" reads as a label, and tapping has visible feedback through the iOS tap-highlight). The affordance is a desktop polish, not a critical signal.

**Defer.** If touch UX testing reveals confusion, swap from `opacity-0 group-hover:opacity-100` to a permanently-shown small chevron/arrow that's `opacity-50 group-hover:opacity-100` so it's always visible at low contrast and pops on hover.

### M-4. `?new=1` strip uses `useEffect` with empty deps — fires twice in React 18 strict mode (dev only)
**Surface:** ProjectsIndexPage + SpacesIndexPage on first mount

In React 18 strict mode (dev), `useEffect` with `[]` deps fires twice. The first fire sets `createOpen=true` and removes `?new=1` from the URL; the second fire sees no `?new=1` and does nothing. Behaviour is correct but the lint rule is disabled with `// eslint-disable-next-line`. Production ships in non-strict so it fires once anyway.

**No fix needed.** This is the same pattern the chat page uses for `q` and `sharedText`.

---

## Low

### L-1. Template "Use this →" hint can shift card padding on hover
**Surface:** /routines/new template cards

The hint is positioned `absolute right-2 top-2`. The card has `p-3`. The hint sits above the title content, but if the title wraps to two lines on a narrow viewport, the hint may overlap the title. Verified: titles are short ("Routine health (meta)" is the longest, fits one line at all common viewport widths).

**No action needed.** Worth re-checking after non-ASCII templates ship (e.g. a title in Chinese or German that's longer).

### L-2. Approval "Older than a day" badge wording
**Surface:** /dashboard/approvals first card

Old: "Stale" — implied broken.
New: "Older than a day" — describes the time fact.

Reads better but slightly long. A shorter alternative: "1+ day old" or "Aged". The current copy is fine; this is taste, not a bug.

### L-3. Connections route rename is mostly clean — one edge case
**Surface:** /dashboard/connectors → /dashboard/connections redirect

Verified the redirect is registered. Internal Link refs all migrated. Server-side OAuth callback redirects updated. One edge case: an external bookmark to `/dashboard/connectors` works (redirects), so existing users with the old URL bookmarked don't see a 404. The legacy alias can be removed in 30 days once nobody hits it.

---

## Console warnings — verified

- ✅ Manifest `enctype` warning — fixed by adding `"enctype": "application/x-www-form-urlencoded"` to share_target.
- ✅ VoiceClient protocol warning — fixed by gating `<VoiceDictationButton>` behind `features.voiceAgent`. The hook only initialises when the DO is actually wired.

---

## Wins worth keeping

- **Command palette as action layer** — the Create / Review / Setup grouping reads correctly. Verbs first, navigation second. Cmd+K now feels like the productivity layer it should be.
- **Template card affordances** — "Use this →" + selected ring on routine cards reads as a button, not a static example. Same hover pattern in space + project modals (lighter — just the hint, no selected state because those modals create-on-click).
- **/connections rename** — vocabulary matches everywhere. URL, sidebar label, page title all say the same word.
- **Approval card layout from earlier today** — Reject / Approve / Approve and stop asking land right after the proposal preview. "Older than a day" badge shows context without alarming.

---

## Bottom line

Today's batch shipped six small fixes that close the rough edges GPT 5.5 flagged. The **two big remaining items** (Home first-run state, Skills user-first overview) are the right next session topics — they're product reframes, not polish, and benefit from fresh context to hold the design intent end-to-end.

Recommended order for next session:
1. Home first-run state (~1 hr) — needs new SetupChecklist primitive + state-driven render
2. Skills user-first overview (~1 hr) — needs SkillEditor → SkillDetail rename + Overview tab as default

Defer brains-trust round 3 until both of those have shipped and dogfooded for a few days.
