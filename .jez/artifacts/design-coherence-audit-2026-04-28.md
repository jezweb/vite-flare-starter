# Design Coherence Audit — 2026-04-28

**Triggered by:** Jez's feedback after walking the deployed app —
"feels a bit busy", "feels too much like dev tool", "could do with a
bit more design coherence". Six concrete examples surfaced (see below);
this audit zooms out from those to look at the whole journey.

**Premise:** This is a starter / pattern library, not a finished
product. But coherence is itself a pattern — if a fork-user inherits
inconsistent spacing, mixed tone of voice, and three different ways
of presenting the same kind of information, they'll multiply that mess
across their own surfaces. Coherence is the asset.

**Method:** Code-walkthrough across all 12 primary surfaces, looking
for the same six properties on every one. Then cross-reference patterns
from leading apps (Linear, Notion, Slack, claude.ai, ChatGPT, Vercel).

---

## What Jez flagged in this round

| # | Surface | Observation | Severity |
|---|---|---|---|
| F1 | Dashboard | "What needs you" — odd phrase | **Fixed this round** → "Pending review" |
| F2 | Approval card | Still busy / dev-toolish | **Fixed this round** → plain title + Technical details disclosure |
| F3 | Approval card | "What am I being asked to approve, why, in simple terms" | **Fixed this round** → "The AI wants to remember…" + memory preview |
| F4 | Chat tool-call card | Curly-brace JSON too big, no wrapping, extends right | **Fixed this round** → smaller font, word-break, both sections collapsed |
| F5 | Chat tool result | Inbox ID shown raw — should be a link / subject | **Fixed this round** → tool render summary now shows the agent's `summary` |
| F6 | Inbox rows | Tall rows; unclear if clickable / expandable | **Fixed this round** → list rows with hover, chevron, clearer affordance |

All six landed in commit `[forthcoming]`.

The deeper concern Jez raised was that these point findings come from
a thinner underlying problem — *visual + semantic incoherence across
pages*. Below is a structured pass.

---

## Six properties that mark UI coherence

Walked every page and graded each on the same six axes:

### 1. **Density** — how much air between rows / cards / sections

| Page | Density | Notes |
|---|---|---|
| Dashboard | Medium | Cards with 16–24px padding inside; spacing OK |
| RoutinesPage | Medium-tight | List rows good |
| ApprovalsPage | Loose (after fix) | Card-per-row felt heavy; trimmed today |
| InboxPage | Loose → tight | **Just changed** to flat list rows with dividers |
| ActivityPage | Tight | Already row-based |
| ConnectorsPage | Loose | Connection cards big — fine for scan-and-pick |
| SkillsPage | Loose | List/detail split, OK density |
| ChatPage | Variable | Fine |

**Pattern violation:** ApprovalsPage and InboxPage were both rendering
"a stream of cards with vertical breathing room" when they should be
"a queue of dense rows that scan top-to-bottom". After this round both
match the tight-row pattern.

**Recommendation:** Adopt a project-wide rule:
- **Card layout** for things you spend time *inside* (Routine details,
  Skill editor, Project workspaces).
- **Row layout** with `divide-y` for things you scan as a *queue*
  (Inbox, Approvals, Activity, Routines list).

### 2. **Vocabulary** — names for the same concept stay the same everywhere

Examples found in this audit:
- "Approval" / "Pending approvals" / "Review" / "Needs approval" / "Pending review" — all referring to the queue
- "Agent" / "AI" / "AI assistant" — used interchangeably
- "Routine" / "Recurring agent" / "Routine config" — three names for one thing
- "Connector" / "Connection" / "App" — three names for one thing

**Recommendation:** Pick a canonical noun per concept and enforce it
in user-facing copy:

| Concept | Use everywhere |
|---|---|
| The queue of things waiting on the user | **Pending review** |
| The AI assistant in chat | **AI** (lowercase, not "the AI assistant") |
| Recurring scheduled agent | **Routine** |
| A connected external app | **Connection** (the noun) / **Connect** (the verb) |
| A finding emitted by an agent | **Finding** (noun) — not "Inbox item", not "Notification" |

This becomes a pre-merge linting concern. We could pin it as
`docs/VOCABULARY.md` and reference it in `.claude/rules/`.

### 3. **Tone of voice** — copy reads from the user's perspective

Currently mixed:
- `"Pending approvals from your agents."` — second person ✓
- `"3 items waiting for your review."` — second person ✓
- `"Multi-user, multi-agent rooms"` — feature-list voice ✗
- `"Reusable agent procedures"` — technical / catalog voice ✗
- `"Findings + approvals, sorted by importance and due date."` —
  technical / catalog voice ✗

