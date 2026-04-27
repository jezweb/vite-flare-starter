# Spaces Phase 1 — UX + Code Audit (2026-04-27)

Audit performed by `feature-dev:code-reviewer` subagent against the freshly-shipped Spaces module. All commits to `main` as of 2026-04-27 0750 UTC.

## Summary

3 Critical | 5 High | 3 Medium | 2 Low

## Findings

### Critical

**C1 — Deleted messages never broadcast removal**
*Location:* `src/server/modules/spaces/messages-routes.ts` (DELETE handler)
*Observation:* On message delete the route calls `broadcastNewMessage(id)` which loads the row from D1 — but it's already deleted, so the load returns null and `broadcastNewMessage` silently no-ops. Connected clients never receive a frame, so the deleted message stays visible in their UI until reload.
*Fix:* Send a typed `delete` frame before the row is removed (or via a separate `broadcastDelete(id, conversationId)` RPC). Have the client's `useSpaceWebSocket` cache handler remove the message on receipt.

**C2 — SpaceHeaderMenu uses wrong "me" member**
*Location:* `src/client/modules/spaces/components/SpaceHeaderMenu.tsx`, the `meMember = data?.members.find((m) => m.kind === 'user')` line.
*Observation:* This finds the FIRST user-type member, which in a multi-user space is whoever joined first — not the session user. Pin / mute / leave / "is owner" all target the wrong row.
*Fix:* Pull the session user via `useSession()` and match `m.userId === session.user.id`. Same fix in `SpaceSettingsModal`.

**C3 — Reactions read-modify-write race**
*Location:* `src/server/modules/spaces/messages-routes.ts` (POST /:id/reactions)
*Observation:* Loads `reactions` JSON, mutates in JS, writes back. Two concurrent reactions on the same message can overwrite each other.
*Fix:* For Phase 1 dogfood scale this is acceptable but documented; long-term move to a per-reaction row table or a SQL JSON merge. At minimum guard with a transaction or D1 batch.

### High

**H1 — Top-level message double-write into cache**
*Location:* `src/client/modules/spaces/hooks/useSpaceWebSocket.ts`
*Observation:* When a non-thread message arrives, both blocks (lines ~58 and ~80) write into the same `['spaces', id, 'messages', 'top']` cache. The dedupe guard (`some(m=>m.id===msg.id)`) prevents the second insert but the redundant block is a maintenance hazard.
*Fix:* Drop the second block; the first already covers top-level.

**H2 — Last-owner-leave guard not atomic**
*Location:* `src/server/modules/spaces/routes.ts` DELETE /:id/members/:memberId
*Observation:* Counts owners, then deletes. Two concurrent owner-leaves can both pass the count check.
*Fix:* Use a CTE-style update or a transaction: `DELETE WHERE id=? AND (SELECT COUNT(*) FROM conversation_members WHERE role='owner' AND conversationId=?) > 1`. Cloudflare D1 supports BEGIN/COMMIT; or accept Phase 1 risk and document.

**H3 — Thread-count race**
*Location:* `dispatch.ts` and `messages-routes.ts` thread reply handler
*Observation:* SELECT replies, count, UPDATE. Concurrent thread replies can land between count and write, producing wrong counts.
*Fix:* Use `UPDATE ... SET thread_count = thread_count + 1, last_thread_at = ?`. Single statement, no race.

**H4 — LIKE-search wildcard injection**
*Location:* `src/server/modules/spaces/routes.ts` GET /:id/messages/search
*Observation:* `like(parts, \`%${q}%\`)` interpolates user input directly. A user passing `%` matches every message; `_` matches any single char.
*Fix:* Escape `%` and `_` in the query string before interpolation, or switch to FTS5.

**H5 — Mixed UUID formats in member ids**
*Location:* `drizzle/20260427075008_spaces_phase_1_unified_schema.sql` backfill
*Observation:* Backfill generates ids via `lower(hex(randomblob(16)))` (32 hex chars, no hyphens). New rows from `crypto.randomUUID()` are 36 chars with hyphens. Same column = inconsistent format. Not strictly broken but ugly to debug.
*Fix:* Either use `printf` with hyphens in the backfill, or accept and document.

### Medium

**M1 — Mark-as-read on every mount**
*Location:* `SpacePage.tsx` — `useEffect(() => { markRead.mutate() }, [id])`
*Observation:* Fires on every mount, including rapid navigation back/forward. Floods the API.
*Fix:* Debounce by 1s or only fire when there are actual new messages since last read.

**M2 — No guard against `SpaceAgent` as agentClass**
*Location:* `dispatch.ts` namespace lookup
*Observation:* If a member row gets `agentClass='SpaceAgent'` (via the invite endpoint), the dispatcher would resolve env.SpaceAgent and try to runOnce on it — which doesn't exist. Confusing error.
*Fix:* Allowlist the dispatchable agent classes in the schema or in the routes' agent invite handler.

**M3 — Mobile members rail invisible**
*Location:* `SpacePage.tsx` left rail uses `hidden md:block`
*Observation:* On phones, the members list is unreachable.
*Fix:* Add a Sheet drawer triggered by a "Members" button in the header on small screens.

### Low

**L1 — First @-mentioner becomes agent owner**
*Location:* `dispatch.ts` `await stub.setOwner(senderUserId)`
*Observation:* The agent's state.userId is set to whoever first mentioned them, not the space creator. This affects which user's BYOK keys are used and which user's MCP scope.
*Fix:* Set agent owner to space creator on space create (in routes.ts POST /), not lazily on first mention.

**L2 — `agentClass='AssistantAgent'` hardcoded in backfill**
*Location:* migration backfill
*Observation:* If a fork removes AssistantAgent, the legacy 1:1 chat backfill would break dispatch attempts. Workers AI might not even have the binding.
*Fix:* Document; this is Phase 1 scope and AssistantAgent ships with the starter.

## Triage

**Fix in this session (Critical + High):** C1, C2, C3, H1, H2, H3, H4, H5

**Defer / file follow-up:** M1 (debounce), M2 (allowlist), M3 (mobile), L1 (owner-on-create), L2 (doc)
