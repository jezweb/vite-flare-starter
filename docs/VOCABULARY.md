# Vocabulary

Canonical names for user-facing concepts. **Pick from this list when
writing copy.** When two surfaces use different words for the same
concept, the user pays attention to the wrong distinction.

This is enforced manually right now (no linter), so the convention
needs to live somewhere AI agents and humans both look — that's here.
The `dev-tools:ux-audit` skill includes a vocabulary check that
references this file.

## Rule of thumb

> If a returning user could be confused about whether two screens are
> talking about the same thing, the vocabulary is wrong.

---

## Canonical nouns

| Concept | Use everywhere | NOT |
|---|---|---|
| The queue of decisions waiting on the user | **Pending review** | "What needs you", "Action items", "Approvals queue", "Inbox" (when shown on the home page) |
| The AI in chat | **AI** (lowercase, in body copy) | "Bot", "Assistant", "Agent" (in user-facing copy), "ChatGPT", "the model" |
| The class of code that powers an AI feature | **Agent** (in detail / debug copy only) | Don't expose `agentClass`, `AssistantAgent`, `ResearcherAgent` in user copy |
| Recurring scheduled agent | **Routine** | "Cron job", "Recurring agent", "Scheduled run", "Workflow" (workflow has Cloudflare meaning) |
| A single execution of a routine | **Run** | "Fire", "Trigger", "Invocation", "Execution" |
| External app a user has connected | **Connection** (noun) / **Connect** (verb) | "Integration", "Connector" (use only in technical / dev docs), "MCP server" (only behind a "Technical details" disclosure) |
| A finding emitted by an agent | **Finding** | "Inbox item", "Notification" (notification is transient bell ping), "Alert" |
| A piece of advice / pattern markdown | **Skill** | "Procedure", "Recipe", "Guide" |
| A markdown file containing one skill | **SKILL.md** (literal) | "skill file", "skill md" |
| An agent's tool call | **Tool call** | "Function call", "Tool use", "Tool invocation" |
| The thing in the bell icon | **Notification** | "Alert", "Bell", "Update" |
| User-shareable workspace | **Project** | "Workspace", "Folder" |
| Multi-user, multi-agent room | **Space** | "Channel", "Room", "Team chat" |
| Ephemeral chat conversation | **Conversation** | "Thread" (thread is a sub-element inside Spaces), "Chat" (the verb), "Session" |
| Org-level container | **Organisation** (UK spelling — Australian project default) | "Organization", "Team" (team is a role concept), "Workspace" |
| Roles inside an organisation | **Owner / Admin / Member** | "Manager", "User" (user is a person, not a role) |
| Roles at the platform / account level | **Admin / Manager / Member** | (Mostly internal; user copy should say "you" or specific role names) |
| Rule the AI shouldn't break | **Memory** | "Preference", "Note", "Setting" |
| Memory category | **Type** | "Kind", "Tag", "Section" |
| Memory record persisted to vector store | **Memory** (still, even at the storage level) | "Embedding", "Recall entry" |

## Canonical verbs

| Action | Use | NOT |
|---|---|---|
| Stage an action awaiting human OK | **Queue for review** | "Submit for approval", "Send to admin", "Pend" |
| Approve a queued action | **Approve** | "Sign off", "Accept", "Confirm" (confirm is for destructive prompts) |
| Reject a queued action | **Reject** | "Decline", "Deny" (deny implies authority; user is just choosing) |
| Disconnect a connection | **Disconnect** | "Remove", "Delete connection" (deletion implies destruction; disconnect is reversible) |
| Run a routine on demand | **Run now** | "Fire now" (we use this internally; user copy is "Run now"), "Execute", "Trigger" |
| Save changes to a setting | **Save** | "Update", "Apply" (apply is OK for filters; not for settings) |
| Cancel an in-progress edit | **Cancel** | "Discard", "Back" (back is navigation, not cancellation) |
| Open the deep view of an item | **Open** (noun) / **View details** (link text) | "Inspect", "Drill down" |

## Status / state words

