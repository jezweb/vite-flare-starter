# Spaces — Multi-User Multi-Agent Workrooms (Unified Plan)

**Date:** 2026-04-27
**Status:** Canonical, ready to implement
**Predecessors:** 1:1 chat (shipped), `projects-first-class-plan-2026-04-26.md`

---

## What we're building

A new top-level **Spaces** surface alongside Chat and Projects. A Space is a multi-participant ongoing conversation room where humans and agents are first-class members. Agents reply when @-mentioned by default; per-agent reply modes allow other behaviours (always, proactive, ambient, off).

Underneath, the conversation data model is unified so 1:1 chat and Spaces share the same tables. The difference between "chat" and "space" is a property of the conversation (member count + agent reply modes), not a separate code path.

## Why now

- The missing primitive across LLM products. Multi-user-on-one-AI-chat doesn't exist anywhere mainstream. As a pattern library we ship it before Anthropic / OpenAI / Google.
- The unification is value-positive on its own: one messages table, simpler FTS5 + export + search, one set of patterns to teach forks.
- Spaces and the existing Phase 5 (multi-user Projects) share the `conversation_members` substrate; building both off one foundation is cheaper than two separate efforts.
- Field-validated UX from Jez's daily Google Chat use of @-mentions, threads, reactions with bot members.

## Vocabulary

| Term | Meaning |
|---|---|
| **Conversation** | The data row (any kind). Has members, messages, optional projectId. |
| **Chat** | A conversation rendered in the simple 1:1 UI (one user member + one agent in `always` mode). |
| **Space** | A conversation rendered in the multi-user UI (member list, @ autocomplete, threads, reactions). |
| **Member** | A row in `conversation_members` — `kind=user` or `kind=agent`. |
| **Reply mode** | Per-agent-member setting controlling when the agent talks. |
| **Pin to space** | Mark a message for the whole space's "Pinned" shelf. Different from personal `Star`. |

---

## Unified data model

```sql
conversations               -- existing table, light additions
  id
  creatorUserId             -- renamed from userId
  projectId                 -- unchanged FK
  kind                      -- 'chat' | 'space' (cached for fast filtering)
  title, summary, starred, ...     -- all existing fields stay
  spaceMode                 -- 'open' | 'invite' | 'org' (only for kind='space')
  defaultReplyMode          -- per-space override; null falls back to agent default
  createdAt, updatedAt

conversation_members        -- NEW
  id (PK)
  conversationId            -- FK
  kind                      -- 'user' | 'agent'
  userId                    -- set when kind='user'
  agentClass                -- set when kind='agent' (DO class name)
  agentName                 -- @-handle ('research', 'writer')
  replyMode                 -- 'always' | 'mention' | 'proactive' | 'ambient' | 'off'
  joinedAt
  lastReadAt                -- unread indicator
  notificationLevel         -- 'all' | 'mentions' | 'muted'
  invitedByUserId           -- audit trail
  UNIQUE(conversationId, kind, userId)        -- one membership per user per conv
  UNIQUE(conversationId, kind, agentName)     -- @-handles unique within space

messages                    -- renamed from conversation_messages
  id
  conversationId
  parentMessageId           -- nullable — null = top-level, set = thread reply
  threadCount               -- cached on parent messages
  lastThreadAt              -- cached on parent messages
  senderKind                -- 'user' | 'agent'
  senderUserId              -- when senderKind='user'
  senderAgentName           -- when senderKind='agent'
  parts                     -- JSON, AI-SDK-compatible (unchanged)
  reactions                 -- JSON: { "👍": ["user:abc", "agent:research"] }
  pinnedAt, pinnedByUserId  -- nullable — pin-to-space metadata
  createdAt, editedAt, deletedAt

thread_subscriptions        -- Phase 2
  threadId (= parentMessageId)
  userId
  level                     -- 'all' | 'mute'

space_agent_installs        -- Phase 2
  spaceId
  agentName
  installedByUserId
  defaultReplyMode
  permissionLevel           -- 'any-member' | 'admins-only'
  installedAt
```

