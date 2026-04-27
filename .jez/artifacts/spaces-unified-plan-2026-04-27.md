# Spaces — Multi-User Multi-Agent Workrooms (Canonical Plan v2)

**Date:** 2026-04-27
**Status:** Canonical, ready to implement. This document is self-contained — a fresh Claude Code session can pick it up cold and execute Phase 1 without reading the prior conversation.
**Predecessors:** 1:1 chat (shipped), `projects-first-class-plan-2026-04-26.md`
**Tracking issue:** [#43](https://github.com/jezweb/vite-flare-starter/issues/43)

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
| **Pin a message** (pin-to-space) | Mark a single message for the whole space's "Pinned" shelf. |
| **Pin the space** (pin-to-sidebar) | User's personal preference to surface this space at the top of their Spaces nav list. |
| **Star** | Personal-only bookmark on a message. |
| **Mute** | Turn off notifications for a space without leaving it. |
| **Presence** | Who is currently connected via WebSocket — surfaced as online indicator on member chips. |

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
  historyEnabled            -- 1 | 0 (Phase 3+ for compliance feature; default 1)
  createdAt, updatedAt

conversation_members        -- NEW
  id (PK)
  conversationId            -- FK
  kind                      -- 'user' | 'agent'
  userId                    -- set when kind='user'
  agentClass                -- set when kind='agent' (DO class name)
  agentName                 -- @-handle ('research', 'writer')
  replyMode                 -- 'always' | 'mention' | 'proactive' | 'ambient' | 'off'
  role                      -- 'owner' | 'admin' | 'member' (Phase 2 — for member kind)
  joinedAt
  lastReadAt                -- unread indicator
  notificationLevel         -- 'all' | 'mentions' | 'muted'
  pinnedToSidebar           -- 1 | 0 — user's personal pin of the space to sidebar
  invitedByUserId           -- audit trail
  blockedAt                 -- nullable; Phase 2 — admin/owner-set
  UNIQUE(conversationId, kind, userId)        -- one user membership per conv
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
  starredByUserIds          -- JSON array (Phase 2 — personal bookmarks)
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
- Add `kind`, `spaceMode`, `defaultReplyMode`, `historyEnabled` to `conversations`

**B. Backfill** (one SQL pass):
```sql
INSERT INTO conversation_members (id, conversationId, kind, userId, replyMode, joinedAt, role)
  SELECT lower(hex(randomblob(16))), id, 'user', userId, NULL, createdAt, 'owner' FROM conversations;

INSERT INTO conversation_members (id, conversationId, kind, agentName, replyMode, joinedAt)
  SELECT lower(hex(randomblob(16))), id, 'agent', 'assistant', 'always', createdAt FROM conversations;

UPDATE conversations SET kind = 'chat' WHERE kind IS NULL;
UPDATE conversations SET historyEnabled = 1 WHERE historyEnabled IS NULL;
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

Server-side defaults baked into the dispatcher:

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

## Notifications model

Two scopes:

**Per-space** (`conversation_members.notificationLevel`):
- `all` — every new top-level message pings
- `mentions` — only when @-mentioned
- `muted` — no pings, but space stays in your sidebar (badge still increments quietly)

**Per-thread** (`thread_subscriptions`, Phase 2):
- `all` (default if you've replied) — every new reply in this thread pings
- `mute` — explicitly opt out

Notifications dispatched via the existing `notifications` module — Phase 1 ships an in-app toast on receipt. Email / push deferred.

---

## Presence and online status

**Surfaced** as a green dot on member chips in the member list, and "online" caption on hover.

**Implementation** uses the Cloudflare Agents SDK directly:

```ts
// SpaceAgent extends Agent
async onConnect(connection: Connection, ctx: ConnectionContext) {
  const userId = await this.authenticateConnection(ctx)  // verify session token
  connection.setState({ userId, joinedAt: Date.now() })
  // Broadcast presence change to all other clients
  this.broadcast(JSON.stringify({
    type: 'presence',
    online: this.getOnlineUserIds(),
  }), [connection.id])
}

async onClose(connection: Connection) {
  this.broadcast(JSON.stringify({
    type: 'presence',
    online: this.getOnlineUserIds(),
  }))
}

getOnlineUserIds(): string[] {
  const ids = new Set<string>()
  for (const conn of this.getConnections()) {
    const state = conn.state as { userId?: string } | null
    if (state?.userId) ids.add(state.userId)
  }
  return Array.from(ids)
}
```

**Client side** — initial presence is fetched via REST (`GET /api/spaces/:id/presence`) on page load; live updates arrive via the WebSocket message handler. React state mirrors this for the member list.

**Bots are always "online"** — they're DO members, not WebSocket-driven, so they show as online whenever the space exists. No flickering, no need to track.

---

## Search within space

Extend the existing `conversations_search` FTS5 index.

```sql
-- Already exists for global conversation search
CREATE VIRTUAL TABLE conversations_search USING fts5(...)
```

Add `spaceId` filter to the search route:

```
GET /api/spaces/:id/messages/search?q=foo
```

Backed by the same FTS5 query, with a WHERE clause for `conversationId = :id`. Returns top 20 hits with snippet + author + timestamp + thread context.

UI: `Search in this space` opens a side pane with the search input and result list. Click a result jumps to that message in the timeline (with highlight).

Cross-space search across all your spaces is Phase 3.

---

## UX surface

### Top-level nav

Sidebar order: **Home · Chat · Projects · Spaces · Files · Skills · Connectors · Activity · ...**

Spaces is a peer to Chat/Projects. Behind feature flag `VITE_FEATURE_SPACES=true` (default on for forks that want it).

### Spaces sidebar / index page (`/dashboard/spaces`)

- **Pinned spaces** at top (user-pinned via header menu)
- All other spaces below, sorted by recent activity
- Each row: space name, last activity, member count, unread badge
- "+ New space" CTA at top
- Search/filter input

### Space detail page (`/dashboard/spaces/:id`)

Three-pane on desktop, collapsing on mobile:

```
┌─────────────────────────────────────────────────────────┐
│ Space header: name · 6 members · ⋯ menu · search        │
├──────────────┬──────────────────────────┬───────────────┤
│ Members      │ Main timeline            │ Thread pane   │
│ 🟢 Sarah(you)│  ─ Date divider ─        │ (when open)   │
│ 🟢 Tom       │  msg                     │ Parent msg    │
│ ⚪ Joseph    │  msg                     │ ──────────    │
│ ── Agents ── │  hover: action bar       │ Reply 1       │
│ 🤖 research  │  message (5 replies)     │ Reply 2       │
│ 🤖 writer    │  msg                     │ ─ Unread ─    │
│              │                          │ Reply 3       │
│ Pinned (3)   │ [@ autocomplete input]   │ [Reply input] │
│ Settings     │                          │               │
└──────────────┴──────────────────────────┴───────────────┘
```

### Space header dropdown (the ⋯ menu)

Maps directly to the Google Chat space header pattern:

| Item | What it does | Phase | Implementation |
|---|---|---|---|
| Search in this space | Opens search pane | 1 | FTS5 query scoped to spaceId |
| Manage members | Opens Settings → Members tab | 1 | Modal with current + invite + role chips |
| Space settings | Opens Settings → General tab | 1 | Edit spaceMode, defaultReplyMode |
| Space details | Read-only details panel | 1 | name, description, created, owner |
| Apps and integrations | Opens Settings → Agents tab | 2 | List of installed agents + add/remove |
| Copy link to this space | Copy `https://app/dashboard/spaces/:id` | 1 | Toast confirmation |
| Mark as read | Flip lastReadAt to now | 1 | PATCH /api/spaces/:id/read |
| Pin to sidebar | Set `conversation_members.pinnedToSidebar=1` | 1 | PATCH membership |
| Mute / Notifications | Cycles `notificationLevel` | 1 | PATCH membership |
| Leave space | Soft-delete own member row | 1 | DELETE membership (forbidden if last owner) |
| Block (member action) | Sets `blockedAt` on target's member row | 2 | Owner/admin only, gated by role |
| Delete space | Hard-delete entire conversation | 1 | Owner only, confirmation dialog |
| Turn off history | Auto-delete messages after 24h | 3 | `historyEnabled` toggle, cron sweep |

### Settings panel (modal or page)

Tabs:
- **General** — name, description, spaceMode, defaultReplyMode
- **Members** — current members + roles + invite + remove
- **Agents** (Phase 2) — installed agents + add/remove + per-agent permissions
- **Notifications** (per-user) — notification level, mute thread overrides
- **Danger** — leave / delete

### Hover action bar on each message

```
[👍 ✅ ❤️]   [😀+ ✏ 🧵 ⋯]
quick-emoji  picker edit thread more
```

- Quick emojis: top-3 from user's recent (defaults if none yet — `👍 ✅ ❤️`)
- Picker: full unicode catalog via `emoji-mart`, "Recently used" row at top (last 24, stored on user record)
- Edit: author-only, message-level
- Thread icon: opens thread side pane
- More menu (Phase 1 subset): Copy message link, Mark as unread, Delete (own)
- More menu (Phase 2 additions): Star, Pin to space, Quote in reply
- More menu (Phase 3): See message views (read receipts), Forward

### Mention autocomplete

Triggered by `@`:

```
┌─────────────────────────────────────────────┐
│ 👤 People                                   │
│   🟢 Sarah Smith   sarah@…   online         │
│   ⚪ Tom Jones     tom@…     offline        │
│                                             │
│ 🤖 Agents in this space                     │
│   research      searches web, summarises    │
│                 pages — last used 2h ago    │
│   writer        drafts blog/email copy      │
│                                             │
│ ➕ Add an agent to this space (Phase 2)     │
└─────────────────────────────────────────────┘
```

Selecting inserts a **mention pill** (chip with avatar + name), not text. Pills click through to profile/agent detail.

### Bot identity

Each agent member has:
- Avatar (configurable per-agent, default robot icon)
- Name (e.g. "research")
- Small "Bot" badge next to name on every appearance
- Hover/click opens detail panel: description, tools, replyMode, last activity

Bots react with the **same emojis** humans do, displayed identically. No special bot-reaction icon. Hover tooltip shows reactor identity.

### Reactions

Storage: `messages.reactions` JSON.
```json
{ "👍": ["user:abc", "agent:research"], "🚀": ["user:def"] }
```

API: `POST /api/messages/:id/reactions { emoji, action: 'add' | 'remove' }`. Agent reactions go through the same endpoint with synthetic actor `agent:<name>` resolved server-side from the run context.

Picker: `emoji-mart` (MIT, ESM-friendly), passed `recent` from user's recentEmojis. After successful reaction, PATCH user record to push emoji onto recents (max 24, dedupe).

### Threads

Two-pane (right side panel) on desktop, modal on mobile. Each thread:
- Parent message at top
- All replies chronological
- "Unread" wave divider at user's `lastReadAt`
- Per-thread bell to mute (Phase 2)
- Own input at bottom labeled "Reply"
- Long agent replies auto-thread when triggered from a top-level mention

Threads never close. They stay forever-replyable.

### "+ New space" creation flow

Modal, three tabs:

1. **Blank** — name + description + "Add agents" picker + "Add members" picker
2. **From template** (Phase 2) — pick from `space-templates.ts`
3. **Solo workshop** — shortcut: just you + multiple bots in @mention mode

On create: server creates conversation row (kind='space') + member rows for invitees + default agent rows. Redirect to /dashboard/spaces/:id.

### Empty state

```
Spaces are multiplayer rooms. Bring your team and your AI agents
into one place. Use @mentions to ask agents to help; they reply
when called and stay quiet otherwise.

[+ New space]   [From template ▾]   [Open dev chat ↗]
```

---

## Mention parsing & dispatch

`mention-parser.ts` extracts `@handle` references from message parts. Returns `MentionRef[]` with `kind`, `targetUserId | targetAgentName`, `position`.

Dispatcher logic on send (server-side, called from POST messages route):

```
1. Persist message to D1 (with parentMessageId if replying in thread)
2. Send to SpaceAgent DO via direct binding for broadcast fan-out
3. Find @-mentioned agents who are members of this space
4. For each mention:
   - If agent.replyMode == 'off' → skip
   - Otherwise: invoke AutonomousAgent.runOnce({
         input: messageText,
         actingUserId: senderUserId,
         contextMessages: lastN(20),
         parentMessageId: msg.parentMessageId ?? msg.id,  // thread context
       })
   - Persist reply, broadcast
5. For non-mentioned agents (Phase 3):
   - replyMode == 'always' → reply (only meaningful in 1:1)
   - replyMode == 'proactive' → run classifier first
   - replyMode == 'ambient' → run classifier, may emit reaction
   - replyMode == 'mention' → silent (default)
```

Caps:
- Phase 1: 1 mention dispatched per top-level message
- Phase 2: cap 3 parallel
- Bot-to-bot mention chain depth cap 3 hops (Phase 3 enforces)

---

## Approval queue extension

`pending_approvals` table additions:
- `spaceId` (nullable FK to conversations where kind='space')
- `requestedByUserId` (the actor who triggered; distinct from agent owner)

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
  contextMessages?: UIMessage[]  // explicit context for spaces (Phase 1: last 20 in thread)
  parentMessageId?: string  // when replying in a thread
}
```

Used in:
- MCP credential lookup (uses actingUserId, not agent owner)
- Audit row records both `userId` (owner) and `actingUserId` (actor)
- Approvals queued under `requestedByUserId = actingUserId`

### Agent partition for spaces

Agent DO instance name: `space:${spaceId}:${agentName}`.
- Per-space memory ("the room's research bot remembers what we discussed")
- Different from per-user partition for personal AssistantAgent
- New field on agent state: `partitionKind: 'user' | 'space'` for observability

### `SpaceAgent extends Agent`

One DO per space:
- Holds ephemeral state: `connectedUsers: Map<connectionId, { userId, joinedAt }>`, `typing: Map<userId, lastSeenTs>`
- WebSocket lifecycle: `onConnect` / `onClose` track presence, broadcast changes
- Receive new-message via DO RPC from the REST handler, broadcasts to all clients
- Direct DO RPC into AutonomousAgent.runOnce on @-mention dispatch
- D1 is canonical storage; DO state is live-session only

```ts
export class SpaceAgent extends Agent<SpaceAgentEnv, SpaceAgentState> {
  static readonly className = 'SpaceAgent'

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    const userId = await this.authenticate(ctx)  // verify session token
    if (!userId) return connection.close(4401, 'unauthorized')
    if (!await this.isMember(userId)) return connection.close(4403, 'not a member')

