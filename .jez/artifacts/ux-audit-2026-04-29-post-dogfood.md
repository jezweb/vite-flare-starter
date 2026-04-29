# UX Audit — 2026-04-29 (post-dogfood)

**Persona**: a busy SME owner handed a Jezweb-built starter on Monday morning. 5 minutes before the next meeting. Will close the tab if anything stalls, confuses, or feels broken.

**URL**: https://vite-flare-starter.webfonts.workers.dev (post-deploy `079bab02-8cad-4edf-8a8f-ae03cf762adc`)

**Method**: walked every nav surface via Chrome MCP, captured DOM contents, traced keyboard flows, inspected default values, looked for jargon / broken affordances / silent failures.

---

## Already fixed in the same session (commits `2099523` + earlier)

- **Project chat lost-text bug** — typing in the project quick-chat then clicking "Start chat" silently dropped the text. Fixed: ChatPage now reads `?q=` and auto-sends. Verified live with "Test prompt from UX audit" — text survived.
- **Memory default flipped** — schema default changed from `'ask'` to `'auto'` for both `user.memoryUpdateMode` and `projects.memoryUpdateMode`. New users land in the "AI memory just works" state.
- **Inbox findings looked clickable but did nothing** — chevron dropped for findings, click now toggles read state both ways.
- **"Optional note for the audit log"** — hidden behind a collapsed disclosure. Most users never wrote in it.
- **Approval action buttons buried under metadata** — moved Reject / Approve up to right after the proposal preview.

---

## Critical (still open) — fix this session

### C-1. Existing users still default to `'ask'` — schema flip only helps new users
Even after the schema default flip in commit `2099523`, Jez's own user row still has `memoryUpdateMode='ask'` because the row was created before the change. New users get `'auto'`; existing users have to flip manually.

