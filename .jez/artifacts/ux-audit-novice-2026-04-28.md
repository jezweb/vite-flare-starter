# Novice-User UX Audit — 2026-04-28

**Persona:** Brand-new user signing in for the first time. Non-technical
business owner / operator. No source access, no internal docs. Wants to
"get useful work done for the business" — *not* understand the framework.

**Method:** Code-walkthrough audit (live deploy was blocked by expired
Wrangler auth — flagged at the bottom of this report). Walked every
primary nav surface and graded against the first-time-user lens added
to `dev-tools:ux-audit` in this session.

**Goal:** Find every place a novice would say "I don't know what this
means / what to type / what to pick" and either fix it or queue it.

## Coverage

| Surface | Inspected | Severity hits |
|---|---|---|
| LandingPage | yes | 0 (developer pitch — audience-correct) |
| DashboardPage (Home) | yes | 2 (one Critical, one Medium) |
| ConnectorsPage | yes | 4 (one Critical, two High, one Medium) |
| RoutinesPage | yes | 0 (Stage 4 sweep handled it) |
| RoutineDetailPage | yes | 0 (Stage 4 sweep handled it) |
| NewRoutinePage | yes | 0 (Stage 3 rewrite handled it) |
| InboxPage | yes | 0 (Stage 4 sweep handled it) |
| ApprovalsPage | yes | 0 (Stage 4 sweep handled it) |
| ActivityPage | yes | 1 (Low) |
| SkillsPage | yes | 2 (Medium, Low) |
| SpacesIndexPage | yes | 1 (Medium) |
| Admin → MembersList | yes | 0 (Stage 4 sweep handled it) |

12 surfaces inspected, 10 findings ranked below.

---

## Critical findings (do these first)

### C1. DashboardPage / "Recent agent runs" still leaks `agentClass` mono font

**Location:** `src/client/pages/DashboardPage.tsx:260`

A novice landing on the home page sees:

```
✓ AssistantAgent       schedule    2 min ago
✗ ResearcherAgent      manual      5 min ago
```

The first column is the raw class name in monospace. Stage 4 swept
this out everywhere except the home page. The home page is the *first*
place a novice ever sees agent names, so it's the most important one.

**Fix:** swap the `<span className="font-mono text-xs">{run.agentClass}</span>`
on line 260 for `formatAgentClass(run.agentClass, agentRegistry)` using
`useAgentCatalog()`. Also use `formatTrigger(run.trigger)` on line 262
instead of `run.trigger.replace('_', ' ')`.

Effort: 5 min. Same shape as Stage 4b/4c.

### C2. ConnectorsPage opening sentence is jargon

**Location:** `src/client/modules/connectors/pages/ConnectorsPage.tsx:107-109`

> *"Give the AI access to external tools via the Model Context Protocol.
> Paste any MCP server URL — public, community-hosted, or your own
> Cloudflare Worker. OAuth and bearer tokens both work; tokens are
> encrypted at rest."*

Every term in this sentence requires technical background:
- "Model Context Protocol" — what is that?
- "MCP server URL" — what's an MCP server?
- "community-hosted" / "your own Cloudflare Worker" — what?
- "OAuth and bearer tokens" — OK for technical users, opaque for novices.

A novice sees this and assumes the page isn't for them, even though
this is THE page for connecting Gmail / Calendar / Drive — exactly
what a novice business owner needs.

**Fix:** Two-tier copy. Lead sentence in plain English; "Learn more"
disclosure for the technical detail.

```
Connect Gmail, Calendar, Drive, Notion, Slack, and other apps so
the AI can read and act on them for you. Most connections take 30
seconds (sign in with Google, click Approve).

▾ Technical details
   Powered by Model Context Protocol (MCP). Paste any MCP server URL
   — public, community-hosted, or your own Cloudflare Worker. OAuth
   and bearer tokens both supported; tokens are encrypted at rest.
```

Effort: 10 min.

---

## High-severity findings

### H1. Custom connector dialog uses jargon-only copy

**Location:** `src/client/modules/connectors/pages/ConnectorsPage.tsx:443-505` (CustomConnectorDialog)

The dialog title is "Add custom connector" with body:

> *"Point at any MCP server URL. We'll inspect the endpoint to discover
> its auth method, then walk you through OAuth or let you paste a bearer
> token."*

Then a placeholder of `https://my-mcp-server.example.com/mcp` and a
"Probe" button (with no explanation of what probing means).

Novice has no chance. They see "Add custom connector" — they don't have
one to add. They click anyway out of curiosity, see the dialog, and
back out.

**Fix:**
- Title: "Connect a custom app"
- Body: "If your business uses an app that isn't in our list, paste its
  connection URL here and we'll set it up. Most apps come from the
  Examples list — click that button instead if you're not sure."
- Placeholder: keep as-is (still right for the URL)
- Rename "Probe" → "Test connection"
- Auto-test on URL paste so the button only fires for retry

Effort: 15 min.

### H2. ConnectorsPage "Examples" should be the primary CTA, not the secondary

**Location:** `src/client/modules/connectors/pages/ConnectorsPage.tsx:111-120`

Current button order (right side, primary first):

```
[ Examples ]  [ + Add connector ]
```

A novice doesn't have a connector to add. They want examples. The
primary action (`Add connector`) leads them into the H1 dialog above
which actively confuses them. The Examples dialog has Gmail / Calendar
/ Drive / Notion / Slack — exactly what they want.

**Fix:** Promote Examples to primary, demote "Add connector" to a
discoverable secondary. Or rename the secondary to "Add custom app"
and put it next to Examples without primary styling.

Effort: 5 min.

---

## Medium-severity findings

### M1. SpacesIndexPage description is conceptually-overloaded

**Location:** `src/client/modules/spaces/pages/SpacesIndexPage.tsx:80`

> *"Multi-user, multi-agent rooms. @-mention agents to ask them to help."*

Novice questions:
- "Why would I have multiple agents?"
- "What's a 'room'?"
- "How do I @-mention?"

This is the empty-state version of "I don't know what this is for".

**Fix:** Lead with the *outcome*, then the mechanic.

> *"Group chats with the AI. Invite teammates, switch between AI agents
> for different jobs (researcher, writer, support), and keep history in
> one place. Type @ to call an agent into the chat."*

Effort: 5 min.

### M2. DashboardPage "Quick actions" includes pages a novice can't use yet

**Location:** `src/client/pages/DashboardPage.tsx:271-292`

Quick actions row: AI Chat / Skills / Connectors / Projects.

For a brand-new user with no skills, no connectors, no projects, three
of the four buttons land on empty states. AI Chat is the only one with
a clear "do something now" payoff.

**Fix:** When the user's onboarding state is empty (no connectors yet,
no skills enabled, no projects), reorder Quick Actions to lead with
"Connect your apps" → "Open AI Chat" → fallthroughs. Show "Skills"
and "Projects" only after a first connector exists.

This pattern exists in claude.ai's home page (their "Getting started"
strip changes based on state).

Effort: 30 min.

### M3. SkillsPage "Sync bundled" is jargon

**Location:** `src/client/modules/skills/pages/SkillsPage.tsx:130-137`

The button label "Sync bundled" tells a novice nothing. What's
bundled? Sync from where to where? What happens if I click?

**Fix:** Rename to "Refresh starter skills" with hover tooltip "Re-imports
the example skills bundled with the app. Safe to run any time."

Effort: 2 min.

---

## Low-severity findings

### L1. ActivityPage entity types still raw lowercase strings in tooltips and aria-labels

**Location:** `src/client/modules/activity/pages/ActivityPage.tsx`

The Stage 4e sweep formatted the on-screen labels (Title Case in the
Badge), but if a screen reader / assistive tech reads `entityType` from
ARIA attributes elsewhere it might still get raw lowercase.

**Fix:** Spot-check `aria-label` / `title` / `alt` attributes on
Activity rows for raw `conversation` / `file` / `user` strings. Wire
through `formatEntityType()`.

Effort: 5 min, requires audit of attributes only.

### L2. SkillsPage "Install from GitHub" — explain what they're getting

**Location:** `src/client/modules/skills/pages/SkillsPage.tsx:138-140`

A novice sees "Install from GitHub" and has no idea what's installable.
The dialog when opened presumably explains, but the button label alone
implies the user already has a GitHub URL ready.