| State | Use | NOT |
|---|---|---|
| Action queued, waiting for user | **Pending** | "Queued" (internal; user sees "Pending"), "Awaiting", "Open" |
| Action approved, executing | **Running** | "In progress", "Executing", "Active" |
| Action approved + executed successfully | **Done** | "Completed", "Executed" (executed is OK for audit log only) |
| Action approved + executed with error | **Failed** | "Errored", "Crashed" |
| Action user rejected | **Rejected** | "Denied", "Dismissed" |
| Routine paused | **Disabled** | "Off", "Paused" (paused implies temporary; disabled is the canonical Boolean state) |
| Routine receiving runs | **Enabled** | "On", "Active", "Live" |
| Connection working | **Connected** | "Active" (active is for running tasks, not connection state) |
| Connection broken / token expired | **Disconnected** + reason | "Error" (too vague), "Inactive" |
| Routine over its daily $ cap | **Over budget** | "Out of budget", "Hit cap", "Stopped" |
| Routine hit a transient error | **Error** | "Failed" (failed = terminal; error = retryable) |

## Tone-of-voice rules

1. **Second person, present tense** — "Pick a routine to fire", not
   "Routine selection"
2. **Action-oriented page subtitles** — answer "what am I doing here?"
   in one short sentence
3. **No feature-list voice in user copy** — "Multi-user, multi-agent
   rooms" is for marketing decks. The page subtitle should say
   "Group chats with the AI."
4. **No technical primitives in user copy** — "MCP server URL",
   "ToolDefinition", "Durable Object" go behind a "Technical details"
   disclosure (`<details>`), not in the primary text
5. **No raw IDs as titles** — kebab-case slugs, snake_case enums, and
   UUIDs should never be the lead text on a card. Use the
   `formatAgentClass` / `formatOutcome` / etc. helpers from
   `src/shared/format/agent.ts`
6. **Plain English over jargon** — "The AI wants to remember…" instead
   of "Add user memory: tool-troubleshooting-preference"

## Two-tier copy pattern

When a screen has both novice and developer audiences, lead with plain
language and disclose the technical detail:

```tsx
<p>{plainLanguageSummary}</p>
<details>
  <summary>Technical details</summary>
  <p>{rawTermsForDevelopers}</p>
</details>
```

Adopted on:
- ConnectorsPage opener
- ApprovalsPage card chrome
- RoutineDetailPage internal IDs
- NewRoutinePage Advanced disclosure (auto-derived instance name)

## Page subtitle template

> "[Verb in user voice] [thing] [why or how it helps]."

Audit pass on existing subtitles (2026-04-29 design coherence sweep):

| Page | New subtitle |
|---|---|
| Settings | "Your profile, login, AI memory, and the data this app holds about you." |
| Files | "Drop a file here or in chat — your AI can read PDFs, images, and CSVs and use them in answers." |
| Admin | "Members, feature flags, API tokens, deliverability, and error inspection. Only admins see this page." |
| Activity | "Every action your AI has taken on your behalf — created, updated, archived — with timestamps." |
| Extract | "Pull structured data from any text — names, dates, sentiment, custom schemas." |
| Organisation | "Identity, branding, and policies for [org name]." |

Always:
- Lead with a verb in the user's voice ("Pick", "Drop", "Have", "Watch")
- Say *why* or *how it helps* — not just *what it is*
- ≤ 2 lines on desktop / ≤ 3 lines on 375px mobile

Never:
- Refer to internal concepts the user hasn't seen yet ("MCP server", "ToolDefinition", "Output.object()")
- Say "Manage your X" — it's true but tells the user nothing
- Use technical jargon as the lead noun ("Audit trail of …" → "Every action …")

## Where this is enforced

- **`src/components/ui/page-header.tsx`** — renders the H1 + subtitle,
  sets document.title. The single place to define a page's identity.
- **`src/shared/format/agent.ts`** — translation helpers for enum
  values. Single source of truth.
- **`src/shared/agent/metadata.ts`** — every AutonomousAgent declares
  `static metadata = { displayName, description, category }`
- **`/api/agents/registered`** + **`/api/chat/catalog`** + **`/api/skills/summary`**
  — discovery endpoints that pickers consume
- **`dev-tools:ux-audit` skill** — first-time-user lens checks for
  vocabulary leaks
- **`docs/PAGE_GRAMMAR.md`** — the page-level contract that requires
  this voice on every PageHeader subtitle
- **This file** — canonical reference

If you add a new concept that needs naming, add it here first, then
write the copy.

---

**Last updated:** 2026-04-29