    connection.setState({ userId, joinedAt: Date.now() })
    this.broadcastPresence()
  }

  async onClose(connection: Connection) {
    this.broadcastPresence()
  }

  async broadcastNewMessage(messageId: string) {
    const message = await this.loadMessage(messageId)
    this.broadcast(JSON.stringify({ type: 'message', message }))
  }

  private broadcastPresence() {
    this.broadcast(JSON.stringify({
      type: 'presence',
      online: this.getOnlineUserIds(),
    }))
  }

  private getOnlineUserIds(): string[] {
    const ids = new Set<string>()
    for (const conn of this.getConnections()) {
      const state = conn.state as { userId?: string } | null
      if (state?.userId) ids.add(state.userId)
    }
    return Array.from(ids)
  }
}
```

---

## Phase 1 deliverables

**Goal:** ship a usable multi-user multi-agent room. Exclude polish that isn't load-bearing.

### Schema (migrations A + B + C)
- `conversation_members` table with all columns
- `messages` adds parentMessageId / threadCount / lastThreadAt / reactions / pinnedAt / pinnedByUserId
- `conversations` adds kind / spaceMode / defaultReplyMode / historyEnabled
- `pending_approvals` adds spaceId / requestedByUserId
- Backfill SQL for existing conversations
- Dual-read in storage.ts

### Server (new files)
- `src/server/modules/spaces/db/schema.ts` — re-exports + helpers (Drizzle)
- `src/server/modules/spaces/routes.ts` — REST API
- `src/server/modules/spaces/storage.ts` — member checks, message read/write
- `src/server/modules/spaces/space-agent.ts` — DO class extending Agent
- `src/server/modules/spaces/mention-parser.ts` — extract @ refs
- `src/server/modules/spaces/dispatch.ts` — mention → runOnce routing
- `src/server/modules/spaces/presence.ts` — helpers for connection state

### Server (modified)
- `src/server/lib/agents/autonomous-agent.ts` — `actingUserId`, `contextMessages`, `parentMessageId` on RunOnceInput
- `src/server/index.ts` — mount spaces routes, export SpaceAgent DO
- `wrangler.jsonc` — register SpaceAgent DO binding + migration tag
- `src/server/modules/conversations/storage.ts` — dual-read from conversation_members
- `src/server/modules/conversations/db/schema.ts` — add new columns

### REST endpoints (Phase 1)

```
GET    /api/spaces                      — list user's spaces
POST   /api/spaces                      — create
GET    /api/spaces/:id                  — detail (members, recent messages, presence)
PATCH  /api/spaces/:id                  — update name/description/settings (admin/owner)
DELETE /api/spaces/:id                  — delete (owner only)
GET    /api/spaces/:id/presence         — current online userIds
GET    /api/spaces/:id/messages         — paginated, optional thread filter
POST   /api/spaces/:id/messages         — send (parses @, dispatches)
GET    /api/spaces/:id/messages/search  — FTS5 query within space
PATCH  /api/spaces/:id/read             — mark as read
GET    /api/spaces/:id/members          — list
POST   /api/spaces/:id/members          — invite (user or agent)
PATCH  /api/spaces/:id/members/:memberId — update role / replyMode / notification level
DELETE /api/spaces/:id/members/:memberId — remove or self-leave
PATCH  /api/spaces/:id/membership       — pin to sidebar / mute / notification level (self)
POST   /api/messages/:id/reactions      — add/remove reaction
POST   /api/messages/:id/thread         — reply in thread
DELETE /api/messages/:id                — author-only delete
GET    /api/spaces/:id/agents           — list available agents (Phase 1: globally available)
```

### Frontend (new files)

```
src/client/modules/spaces/
  pages/
    SpacesIndexPage.tsx          — list + pinned at top
    SpacePage.tsx                — main detail page
  components/
    MemberList.tsx               — left rail, online indicators
    MentionAutocomplete.tsx      — @ trigger menu
    MentionPill.tsx              — pill renderer in messages
    ThreadPane.tsx               — right side pane
    MessageActionBar.tsx         — hover bar
    MessageReactions.tsx         — reaction chips below messages
    EmojiPicker.tsx              — wraps emoji-mart
    CreateSpaceModal.tsx         — 3-tab create modal
    SpaceHeader.tsx              — name + ⋯ menu + search
    SpaceHeaderMenu.tsx          — dropdown menu items
    SpaceSettingsModal.tsx       — General/Members/Notifications/Danger tabs
    InviteMembersDialog.tsx      — search users + agents
    SearchInSpacePane.tsx        — search side pane
  hooks/
    useSpace.ts                  — fetch space detail
    useSpaceMessages.ts          — paginated, infinite scroll
    useSpaceWebSocket.ts         — connect to SpaceAgent DO
    useTypingIndicator.ts        — Phase 2
    useEmojiRecents.ts           — read/write recent reactions