**Fix:** Tooltip / sub-label: "Add a skill from a public GitHub repo
URL — like `github.com/anthropics/claude-skills/tree/main/web-research`."

Effort: 5 min.

---

## What works well

Validated as already novice-friendly:

| Surface | Why it works |
|---|---|
| **NewRoutinePage** | Plain-language section headers ("What's this for?" / "When should it run?"), pickers replace text inputs, instance ID hidden under Advanced disclosure. The blueprint for everywhere else. |
| **RoutinesPage cards** | After Stage 4: shows "AI assistant" not `AssistantAgent`, friendly outcome labels, "every 30m" not raw seconds. |
| **InboxPage** | After Stage 4: friendly importance pills, "from AI assistant" instead of class names, "Needs approval" instead of "Approval". |
| **ApprovalsPage** | After Stage 4: friendly agent name in row header, dual-tier details (clean view + collapsible internal IDs). |
| **MembersList** | After Stage 4: formatRole everywhere, no raw lowercase role strings. |
| **DashboardPage greeting + pendingCount** | "You're up to date. Nothing needs your attention right now." — friendly, action-oriented, persona-aware. |
| **ConnectorCard "Configure" / disconnect flow** | Plain-language confirm dialog with "Keep connected" / "Disconnect" — no destructive jargon. |

---

## Cross-cutting recommendations

These would prevent the next batch of findings from regressing.

### R1. Promote the first-time-user lens in CI

The `dev-tools:ux-audit` skill now has the lens. We should also add a
short "first-time-user smoke test" as a pre-merge step for any feature
PR that touches routes / forms. The test is a 5-question checklist
against the persona — if the PR can't answer all 5 in plain English,
it's not ready.

Where to put it: `.claude/rules/first-time-user-check.md` or a checklist
in `docs/PATTERNS.md`.

### R2. Always pass an `agentRegistry` to `formatAgentClass`

Currently 6 surfaces use the registry. The DashboardPage doesn't.
Convention: any place that renders `agentClass` MUST go through
`formatAgentClass(name, registry)` with the registry from
`useAgentCatalog()`.

Could enforce with an ESLint rule or a code comment in `format/agent.ts`
that grep-flags raw `{...agentClass}` template strings.

### R3. Two-tier copy is the right pattern for "lead sentence + technical detail"

The Connectors page is the canonical place this is missing — a single
sentence is doing both jobs and failing both audiences. The pattern
that works (validated on RoutineDetailPage):

```tsx
<p>{plainLanguageSummary}</p>

<details>
  <summary>Technical details</summary>
  <p>{rawTermsForDevelopers}</p>
</details>
```

Adopt across Connectors, Skills, the LandingPage primary surfaces, and
any future module that has both audiences in one screen.

### R4. Empty states should educate AND offer a way forward

Most empty states do this well already. The exception is SkillsPage —
it shows an empty list with two buttons (Add / Install) and no preview
of *what kinds of things* skills are for. Borrow the
RoutinesPage pattern:

```
Empty state
├─ Icon + headline
├─ Plain-language description ("Skills are AI procedures…")
├─ Tips bullet-list ("for example, daily morning brief")
├─ Primary action ("Get the starter skills")
└─ Secondary action ("Or paste your own")
```

The starter button could call `sync.mutate()` so a novice gets 12
worked-example skills with one click instead of having to find
GitHub URLs.

---

## Deploy blocker (action required)

`npx wrangler deploy` and `npx wrangler whoami` both failed with:

```
[code: 9109] Max auth failures reached, please check your Authorization
header. / Invalid access token.
```

**Action:** Run `npx wrangler login` in this repo to refresh auth.
After re-auth, deploy + verify the Stage 4 + 5 changes live. The audit
findings here are independent of deploy state — the code-walkthrough
saw the actual current source.

Once deploy lands, a 5-min Chrome MCP smoke pass to verify nothing
visually regressed across the 7 swept surfaces would close out the
session.

---

## Resume next session

Pick up the C / H / M findings in order. Each is self-contained with
a file path + line number and a sized fix. Total estimated effort
for all C/H/M findings: ~70 minutes including verification.

Then run `/ux-audit as a first-time business-owner user` against the
deployed app for live confirmation.