**Pattern from claude.ai:** copy is always first or second person,
present tense, action-oriented. *"Start a new chat"*, *"Pick up where
you left off"*, *"Save this for later"*. We drift to feature-list
voice on landing copy and module descriptions.

**Recommendation:** Rewrite all "page subtitle" copy in the user's
voice. Each page's `<h1>` subtitle should answer *"what am I doing
here?"* in plain language.

### 4. **Visual hierarchy** — the most important thing on the page is the loudest

| Page | Hierarchy clear? | Issue |
|---|---|---|
| Dashboard | ✓ | Greeting + count + two panels works |
| RoutinesPage | ✓ | After Stage 4 fixes |
| ApprovalsPage | ✓ (after this round) | Title now leads, status pill demoted |
| InboxPage | mixed | High importance pill → good signal; rest of metadata blends |
| NewRoutinePage | ✓ | Plain-language section headers, full-width selects |
| ChatPage | ✓ | Conversation panel correctly dominates |
| ConnectorsPage | mixed | Native panels (GoogleWorkspace, Microsoft, stub) compete with the connector list for primary attention |

**Issue on ConnectorsPage:** the page renders `<GoogleWorkspacePanel />`,
`<MicrosoftWorkspacePanel />`, three `<StubConnectorPanel />`s, and the
MCP connections grid below. Five top-level panels with no visual
grouping. A novice doesn't know which to look at.

**Recommendation:** Group ConnectorsPage into 2–3 sections with
section headers — `Connect Google Workspace`, `Connect Microsoft`,
`Other connections`. Use `<h2>` between them, not five sibling cards.

### 5. **Click affordance** — clickable things look clickable, decorative things don't

Currently:
- ✓ Buttons look like buttons (good shadcn defaults)
- ✓ Links are styled consistently in body copy
- ✗ **Inbox rows** — were big tall cards with no chevron / no underline
  / no obvious "this opens something". Now improved.
- ✗ **Tool-call cards in chat** — header is clickable to expand but
  the chevron only shows after hover; new users wouldn't know.
  *(Open question; not fixed today.)*
- ✗ **Capability cards on Dashboard** — some link to routes, some
  don't, with no visual difference.

**Recommendation:** Three signals say "I'm clickable" — chevron on the
right, hover-bg shift, cursor change. Pick at least two for any
list-row pattern. Pick all three for primary interactive grids.

### 6. **Empty / loading / error states** — every panel teaches you something

The starter actually does this well already (most empty states have
icon + headline + description + tips bullets + primary CTA). The
exception is the chat tool-call card when its renderer returns no
expanded content — currently the FallbackToolBody dumps raw JSON
which is what got Jez. Today's fix made the JSON compact and
collapsed by default; the durable fix is that **every domain tool
should ship a custom expanded renderer** so we never see the
FallbackToolBody in production.

**Recommendation:** When adding a new tool, the convention should
require a custom `expanded` renderer if the output isn't trivially
small. Add a TODO list in `docs/AGENT_TOOLKIT.md` of tools that
still fall through to the JSON fallback.

---

## Patterns worth adopting from leading apps

Studying claude.ai, Linear, Notion, Slack, ChatGPT, and Vercel:

### Linear
- **Tight list rows with divide-y, no internal padding inflation** —
  what we just adopted on Inbox.
- **Status icons consistently leading every row** — same icon,
  same colour family, every list. We're inconsistent (sometimes
  status badge, sometimes coloured dot, sometimes outcome icon).
- **Command palette as the primary action** — Cmd+K everywhere does
  navigation + most-used actions. We have CommandPalette already;
  could lean harder into it.

### Notion
- **One canonical "block" pattern** — Notion's `<Block />` with consistent
  hover-toolbar, drag-handle, indentation. Every editable thing is the
  same primitive. Our equivalent should be the **list-row** + **detail-pane**
  pattern; right now it's reinvented per module.
- **Empty-state pages with a 60% / 40% split** — illustration on
  one side, action stack on the other. We do icon + headline + tips
  + CTA already.

### Slack
- **Density on left rail, content on right** — left rail items are
  ~28px tall, no padding waste. We're at ~36px which is fine.
- **The unread/read affordance** — bold weight + colored line.
  We have it on Inbox now.

### claude.ai
- **Default new-chat empty state** — greeting + 4 example prompts
  in chips. Returning users see recent conversations + the new-chat
  card. We have a similar pattern on the Dashboard.
- **Sidebar reserved for primary navigation; admin stuff in a
  user-menu dropdown** — exactly what we already do.
- **Plain-language tooltip + body copy** — "Search your chats", not
  "Search across conversation history with FTS5".