```

### Frontend (modified)

- `src/shared/config/nav.ts` — Spaces top-level nav item
- `src/shared/config/features.ts` — `spaces` feature flag
- `src/client/modules/approvals/pages/ApprovalsPage.tsx` — show spaceId column when present, link to space
- `src/client/App.tsx` — routes for /spaces, /spaces/:id

### Caps for Phase 1
- One @-mention dispatched per top-level message (parallel deferred)
- replyMode = `always` | `mention` | `off` only (proactive/ambient deferred)
- Default agents available globally (no install table; deferred)
- No quote-in-reply (Phase 2)
- No star (Phase 2)
- No pin-message (Phase 2 — pin-space-to-sidebar IS in Phase 1, different feature)

### Out for Phase 1 (explicitly)
- Pin-message + Pinned shelf view
- Star (personal bookmark on a message)
- Quote in reply
- Per-thread mute (`thread_subscriptions`)
- Card-format bot messages
- Space templates
- Cross-space search
- Read receipts
- Block member
- Turn off history (auto-delete)
- Open in popup / picture-in-picture
- Forward message

---

## Phase 2 — Polish + per-space configurability

- `space_agent_installs` — per-space agent registry
- Parallel multi-mention dispatch (cap 3 active per turn)
- Pin-message + Pinned shelf
- Star (personal bookmark on message)
- Quote-in-reply
- Per-thread notification mute (`thread_subscriptions`)
- Card-format messages for bot daily digests (structured payload renderer)
- Space templates: Marketing pod / Solo workshop / Customer support war room
- Email-on-invite for off-platform members
- Block member (admin/owner action)
- Member roles: owner / admin / member with permission gating
- Apps & integrations tab in Space Settings

---

## Phase 3 — Advanced agent behaviour

- `proactive` reply mode + classifier
- `ambient` reply mode + reaction-or-brief logic
- Slash sub-commands per agent (`@research /summarise-url <url>`)
- Read receipts ("see message views")
- Cross-space search via FTS5
- Bot-to-bot chain depth enforcement
- Per-space rate limiting
- Turn off history (auto-delete after 24h)
- Open in popup / picture-in-picture
- Forward message

---

## Open decisions (settled — flag if you disagree)

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
| 11 | Authentication on WebSocket | Pass session token in URL query string at connect; SpaceAgent verifies + checks membership before accepting |
| 12 | Bot online status | Always online (no flicker) — they're DO members, not WS clients |
| 13 | Last owner leaving | Forbidden (must transfer ownership or delete space) |
| 14 | Delete space — soft or hard? | Hard delete with a 24h "are you sure" cooldown, owner only |
| 15 | Message edit window | Indefinite (matches our existing chat) |
| 16 | Search scope from header | Within space only; cross-space deferred to Phase 3 |

---

## Out of scope (this work)

- Voice / video channels in a space — separate worked example
- Live IDE / Cloudflare Sandbox per space (the Ace pattern) — separate "Workspace" worked example
- Custom emoji upload (Slack-style `:partyparrot:`)
- Tasks-in-spaces
- Cross-org spaces (Phase 2 stays org-scoped)
- Replacing 1:1 chat UX — strictly preserves current "New chat" flow
- Drag-and-drop file attachments in a space's message input (Phase 2 if needed)

---

## Estimated effort

- **Phase 1** — 3-4 focused sessions
- **Phase 2** — 2-3 focused sessions
- **Phase 3** — open-ended (proactive/ambient classifiers are research-y)

Phase 1 unblocks Spaces dogfooding. Phase 2 makes it production-ready for forks. Phase 3 is differentiation.

---

## Build sequence — Phase 1

Each step is its own commit, independently shippable.

### Session 1 — schema + storage foundations (~3h)

1. **Schema migrations A + B** (~30 min)
   - `pnpm db:generate:named "phase_1a_spaces_unified_schema"`
   - Edit migration to include all the additive columns + new tables
   - Backfill SQL appended to migration
   - `pnpm db:migrate:local` + `pnpm db:migrate:remote`
2. **Drizzle schema updates** (~30 min)
   - `src/server/modules/conversations/db/schema.ts` — add new columns
   - New file: `src/server/modules/spaces/db/schema.ts` — re-exports + helpers
   - Type-check
3. **Storage dual-read** (~1h)
   - `src/server/modules/conversations/storage.ts` — read from `conversation_members` for owner/member checks
   - Fallback to `conversations.creatorUserId` if member rows absent (defensive)
   - Write tests if any exist; verify existing chat still works
4. **Migration C verification** — deploy, smoke-test 1:1 chat (ensure regression-free)

Commit + push at end. Deployable on its own.

### Session 2 — REST + DO + presence (~3h)

5. **SpaceAgent DO** (~1h)
   - `src/server/modules/spaces/space-agent.ts`
   - `onConnect` / `onClose` with presence tracking
   - `broadcastNewMessage` / `broadcastPresence` methods
   - `wrangler.jsonc` binding + migration tag
6. **REST API basics** (~1.5h)
   - `src/server/modules/spaces/routes.ts`
   - List, detail, create, members, send message, presence, mark-read, copy-link
   - `src/server/index.ts` mount
7. **Mention parser + dispatch** (~30 min)
   - `mention-parser.ts` extracts @ refs
   - `dispatch.ts` calls AutonomousAgent.runOnce with actingUserId + thread context
   - `autonomous-agent.ts` accept new RunOnceInput fields

Commit + push. Test via curl / Postman before UI.

### Session 3 — Frontend basics (~3h)

8. **Index + detail pages** (~1.5h)
   - SpacesIndexPage with pinned-at-top
   - SpacePage with member list, main timeline, send input
   - Routes in `App.tsx`, nav item in `nav.ts`
9. **WebSocket hook + presence** (~45 min)
   - `useSpaceWebSocket.ts` — connect, receive message + presence events
   - Member list shows online indicator
10. **@ autocomplete + mention pills** (~45 min)
    - MentionAutocomplete component with people + agents
    - MentionPill component for rendering in messages
    - Insert pill on select (not text)

Commit + push. Now you can dogfood: create a space, invite yourself + an agent, send messages, see basic UI.

### Session 4 — Threads + reactions + polish (~2-3h)

11. **Threads two-pane** (~1h)
    - ThreadPane component
    - "Reply in thread" action
    - Auto-thread for long agent replies (≥200 tokens)
    - Unread divider in thread
12. **Reactions** (~1h)
    - MessageReactions chips below messages
    - EmojiPicker via emoji-mart
    - Quick emoji row in MessageActionBar
    - User recent emojis stored on user record
13. **Hover action bar + More menu (Phase 1 subset)** (~30 min)
    - MessageActionBar hover overlay
    - More menu: Copy link / Mark unread / Delete (own)
14. **SpaceHeaderMenu + Settings modal** (~30 min)
    - Header dropdown with all Phase 1 items
    - SpaceSettingsModal with General / Members / Notifications / Danger tabs
15. **Search in space** (~45 min)
    - SearchInSpacePane component
    - GET /messages/search endpoint with FTS5

Commit + push. Final smoke test: create a space, full @-mention flow, threading, reactions, member management, search, leave/delete.

### Session 5 (if needed) — bug fixing + UX polish (~1-2h)

- Address anything found in dogfood
- Edge cases: forbidden last-owner-leave, deleted-message rendering, empty thread, reaction race conditions
- Mobile responsiveness for the three-pane layout
- Type-check + build clean
- Update `docs/AGENTS.md` with the SpaceAgent pattern

---

## Files to create/modify (consolidated)

### New server files
- `src/server/modules/spaces/db/schema.ts`
- `src/server/modules/spaces/routes.ts`
- `src/server/modules/spaces/storage.ts`
- `src/server/modules/spaces/space-agent.ts` (DO)
- `src/server/modules/spaces/mention-parser.ts`
- `src/server/modules/spaces/dispatch.ts`
- `src/server/modules/spaces/presence.ts`

### New client files
- `src/client/modules/spaces/pages/SpacesIndexPage.tsx`
- `src/client/modules/spaces/pages/SpacePage.tsx`
- `src/client/modules/spaces/components/MemberList.tsx`
- `src/client/modules/spaces/components/MentionAutocomplete.tsx`
- `src/client/modules/spaces/components/MentionPill.tsx`
- `src/client/modules/spaces/components/ThreadPane.tsx`
- `src/client/modules/spaces/components/MessageActionBar.tsx`
- `src/client/modules/spaces/components/MessageReactions.tsx`
- `src/client/modules/spaces/components/EmojiPicker.tsx`
- `src/client/modules/spaces/components/CreateSpaceModal.tsx`
- `src/client/modules/spaces/components/SpaceHeader.tsx`
- `src/client/modules/spaces/components/SpaceHeaderMenu.tsx`
- `src/client/modules/spaces/components/SpaceSettingsModal.tsx`
- `src/client/modules/spaces/components/InviteMembersDialog.tsx`
- `src/client/modules/spaces/components/SearchInSpacePane.tsx`
- `src/client/modules/spaces/hooks/useSpace.ts`
- `src/client/modules/spaces/hooks/useSpaceMessages.ts`
- `src/client/modules/spaces/hooks/useSpaceWebSocket.ts`
- `src/client/modules/spaces/hooks/useEmojiRecents.ts`

### Modified files
- `src/server/modules/conversations/db/schema.ts` — kind / spaceMode / defaultReplyMode / historyEnabled
- `src/server/modules/conversations/storage.ts` — dual-read from conversation_members
- `src/server/modules/approvals/db/schema.ts` — nullable spaceId, requestedByUserId
- `src/server/modules/approvals/routes.ts` — render space context
- `src/server/lib/agents/autonomous-agent.ts` — actingUserId, contextMessages, parentMessageId on RunOnceInput
- `src/server/index.ts` — mount spaces routes, export SpaceAgent
- `wrangler.jsonc` — SpaceAgent DO binding + migration
- `src/shared/config/nav.ts` — Spaces top-level
- `src/shared/config/features.ts` — `spaces` flag
- `src/client/App.tsx` — routes
- `src/client/modules/approvals/pages/ApprovalsPage.tsx` — space context

### Phase 2 additions (for reference)
- `src/server/modules/spaces/installs.ts` — agent installs CRUD
- `src/shared/config/space-templates.ts`
- `src/client/modules/spaces/components/PinnedShelf.tsx`
- `src/client/modules/spaces/components/QuoteReplyChip.tsx`

---

## References

### Google Chat patterns observed (validated this design)

From Jez's daily-driver Google Chat (JRC OrthoTrack space):

- **Two-pane threading** — main timeline left, thread side pane right with own input. Don't inline-expand.
- **Hover action bar** — quick-emoji row + react-picker + edit + thread + more, two zones with gap.
- **More menu** — Copy message link, Mark as unread, Star, Pin to space, Quote in reply, Forward, Delete, See message views.
- **Mention pills** — @-mentions render as inline avatar+name chips, not text. Click opens profile.
- **Bot identity** — small "App" or service-name badge after sender name. No special reaction icon for bots.
- **Bots as equal participants** — bots react with the same emojis humans do, same display.
- **Default quick-emoji** — Google uses 😀 👍 🚀 (we'll use 👍 ✅ ❤️ as defaults, top-3 recent floats up).
- **Space header dropdown** — Open in pop-up, Search, Manage members, Space settings, Space details, Apps and integrations, Copy link, Mark as read, Pin (space to sidebar), Mute, Notifications granularity, Turn off history, Leave, Block, Delete.
- **Threads never close** — ability to revive old threads is valuable.
- **Long bot replies auto-thread** — keeps timeline glanceable; detail one click away.

### Cloudflare Agents SDK API used

- `Agent` base class extends DO with WebSocket lifecycle helpers
- `connection.setState(metadata)` in `onConnect` to attach metadata (e.g. userId, joinedAt)
- `this.getConnections()` returns all active WebSocket connections
- `connection.state` accesses attached metadata
- `this.broadcast(message, [excludeIds])` sends to all clients except listed IDs
- `onConnect(connection, ctx)` / `onMessage` / `onClose` lifecycle hooks
- Direct DO RPC for inter-agent calls (SpaceAgent → AutonomousAgent.runOnce)

### Related issues
- [#43](https://github.com/jezweb/vite-flare-starter/issues/43) — this plan, tracking
- [#34](https://github.com/jezweb/vite-flare-starter/issues/34) — chat → AIChatAgent (orthogonal, doesn't block)
- [#35](https://github.com/jezweb/vite-flare-starter/issues/35) — AgentMemory binding (waiting GA)
- [#40](https://github.com/jezweb/vite-flare-starter/issues/40) — roadmap
- [#44-#47](https://github.com/jezweb/vite-flare-starter/issues/) — onboarding cluster

---

## Resume prompt (paste into a fresh session)

```
Resume the Spaces Phase 1 implementation per
.jez/artifacts/spaces-unified-plan-2026-04-27.md.