### Migration

Phased, reversible per step.

**A. Additive schema** (no code changes):
- Create `conversation_members`
- Add `kind`, `parentMessageId`, `threadCount`, `lastThreadAt`, `reactions`, `pinnedAt`, `pinnedByUserId` to `conversation_messages`
- Add `kind`, `spaceMode`, `defaultReplyMode` to `conversations`

**B. Backfill** (one SQL pass):
```sql
INSERT INTO conversation_members (id, conversationId, kind, userId, replyMode, joinedAt)
  SELECT lower(hex(randomblob(16))), id, 'user', userId, NULL, createdAt FROM conversations;

INSERT INTO conversation_members (id, conversationId, kind, agentName, replyMode, joinedAt)
  SELECT lower(hex(randomblob(16))), id, 'agent', 'assistant', 'always', createdAt FROM conversations;

UPDATE conversations SET kind = 'chat' WHERE kind IS NULL;
```

**C. Dual-read** (one commit):
- `storage.ts` reads from `conversation_members` for member checks
- Falls back to `conversations.creatorUserId` if no member rows (defensive)
- All existing endpoints unchanged in surface

**D. Rename + cleanup** (deferrable):
- `conversation_messages` → `messages`
- `conversations.userId` → `creatorUserId`
- Update references

Each step is its own commit, deployable independently.

---

## Reply modes

The key abstraction.

| Mode | Behaviour | Used in |
|---|---|---|
| `always` | Replies to every user message in the conversation | 1:1 chat default |
| `mention` | Replies only when @-mentioned | Space default |
| `proactive` | Lightweight classifier per-message decides "does this want a reply" | Phase 3 |
| `ambient` | React or brief comment only when there's signal | Phase 3 |
| `off` | Silent (pause without removing) | Any |