### ChatGPT
- **Tool calls render as a small inline pill that expands on demand,
  not as a full card** — we have the right structure (`ToolCard`),
  but the FallbackToolBody is too verbose. This round trimmed it.

### Vercel dashboard
- **Status colour discipline** — green / amber / red used consistently
  for success / warning / error across every module. We mostly do this
  but have some drift (some modules use blue for info, some use
  primary).
- **Section dividers (`<hr>` with section title)** — used to break long
  pages into scannable sections. Could help on ConnectorsPage.

---

## Phased recommendations

If we treat this as a multi-step "design polish pass", here's the
order I'd run it:

### Phase A — quick wins (this round, mostly done)
- [x] "What needs you" → "Pending review"
- [x] Approval card hero in plain language; technical metadata under disclosure
- [x] Tool-call FallbackToolBody compact + wrap + collapsed
- [x] Inbox tool render shows the agent's summary, not a UUID
- [x] Inbox rows redesign — tight list with divide-y + chevron affordance

### Phase B — vocabulary + tone-of-voice consolidation (1–2 hrs)
- [ ] Write `docs/VOCABULARY.md` with canonical nouns
- [ ] Sweep every page subtitle for "feature-list voice" → user voice
- [ ] Pick one canonical "Pending review" / "Needs approval" / etc., not three
- [ ] Update the `dev-tools:ux-audit` skill with a vocabulary check

### Phase C — list-row vs card-detail consistency (2–3 hrs)
- [ ] Adopt the **list-row** primitive everywhere a queue is shown
  (Inbox ✓, Approvals, Activity, Routines, Skills, Notifications)
- [ ] Adopt **card-detail** primitive everywhere the user dwells
  (Routine detail, Skill editor, Project workspace)
- [ ] Document both in `docs/PATTERNS.md` with a single working
  reference per pattern

### Phase D — visual polish sweep (1 day)
- [ ] Run `dev-tools:design-review` skill against every page
- [ ] Eyedropper greys app-wide, replace raw hex with design tokens
- [ ] Animation timings audit → 150 / 200 / 300 / 500ms scale only
- [ ] Optical centring pass on every button + badge + icon-with-label

### Phase E — connector page restructuring (3–4 hrs)
- [ ] Group native + MCP connectors under `<h2>` section headers
- [ ] Replace technical opener with two-tier copy (already partially
  done this round, but the page still has 5 sibling panels)
- [ ] Move stub connectors below the divider so they don't compete
  with the working ones

### Phase F — chat tool-call renderer audit (1 day)
- [ ] Inventory tools that fall through to FallbackToolBody
- [ ] Write rich `expanded` renderers for the top 10 by usage
- [ ] Rule: any new tool added to the catalogue requires a renderer
  unless its output is trivially small

---

## What's NOT a design problem

To keep this honest — these are coherence wins already in place,
shouldn't be touched:

- The sidebar (Main / You / More) — Slack/Linear convention, working
- OrgSwitcher in sidebar header — convention is right
- Greeting + pendingCount on Dashboard — voice is correct
- shadcn/ui as the underlying primitive set — consistent enough
- The "Pages over modals" rule from CLAUDE.md — actively prevents
  drift
- The format-helpers + metadata pattern from session 2026-04-28 — this
  is the correct fix for vocabulary at the data layer

---

## Reading list (for future passes)

If we want to keep deepening this, the patterns library worth studying
in detail:

- **Linear's design system** (https://linear.app — open the keyboard
  shortcuts modal, the inbox, the issue detail; everything Slack-density)
- **Notion's** block pattern — every editable thing is one component
- **claude.ai's** empty states + recent items grid
- **Vercel's** dashboard status patterns
- **shadcn/ui showcases** — https://ui.shadcn.com/examples

For inspiration on the journey side (what the user is actually doing
when they sign in):
- **Cursor's onboarding** — three-step setup with concrete first task
- **Replit's "what do you want to build?" flow** — empty state that
  *teaches* by example

---

## Closing note

Jez's instinct is right: each individual fix is small, but together
they compound into a less coherent product. The single biggest win
for the starter is to make the *meta-rules* explicit (vocabulary,
list-row vs card pattern, two-tier copy) so a fork-user picks them
up automatically. That's what `docs/PATTERNS.md` and the
`dev-tools:ux-audit` skill are for; they need the additions from
Phase B–F above.

If we ship Phase B (vocabulary + tone) in the next session and then
let the codebase soak with the new conventions for a week or two
before doing Phase C, we'll see whether the coherence is durable
without bigger restructuring. My instinct is yes — the bones are
fine, the chrome needs a polish pass.