Approach: work through the "Build sequence — Phase 1" section
session-by-session, one commit per step. Do NOT skip the schema
migrations or the dual-read step — they're load-bearing for safety.

Test after each session by deploying and dogfooding the new surface
in a browser. Type-check and build before each push. Update progress
notes in .jez/artifacts/spaces-build-progress.md as you go (create
the file if it doesn't exist) so the next session can resume cleanly.

Work autonomously through Phase 1. When Phase 1 is done, ship it
with a feature flag default-on, file a follow-up issue for any
deferred polish, then stop and check in.

Decisions are settled per the "Open decisions" table — flag any
that need updating but don't re-debate.

Existing patterns to mirror:
- AssistantAgent (autonomous-agent.ts subclass) for agent dispatch
- VoiceInputExample (DO with WebSocket) for SpaceAgent shape
- ProjectsIndexPage for SpacesIndexPage layout
- ProjectPage two-column layout (adapt to three-pane)
- ConfirmDialog for destructive actions (delete space, leave)
- emoji-mart for the picker (add to package.json)

Cloudflare Agents SDK reference for presence:
- connection.setState({ userId, joinedAt }) in onConnect
- this.getConnections() to enumerate active WebSockets
- this.broadcast(message, [excludeId]) to fan out

Implementation tip: write minimal types upfront (Member, Message,
ReplyMode), then implement layer by layer.

Stop and check in if:
- A schema migration would lose data
- A test reveals existing chat is broken
- An open question surfaces that's not in the decisions table
- A library / dependency choice affects > 2 modules
```

---

## What I deliberately deferred from this plan

- Voice / video in a space — needs a separate worked example mapping `@cloudflare/voice` and the upcoming Cloudflare voice pipeline
- Live IDE / Cloudflare Sandbox per space (the Ace pattern from GitHub Next) — Sandboxes went GA in Agents Week 2026, but this is its own architectural exploration
- AgentMemory binding integration — still private beta as of 2026-04-17; revisit when GA
- Multi-user Projects (Phase 5 in roadmap) — independent of this work; either order ships fine
- Custom emoji upload — niche, real work for low value
- Cross-org spaces — needs a security design pass

End of plan.