**Risk**: every existing user who experienced the friction (Jez's own report) still experiences it.
**Fix**: write a one-time migration that flips `'ask'` → `'auto'` on existing rows. Justification: `'ask'` was the *only* default for the old schema, so users with `'ask'` haven't deliberately chosen — they got the default. Anyone who deliberately wants `'ask'` can flip back from Settings → Memory.

### C-2. Slug leakage in pending approvals + dashboard summary
"Add user memory: tool-troubleshooting-preference" — the slug `tool-troubleshooting-preference` is the agent's internal ID, not friendly copy. Same on:
- Dashboard "Pending review" pane (3 rows, all show slugs)
- Inbox (3 rows)
- Approvals page card titles

**Risk**: an SME owner reads "tool-troubleshooting-preference" and thinks "what?". Internal language leaking to the user is the kind of thing Jez specifically called out.

**Fix**: at the source — when memory updates are added to the approvals queue, the summary should be human-readable: "Add a memory about tool troubleshooting preferences" or just "Update memory: a tool troubleshooting preference". Or use a `formatMemoryKey` helper to title-case the slug for display while keeping it as the database key. Same shape as `formatSkillName`.

---

## High (still open) — fix this session

### H-1. "Slice 5 inbox dogfood" leaks dev-time naming
The Inbox row "Slice 5 inbox dogfood — agent emitted a finding via the channel tool" mixes internal dev language ("Slice 5", "channel tool") into a user-facing summary. Trips the "what is this?" reaction.

**Risk**: low for one-off dogfood rows but the pattern (agent emits a free-form summary that ends up in front of the user) recurs. Findings come from tool calls; the tool's text becomes user-facing without sanitisation.

**Fix**: not actionable on the row itself (the agent wrote it), but: this is THIS user's test data from earlier dev sessions. Cleanup: delete that one row from the Inbox. Pattern fix: add documentation guidance for fork-users on writing user-facing summaries from agent tools.

### H-2. Connections page — "MCP" jargon visible without context
The Connections page says "Connect Gmail, Calendar, Drive, Notion, Slack, and other apps so your AI can read and act on them" (good copy) — but the body text contains "MCP" once. An SME owner doesn't know what MCP is.

**Fix**: replace the single MCP reference with "custom connection" or "URL-based integration". Reserve the acronym for documentation / developer surfaces.

### H-3. Empty Spaces / Files / Inbox states could lead with the "what now?" action
Most empty states are good ("Nothing to review" with a CTA to Routines). The space empty state isn't visited here (Jez has 1 space already). Check: does the no-spaces state actually surface "Create space"? If the modal is templates-first now, the empty state should also lead with one of those templates as a one-click create.

**Fix**: low effort, modify the EmptyState `action` to point at the New space modal already templates-first.

### H-4. Landing page H1 "Multi-user. Multi-agent. Built at the edge." reads like dev marketing
For a fork-user (developer), this is fine. For Jez's persona (SME owner who got the URL handed over), they may bounce here before even hitting `/sign-in`. The landing is currently optimised for developers evaluating the starter.

**Fix**: this is intentional product positioning (it IS a starter kit aimed at developers). Mark as **deferred** — out of scope for the SME persona since they'd land on `/sign-in` directly. Worth a future session for a customer-facing fork to rewrite the landing.

---

## Medium — punch list for later

### M-1. "Default model" label on the project quick-chat input
Showing "Default model" as the metadata under a chat input doesn't tell the user anything actionable. Either show the actual model name (e.g. "Kimi K2.6") or omit when defaulted.

### M-2. Dashboard hero greeting truncation
"Good afternoon, Jeremy" — works. But "3 items waiting for your review" is a soft summary; the count clicks through to the inbox? Test it actually does.

### M-3. Activity row — "CreatedSession" shows the raw session ID
"CreatedSession xvIsfu0FYPuMGZ7fgPwL4A0JA8qu2eDh about 15 hours ago" — the session ID is meaningless to the user. The activity feed is a power-user surface, but session IDs should be hidden or shown as "Session" with the ID in a tooltip.

### M-4. Inbox summary chips overlap
On narrow widths the "Test Finding · 1 day ago · Mark unread" hover row may overflow. Spot-check at < 500px.

### M-5. Skills page count "44" (per query) but the catalog claims 22
The DOM probe found 44 buttons matching the skills selector — possibly because the right pane also has buttons. Not a regression but worth tightening the selector.

### M-6. Connections page's panel headers — every connector says the same boilerplate
Each connector card says basically the same setup blurb. Once the user has seen one, the others are noise. A condensed list view (one row per connector with a Connect button) would scale better than 6 stacked cards.

### M-7. Settings → AI tab name vs Chat preferences
The Settings tab is labelled "AI" but the section is "Chat preferences". Inconsistent label.

### M-8. Files empty state weighs the "Drop a file" hint above the upload button
"Drop a file here or in chat — your AI can read PDFs, images, and CSVs and use them in answers" is good copy but the Upload button gets crowded out by the explanatory text. Reverse the visual weight.

### M-9. Project right-pane Memory + Instructions shown but never explained
A first-time visitor opening a project sees "Memory" and "Instructions" panels with empty states, but no plain-English explanation of when those would help. They look like advanced settings.

---

## Low — nice-to-have polish

### L-1. Welcome strip greeting ("Good afternoon, Jeremy") doesn't change at midnight
Probably fine, but worth confirming the greeting reflects the user's timezone.

### L-2. Notifications "Channels-as-tools dogfood" text in user-facing messages
Same dev-jargon-leak pattern as H-1. Lower priority because notifications are short-lived.

### L-3. Mobile sidebar — no drawer hint on first open
Users on mobile don't see the sidebar trigger affordance until they tap. Adding a `Tip: tap the menu icon to navigate` once on first visit could help, but it's also normal app behaviour.

### L-4. Routines list — "Disabled" badge could be clearer than relying on a status pill
A disabled routine reads "AI assistant Disabled". Putting "Paused" might be more friendly than "Disabled" (which sounds broken).

---

## Wins worth keeping (positive findings)

- Project chat handoff now works end-to-end after C-1 fix.
- Approval card layout (Reject / Approve right after proposal preview) tested live and the visual weight of the action area is now correct.
- Inbox keyboard navigation (j/k/x/m/a/r) discoverable via the hint strip.
- Skills row labels read as titles ("Code Review", "Document QA", "CSV Analyse") with slug as detail — tested live.
- Capability chips on chat empty state surface "Outlook · OneDrive · Calendar · 22 skills" — tells the user what their AI can do at a glance.
- No console errors anywhere on Home / Inbox / Chat / Projects / Spaces / Routines / Skills / Connectors / Activity / Notifications / Settings.

---

## Plan: fix this session

1. **C-1** — write migration to flip existing `'ask'` → `'auto'` on user + projects rows
2. **C-2** — add `formatMemoryKey` helper, use in approval card title + dashboard summary + inbox summary
3. **H-1** — delete the test "Slice 5 inbox dogfood" finding from Jez's inbox via API
4. **H-2** — replace single "MCP" reference on Connections page
5. **H-3** — verify and fix Spaces empty state CTA

Defer everything else to the punch list.
