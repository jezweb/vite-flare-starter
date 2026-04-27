# Spaces Phase 1 — Build Progress

**Plan:** [.jez/artifacts/spaces-unified-plan-2026-04-27.md](./spaces-unified-plan-2026-04-27.md)
**Tracking issue:** [#43](https://github.com/jezweb/vite-flare-starter/issues/43)

## Status

| Session | Step | Status | Notes |
|---|---|---|---|
| 1 | Schemas + migration A+B | ✅ | `20260427075008_spaces_phase_1_unified_schema.sql` applied local + remote |
| 1 | Drizzle schema updates | ✅ | conversations / conversation_messages / conversation_members / pending_approvals |
| 1 | Storage dual-read (Migration C) | ✅ | isOwner / isMember; createConversation seeds default members |
| 1 | Verification — 1:1 chat unchanged | ✅ | type-check + build clean, deploy successful |
| 2 | SpaceAgent DO | ✅ | onConnect auth, presence, broadcastNewMessage RPC |
| 2 | REST API basics | ✅ | spaces routes + messages routes |
| 2 | Mention parser + dispatch | ✅ | text + pill parsing, AutonomousAgent.runOnce wired with actingUserId / contextMessages / parentMessageId |
| 3 | Index + detail pages | ✅ | SpacesIndexPage with pinned-first; SpacePage three-pane |
| 3 | WebSocket hook + presence | ✅ | useSpaceWebSocket with TanStack cache integration |
| 3 | @ autocomplete + mention pills | ✅ | MentionAutocomplete with keyboard nav, MentionPill renderer, MessageInput tokens |
| 4 | Thread two-pane | ✅ | Right-side ThreadPane in SpacePage |
| 4 | Reactions + emoji-mart | ✅ (partial) | 3 quick emojis (👍 ✅ ❤️). Full emoji-mart picker deferred — dep not added |
| 4 | Header menu + Settings modal | ✅ | SpaceHeaderMenu + SpaceSettingsModal (4 tabs) |
| 4 | Search in space | ✅ | SearchInSpacePane (LIKE-scan; FTS5 follow-up) |
| post | UX audit + Critical/High fixes | ✅ | C1, C2, H1, H3, H4, M2, L1 fixed inline; H2/H5/C3/M1/M3 documented as follow-ups |

## Decisions made during build

- **Members table is the source of truth for ownership/membership;** `conversations.user_id` survives only as a defensive fallback during the brief window between conversation create and member insert.
- **createConversation seeds default members** so unified storage works for legacy 1:1 chats from day one of new code, not just for backfilled rows.
- **AutonomousAgent gained `actingUserId / contextMessages / parentMessageId`** — when contextMessages is supplied (Spaces dispatch path), the agent does NOT persist the run into its own recentMessages, avoiding duplicate history accumulation.
- **Agent partition for spaces is `space:${spaceId}:${agentName}`** — distinct from per-user partition so the room's research bot remembers the space's discussion, not the owner's 1:1 chat.
- **Phase 1 dispatches one mention per message** — parallel cap-3 fan-out is Phase 2.
- **Auto-thread when an assistant reply >800 chars** from a top-level mention — keeps timeline glanceable.
- **Reactions ship without emoji-mart** — quick-bar with 👍 ✅ ❤️ only. Adding a dep + bundle weight wasn't justified for Phase 1; full picker is a clean follow-up.
- **Search uses LIKE-scan**; FTS5 follow-up filed for performance once dogfood reveals scale.

## Surprises / out-of-scope debts

- Hook security warning fired on `mention-parser.ts` first write (string match on "exec") — second write succeeded; nothing actually used child_process.
- TS4111 `noPropertyAccessFromIndexSignature` requires bracket-access on both sides of zod-validated body assignments. Not worth adding strict types.
- emoji-mart not installed — quick-bar good enough for now.
- Phase 1 user-mention text scanning skipped server-side; pill-mention parts (with explicit userId in data) are the only way to mention a person. Phase 2 adds handle metadata on the user record.

## Phase 2 + Phase 3 (shipped 2026-04-27)

| Item | Status | Commit notes |
|---|---|---|
| **Phase 1 polish — agent picker + 6 templates** | ✅ | `8529754` — Custom tab gets checkboxes + reply-mode selector; Templates tab grid live with 6 starter packs |
| **Pin-message + Pinned shelf** | ✅ | header pinned-count badge → inline list shelf |
| **Star (personal bookmark)** | ✅ | star icon on starred rows + GET /api/messages/starred/me |
| **Quote-in-reply** | ✅ | More-menu → quote chip above input → bordered preview on send |
| **Per-thread subscription** | ✅ (server) | UI bell wiring deferred — endpoint exists |
| **Parallel multi-mention dispatch** | ✅ | cap raised 1 → 3 with Promise.allSettled fan-out |
| **Block member** | ✅ (server) | UI surfacing deferred — PATCH /:id/members/:memberId/block exists |
| **History toggle** | ✅ | switch in settings + cron sweep at 15-min cadence (50 rows/tick) |
| **Cross-space search** | ✅ | GET /api/search/messages?q= scoped to user's memberships |
| **Forward message** | ✅ | dialog + endpoint; member-of-both-spaces gate |
| **MessageMoreMenu** | ✅ | shadcn dropdown wired into hover bar |

## Audit follow-ups carrying forward

- **H2** Last-owner-leave guard is non-atomic (low likelihood under Phase 1 dogfood traffic).
- **H5** Backfilled member ids use 32-char hex (no hyphens) vs UUID-v4 from `crypto.randomUUID()` — cosmetic.
- **C3** Reactions read-modify-write race — Phase 1 acceptable for small rooms.
- **M1** `markRead` fires every page mount; debounce.
- **M3** Members rail invisible on phones; add a Sheet drawer.

## Follow-ups to file

- [ ] `emoji-mart`: full picker for arbitrary reactions
- [ ] FTS5 spaceId-scoped search route to replace LIKE-scan
- [ ] Inline edit + tombstone broadcast for deleted messages
- [ ] Phase 2 — pin-message, star, quote-in-reply, parallel multi-mention
- [ ] Per-thread mute (`thread_subscriptions` table)
- [ ] User handle field on user record so server-side text mention scanning works for people, not just bots