Server-side defaults baked into the dispatcher (not the agent's responsibility):

| Trigger | Default reply shape |
|---|---|
| @-mentioned at top level + reply ≤ 200 tokens | top-level message |
| @-mentioned at top level + reply > 200 tokens | auto-thread (`asThread=true`) |
| @-mentioned inside a thread | reply in same thread |
| `ambient` mode + message warrants ack | `reaction` instead of message |
| `proactive` mode + classifier says skip | `silent` |

Agent reply contract (returned from runOnce):

```ts
type AgentReply =
  | { kind: 'message'; text: string; parts?: Part[]; asThread?: boolean }
  | { kind: 'reaction'; emoji: string; targetMessageId: string }
  | { kind: 'silent' }
```

---

## UX surface

### Top-level nav

Sidebar order: **Home · Chat · Projects · Spaces · Files · Skills · Connectors · Activity · ...**

Spaces is a peer to Chat/Projects. Behind feature flag `VITE_FEATURE_SPACES=true` (default on for forks that want it).

### Spaces index page (`/dashboard/spaces`)

- Header: "Spaces" + "+ New space"
- Search + filter (mine / all org / unread)
- Grid of space cards: name, last activity, member count, unread badge

### Space detail page (`/dashboard/spaces/:id`)

Two-pane layout:

```
┌─────────────────────────────────────────────────────────┐
│ Space header: name · 4 members · settings ⚙             │
├──────────────┬──────────────────────────┬───────────────┤
│ Members      │ Main timeline            │ Thread pane   │
│ Sarah (you)  │  ─ Date divider ─        │ (when open)   │
│ Tom          │  msg                     │ Parent msg    │
│ ── Agents ── │  msg                     │ ──────────    │
│ @research    │  hover: action bar       │ Reply 1       │
│ @writer      │  message (5 replies)     │ Reply 2       │
│ @editor      │  msg                     │ ─ Unread ─    │
│              │  msg                     │ Reply 3       │
│ Pinned (3)   │                          │               │
│ Settings     │ [@ autocomplete input]   │ [Reply input] │
└──────────────┴──────────────────────────┴───────────────┘
```

### Hover action bar on each message

```
[👍 ✅ ❤️]   [😀+ ✏ 🧵 ⋯]
quick-emoji  picker edit thread more
```

- Quick emojis: top-3 from user's recent (defaults if none yet)
- Picker: full unicode catalog, "Recently used" row at top (last 24, stored on user record)
- Edit: author-only
- Thread icon: opens thread side pane to reply
- More menu (Phase 1 subset): Copy message link, Mark as unread, Delete (own)
- More menu (Phase 2 additions): Star, Pin to space, Quote in reply
- More menu (Phase 3): See message views, Forward

### Mention autocomplete

Triggered by typing `@`:

```
┌─────────────────────────────────────────────┐
│ 👤 People                                   │
│   Sarah Smith     sarah@…       online      │
│   Tom Jones       tom@…         offline     │
│                                             │
│ 🤖 Agents in this space                     │
│   research        searches web, summarises  │
│                   pages — last used 2h ago  │
│   writer          drafts blog/email copy    │
│                                             │
│ ➕ Add an agent to this space (Phase 2)     │
└─────────────────────────────────────────────┘
```

Selecting inserts a **mention pill** (chip with avatar + name), not text. Pills click through to profile/agent detail.

### Bot identity

Every agent member has:
- Avatar (configurable per-agent, default robot icon)
- Name (e.g. "Research")
- Small "Bot" badge next to name
- Hover/click opens a side panel with: description, tools available, reply mode, last activity in this space

Bots react with the **same emojis** humans do, displayed identically. No special bot-reaction icon. Hover tooltip shows reactor identity (and bot badge if applicable).

### Reactions

Storage: `messages.reactions` JSON column.
```json
{ "👍": ["user:abc", "agent:research"], "🚀": ["user:def"] }
```

API: `POST /api/messages/:id/reactions { emoji, action: 'add' | 'remove' }`. Agent reactions go through the same endpoint with synthetic actor `agent:<name>` resolved server-side.

Picker: `emoji-mart` (MIT, ESM-friendly), passed `recent` array from user's recentEmojis. After successful reaction, PATCH user record to push emoji onto recents (max 24, dedupe).

### Threads

Two-pane (right side panel) on desktop, modal on mobile. Each thread:
- Parent message at top
- All replies chronological
- "Unread" wave divider where the user's `lastReadAt` sits
- Per-thread bell to mute (Phase 2)
- Own input at bottom labeled "Reply"
- Long agent replies auto-thread when triggered from a top-level mention

Threads never close. They stay forever-replyable. (Per Jez's experience: useful to revive old threads.)

### "+ New space" creation flow

Modal, three tabs (mirrors `CreateProjectModal`):

1. **Blank** — name + description + "Add agents" multi-select + "Add members" multi-select
2. **From template** — pick from `space-templates.ts` (Phase 2 — see Templates section)
3. **Solo workshop** — shortcut for "just me + multiple bots in @mention mode"

On create: server creates conversation row (kind='space') + member rows for invitees + default agent rows.

### Empty state

```
Spaces are multiplayer rooms. Bring your team and your AI agents
into one place. Use @mentions to ask agents to help; they'll reply
when called and stay quiet otherwise.

[+ New space]   [From template ▾]   [Open dev chat ↗]
```

---

## Mention parsing & dispatch

`mention-parser.ts` extracts `@handle` references from message parts. Returns `MentionRef[]` with `kind`, `targetUserId | targetAgentName`, `position`.

Dispatcher logic on send:

```
1. Persist message (D1) and broadcast to space DO (WebSocket fan-out)
2. Find @-mentioned agents who are members of this space
3. For each mention:
   - If agent.replyMode == 'off' → skip
   - Otherwise: invoke AutonomousAgent.runOnce({ ...input, actingUserId: senderUserId })
   - Persist reply, broadcast
4. For non-mentioned agents:
   - replyMode == 'always' → reply (only meaningful in 1:1)
   - replyMode == 'proactive' → run classifier first (Phase 3)
   - replyMode == 'ambient' → run classifier, may emit reaction (Phase 3)
   - replyMode == 'mention' → silent (default for spaces)
```

Cap: 1 mention dispatched per top-level message in Phase 1. Phase 2 raises to 3 parallel.

Bot-to-bot mention chains: allowed, depth cap 3 hops. Counted toward the parallel budget.

---

## Approval queue extension

`pending_approvals` table additions:
- `spaceId` (nullable FK to conversations where kind='space')
- `requestedByUserId` (the actor who triggered the agent action; distinct from agent owner)

Visibility expansion:
- Personal approvals: only requestedByUserId sees them
- Space approvals: all space members see them
- Existing single-user flow unchanged

`/dashboard/approvals` page filters by personal vs space, optionally jumps to the source space.

---

## Agent infrastructure changes

### `RunOnceInput.actingUserId` (new field)

```ts
interface RunOnceInput {
  // ...existing fields...
  actingUserId?: string  // who triggered this run (defaults to agent owner)
}
```

Used in:
- MCP credential lookup (uses actingUserId, not agent owner)
- Audit row records both `userId` (owner) and `actingUserId` (actor)
- Approvals queued under requestedByUserId = actingUserId

### Agent partition for spaces

Agent DO instance name: `space:${spaceId}:${agentName}`.
- Per-space memory ("the room's research bot remembers what we discussed")
- Different from per-user partition for personal AssistantAgent
- New field on agent state: `partitionKind: 'user' | 'space'` for observability

### `SpaceAgent extends Agent`

One DO per space:
- Holds ephemeral state (presence, typing indicators, connected clients)
- Broadcast on every message
- Direct DO RPC into AutonomousAgent.runOnce on @-mention dispatch
- D1 is canonical storage; DO state is live-session only

---

## Phase 1 deliverables

**Goal:** ship a usable multi-user multi-agent room. Exclude polish that isn't load-bearing.

### Schema
- [x in plan] `conversation_members`
- [x] `messages.parentMessageId / threadCount / lastThreadAt / reactions / pinnedAt`
- [x] `conversations.kind / spaceMode`
- [x] `pending_approvals.spaceId / requestedByUserId`
- [x] Migration A + B

### Server
- [ ] `src/server/modules/spaces/db/schema.ts` (re-exports + helpers)
- [ ] `src/server/modules/spaces/routes.ts` — REST API
- [ ] `src/server/modules/spaces/storage.ts` — member checks, message read/write
- [ ] `src/server/modules/spaces/space-agent.ts` — DO class
- [ ] `src/server/modules/spaces/mention-parser.ts`
- [ ] `src/server/modules/spaces/dispatch.ts` — mention → runOnce routing
- [ ] `src/server/lib/agents/autonomous-agent.ts` — `actingUserId` on RunOnceInput
- [ ] `src/server/index.ts` — mount spaces routes, export SpaceAgent DO

### Frontend
- [ ] `src/client/modules/spaces/pages/SpacesIndexPage.tsx`
- [ ] `src/client/modules/spaces/pages/SpacePage.tsx`
- [ ] `src/client/modules/spaces/components/MemberList.tsx`
- [ ] `src/client/modules/spaces/components/MentionAutocomplete.tsx`
- [ ] `src/client/modules/spaces/components/ThreadPane.tsx`
- [ ] `src/client/modules/spaces/components/MessageActionBar.tsx`
- [ ] `src/client/modules/spaces/components/MessageReactions.tsx`
- [ ] `src/client/modules/spaces/components/CreateSpaceModal.tsx`
- [ ] `src/client/modules/spaces/components/MentionPill.tsx`
- [ ] `src/client/modules/spaces/hooks/useSpace.ts`
- [ ] `src/client/modules/spaces/hooks/useSpaceWebSocket.ts`

### Config / Nav
- [ ] `src/shared/config/nav.ts` — Spaces top-level
- [ ] `src/shared/config/features.ts` — `spaces` flag

### Caps
- One @-mention per message dispatched (parallel deferred to Phase 2)
- replyMode = `always` | `mention` | `off` only (proactive/ambient deferred to Phase 3)
- Default agents available globally (no install table; deferred to Phase 2)

### Out for Phase 1 (explicitly)
- Pin-to-space + Pinned shelf
- Star
- Quote in reply
- Per-thread mute
- Card-format bot messages
- Space templates
- Cross-space search
- Read receipts

---

## Phase 2 — Polish + per-space configurability

- `space_agent_installs` — per-space agent registry (some agents only available in some spaces)
- Parallel multi-mention dispatch (cap 3 active per turn)
- Pin-to-space + Pinned shelf view
- Star (personal bookmark)
- Quote-in-reply
- Per-thread notification mute (`thread_subscriptions` table)
- Card-format messages for bot daily digests (structured payload renderer)
- Space templates: Marketing pod / Solo workshop / Customer support war room
- Email-on-invite for off-platform members
- Member roles: owner / admin / member with permission gating

---

## Phase 3 — Advanced agent behaviour

- `proactive` reply mode + classifier
- `ambient` reply mode + reaction-or-brief logic
- Slash sub-commands per agent (`@research /summarise-url <url>`)
- Read receipts ("see message views")
- Cross-space search via FTS5
- Bot-to-bot chain depth enforcement
- Per-space rate limiting

---

## Open decisions (settled with recommendations — flag if you disagree)

| # | Question | Recommendation |
|---|---|---|
| 1 | Default replyMode for agents in Spaces | `mention` |
| 2 | Default replyMode for agents in 1:1 chat | `always` (matches today) |
| 3 | Default reply behaviour for messages with no @-mention | No auto-reply. Agents in `proactive`/`ambient` (Phase 3) opt in to listen. |
| 4 | Auto-name new spaces? | Yes, "Untitled space" until renamed |
| 5 | Spaces inside projects show on the project page? | Yes — "Rooms" section alongside chats list |
| 6 | Order of work | Spaces first, Phase 5 (multi-user Projects) revisit after |
| 7 | Bot-to-bot mentions | Allowed, depth cap 3 (enforce in Phase 3) |
| 8 | Empty space-index state | Sample-template buttons + link to create |
| 9 | Quick-emoji bar | Top-3 user-recent (dynamic), defaults `👍 ✅ ❤️` |
| 10 | Feature flag default | On for forks (`VITE_FEATURE_SPACES=true`), off in tests |

---

## Out of scope (this work)

- Voice / video channels in a space — separate worked example
- Live IDE / Cloudflare Sandbox per space (the Ace pattern) — separate "Workspace" worked example
- Custom emoji upload (Slack-style `:partyparrot:`)
- Forward message / Forward to inbox
- Tasks-in-spaces
- Cross-org spaces (Phase 2 stays org-scoped)
- Replacing 1:1 chat UX — strictly preserves current "New chat" flow

---

## Estimated effort

- **Phase 1** — 3-4 focused sessions
- **Phase 2** — 2-3 focused sessions
- **Phase 3** — open-ended (proactive/ambient classifiers are research-y)

Phase 1 unblocks Spaces dogfooding. Phase 2 makes it production-ready for forks. Phase 3 is differentiation.

---

## Suggested first session sequence

1. **Schema + migration A+B** (~30 min) — additive, ship and verify
2. **Storage layer + dual-read** (~45 min) — `conversation_members` reads, fallback path
3. **REST API basics** — list/detail/create space, list members, send message (~1.5h)
4. **SpaceAgent DO + WebSocket fan-out** (~1h)
5. **Spaces index + detail pages with member list + main timeline** (~2h)
6. **@ autocomplete + mention pills + dispatch to runOnce** (~1.5h)
7. **Threads (two-pane) + reactions** (~1.5h)
8. **Hover action bar + minimum More menu** (~1h)
9. **Type-check, build, deploy, dogfood** — same-session audit

That's a 1-2 day push for Phase 1. Stretch to a third session if hover actions + edge cases bite.
