---
date: 2026-05-04
status: v2.1 — corrected after Phase 1 dispatch + Option E recon
owner: jez+claude
related:
  - GitHub issue #34
  - chat-migration-recon-2026-05-04.md (Q1-Q7 SDK basics)
  - option-e-full-embrace-recon-2026-05-04.md (full architecture review)
  - https://github.com/cloudflare/agents-starter/blob/main/src/server.ts
  - https://www.npmjs.com/package/@cloudflare/ai-chat
supersedes_v1: 2026-05-04 (the v1 was dual-path / feature-flag / adapter — too defensive given test-only data across forks)
---

# Chat module → AIChatAgent migration plan (v2.1)

## Corrections in v2.1

Two issues caught after v2 was committed:

1. **Spaces shares the conversation tables.** The Phase 1 agent caught this before any code changes — `conversations`, `conversation_messages`, `conversation_members` are NOT chat-only. Spaces, Projects, Memories, Admin-Tools all read these tables. v2's "drop the conversations tables" step would have catastrophically broken Spaces. **Fix:** keep the tables. Chat's legacy `routes.ts` + `D1ChatStorage` get deleted, but the underlying `conversations` schema stays as the cross-module shared primitive that ALL chat-shaped DOs (chat, spaces) project to via `onChatResponse`.

2. **The "Option E full-embrace" framing was wrong.** The Option E recon (`option-e-full-embrace-recon-2026-05-04.md`) confirmed the codebase is already SDK-aligned. Specialists (AssistantAgent, ResearcherAgent, WriterAgent, AdminAgent, SweeperAgent) extend `AutonomousAgent extends Agent` — correct SDK primitive for stateful RPC agents. SpaceAgent extends Agent — correct for WebSocket coordinators. Voice/Video extend Agent + streaming mixin — correct. **Only the chat module needs migration.** Specialists, Spaces, Voice/Video stay as-is.

These corrections leave the chat-only migration scope unchanged but make the doc honest about what's NOT in scope.

## Headline

**Replace** the current chat module with the SDK pattern. No dual-path. No feature flag. No adapter. Existing conversations are test data — they get cleaned up.

Three sessions of work. Each session ends with the chat module in a working SDK-aligned state. Pure SDK conventions everywhere except where the SDK genuinely doesn't address a need (cross-conversation sidebar list + search — minimum-viable D1 index).

## Why v2

v1 of this plan (earlier today) assumed we needed to preserve historic conversations and de-risk against an in-production daily driver. Jez's feedback: *"i don't think we should be too concerned of backward compatible or existing conversations, right now, i have only a few meaningful forks and they only have test data in them anyway, i really would like us to work to the standards of docs/sdk so that we are not diverging if we don't need to"*.

That changes the plan shape:

| v1 assumed | v2 takes |
|---|---|
| Preserve old conversations | Drop them (test data) |
| Feature flag for safe parallel rollout | Replace wholesale |
| Adapter so AutonomousAgent specialists stay | Specialists already use SDK base (`Agent`); chat agents use AIChatAgent. Both SDK-aligned, separate primitives, no need to unify. |
| 6 phases over 4-5 sessions | 3 phases over 3 sessions |

## What stays separate (and SDK-aligned in its own right)

`AutonomousAgent` (our base class for routines / scheduled / autonomous-loop work) **stays**. It already extends `Agent` from the SDK — that's the SDK-blessed pattern for non-chat agent work. AdminAgent, ResearcherAgent, WriterAgent, AssistantAgent, SweeperAgent all keep their current shape. They're not chat agents — they're autonomous task agents.

`AIChatAgent` is the SDK-blessed pattern for **interactive multi-session chat**. It's a different primitive serving a different need.

The two coexist. Routines fire AutonomousAgent instances. Chat fires AIChatAgent instances. Both are SDK-aligned. The chat module's migration doesn't touch routines.

## What we currently do that diverges from SDK (and aligns post-migration)

| Currently | SDK-aligned |
|---|---|
| `D1ChatStorage` interface | DO SQLite, automatic |
| `buildChatAgent` factory wrapping ToolLoopAgent | `class ChatAgent extends AIChatAgent` |
| Custom SSE plumbing for streaming | `result.toUIMessageStreamResponse()` over WebSocket |
| Channels-based tool approval (for chat tools) | Per-tool `needsApproval: async (input) => boolean` |
| Custom MCP integration in chat tools | `this.mcp.getAITools()` |
| Inline `delegate_to_X` tools | `agentTool(SubAgent, { ... })` |
| Manual conversation persistence (D1 messages table) | DO-managed |
| Custom retry / continue / regenerate UX | `useAgentChat` from `@cloudflare/ai-chat/react` |

**Migration aligns all of these in one go.**

## What still needs custom code post-migration (with reason)

| Custom thing | Why SDK doesn't address it |
|---|---|
| `chat_sessions` D1 table — just `{ id, userId, title, projectId, createdAt, updatedAt }` | SDK assumes one or a few DO instances per user; doesn't ship a "list all conversations for user X" surface |
| Conversation search projection (FTS5 over message bodies) | Per-DO search would require N+1 across DOs; cross-conversation search needs an index |
| Skill activation in `onChatMessage` | Skills are our system, not SDK |
| Project context layering | Our system |
| Sidebar UI listing conversations | Reads from `chat_sessions` table |
| Routine system (untouched) | Separate primitive |
| Approvals queue (for routine-fired tools) | Separate from chat tool approval |

The custom code is **smaller** than today (the message storage layer disappears). What remains is genuinely additive over the SDK, not duplicating it.

## Decisions

These are now mostly clear from Jez's guidance. Listing for the audit trail.

1. **DO is authoritative for live state. D1 `conversation_messages` is the cross-module projection.** ← corrected in v2.1. Because Spaces/Projects/Memories/Admin-Tools read `conversation_messages` directly, ChatAgent's `onChatResponse` hook writes through to that existing table after each turn. `chat_sessions` is a NEW additive table that just maps `{userId, conversationId, doInstanceName}` so the sidebar can list conversations + look up the right DO instance. No new `messages_index` — the existing `conversation_messages_fts` already does FTS5 search across both chat and spaces.
2. **Exact version pinning** — `@cloudflare/ai-chat@0.6.2`, `agents@0.12.3`. Re-evaluate at every bump.
3. **Conversation tables kept (shared with Spaces)** — `conversations`, `conversation_messages`, `conversation_members` STAY. They're cross-module primitives owned by the conversations module, used by chat AND spaces AND projects AND admin-tools. The new ChatAgent writes through to these tables via `onChatResponse` for cross-conversation search + admin views. Test data orphans get cleaned up via a one-shot DELETE (rows where `kind='chat'` from before the migration). New `chat_sessions` is additive — just maps `{userId, conversationId, doInstanceName, projectId}` for sidebar lookups.
4. **AutonomousAgent specialists keep their current shape** — different primitive, different need. Chat agent uses SDK `agentTool()` for new sub-agent surfaces; existing inline `delegate_to_X` tools either stay (if they work) or become AIChatAgent subclasses if we want streaming sub-agents.
5. **Mount SDK router** — `routeAgentRequest` for agent traffic. Hono keeps `/api/chat-sessions/*` for the read-only sidebar list + search endpoints (those don't need to be agent-routed).
6. **`messageConcurrency = "queue"`** — SDK default. Revisit per-surface if we see usage patterns that benefit from another strategy.

## Phases

### Phase 1 — Replace the chat module (~1 session, 4-6 hrs)

Goal: legacy chat code is gone. New `ChatAgent extends AIChatAgent` is the only chat path. **Conversation tables KEPT (shared with Spaces).** Sidebar reads from new `chat_sessions` index table. Old `kind='chat'` rows in `conversations` are deletable as test-data cleanup.

**SDK installs**:
- `agents` 0.11.5 → 0.12.3
- `ai` 6.0.161 → 6.0.175
- `@ai-sdk/react` 3.0.163 → 3.0.177
- Add `@cloudflare/ai-chat@0.6.2` (exact)

**Schema changes**:
- New table: `chat_sessions { id, userId, organizationId, conversationId, doInstanceName, archived, createdAt, updatedAt }` — additive sidebar index. `conversationId` foreign-keys to existing `conversations` table.
- **KEEP**: `conversations`, `conversation_messages`, `conversation_members` tables (shared with Spaces — confirmed by Phase 1 recon). They're owned by the conversations module, not the chat module.
- **KEEP**: `conversation_messages_fts` (used by spaces global search and chat search alike)
- Drizzle migration: additive only — one CREATE TABLE for `chat_sessions` + indexes.
- Test-data cleanup (one-shot): `DELETE FROM conversations WHERE kind='chat'` and let cascades clean up `conversation_messages` + `conversation_members` rows. Run separately, AFTER the new path is verified working.

**Wrangler config**:
- New DO binding: `{ "name": "ChatAgent", "class_name": "ChatAgent" }`
- New SQLite migration tag for `ChatAgent` class

**Server code** (lots removed, less added):
- New: `src/server/modules/chat/chat-agent.ts` — `class ChatAgent extends AIChatAgent<Env>` following the canonical `agents-starter/src/server.ts` pattern verbatim
- New: `src/server/modules/chat-sessions/` — Hono routes for sidebar list, create-session-and-get-DO-name, delete, search
- Mount `routeAgentRequest` in `src/server/index.ts` Worker fetch handler (before Hono catchall)
- Delete: `src/server/modules/chat/` everything except the new agent file
- Delete: `src/server/lib/ai/agent.ts` (`buildChatAgent`)
- Delete: D1ChatStorage interface
- Delete: SSE streaming plumbing
- Delete: custom tool approval channels (chat-side; routine-side stays)
- Update: `tools/` registry to fit the SDK's `tool()` shape per agents-starter

**ChatAgent contents** (`onChatMessage`):
- System prompt assembly (using A1 pattern)
- Skills activation: parse user input for slash commands, inject skill body into system or user message
- Project context: read `projectId` from session metadata, fetch context, inject
- MCP: `this.mcp.getAITools()`
- Tools: existing 60+ tools migrated to `tool()` from `ai` with `needsApproval` per the SDK pattern
- File / image parts: inline data URI workaround copied verbatim from agents-starter
- `pruneMessages` for token-aware history trim

**Client code**:
- ChatPage uses `useAgentChat({ agent })` from `@cloudflare/ai-chat/react`
- Sidebar: list conversations from `/api/chat-sessions`, click opens `useAgent({ agent: "ChatAgent", name: session.doInstanceName })`
- Tool result rendering: same UIMessage parts shape, existing renderers work
- Tool approval UI: SDK's `addToolApprovalResponse` replaces our channels-based approval card

**Tests**:
- Replace existing chat e2e tests (Playwright) with SDK-equivalent flows
- Verify: send message → response, regenerate, edit, file upload, vision, MCP tool call, skill activation, project context, tool approval

**Acceptance**:
- Chat works end-to-end against `useAgentChat`
- Sidebar lists conversations from `chat_sessions`
- All existing chat features verified (system prompt, skills, projects, MCP, tools, files, vision, regenerate, approval)
- Tests green (108 vitest + Playwright e2e updated)
- Build + type-check clean
- Live deploy verified

**Rollback**: git revert. Test data was dropped — no data loss. Old chat module reappears, works as before.

### Phase 2 — Cross-conversation search (~0.5 session)

Goal: search across all of a user's conversations.

**Decision point**: do we even need this? The SDK assumes per-conversation context. If we don't strongly need cross-conversation search, skip this phase entirely.

**If yes** (probably yes — we have it today):
- Add `chat_messages_index` table — `{ id, sessionId, userId, role, contentSnippet, createdAt }`
- Add FTS5 virtual table over `contentSnippet`
- Hook `onChatResponse` in `ChatAgent` to write index rows via `ctx.waitUntil`
- API: `GET /api/chat-sessions/search?q=` — same shape as today
- CommandPalette content-search mode keeps working (currently searches entities; can add a "search chat" mode if useful)

**If no**: skip. Sidebar can list-only by date.

This is a clear "necessary divergence" — the SDK doesn't address cross-conversation search. We project a minimum-viable index, no message body duplication beyond a 200-char snippet.

**Acceptance**:
- Search a phrase from a previous conversation; sidebar surfaces it.

**Rollback**: drop the table + revert the hook code.

### Phase 3 — agentTool sub-agents (~1 session)

Goal: prove the new SDK capability with one concrete delegation. Future delegations follow the pattern.

**Decision: which sub-agent first?**

Two options:
- **Research sub-agent** — `class ResearcherChatAgent extends AIChatAgent` that does web-search-y research. Streaming chunks back to parent makes the UX much nicer than today's `delegate_to_research` tool that returns a blob.
- **Summariser sub-agent** — exactly the example in the SDK README. Lower domain stakes, easier to land cleanly.

**Recommendation**: start with summariser per the README. Once the pattern is proven, port research.

```typescript
class Summariser extends AIChatAgent<Env> {
  async onChatMessage() {
    return streamText({
      model: ...,
      system: "Summarise the input text concisely.",
      messages: await convertToModelMessages(this.messages),
    }).toUIMessageStreamResponse()
  }
}

class ChatAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    return streamText({
      model: ...,
      tools: {
        summarise: agentTool(Summariser, {
          description: "Summarise long text in a streaming sub-agent",
          inputSchema: z.object({ text: z.string() }),
        }),
        // existing tools...
      },
    }).toUIMessageStreamResponse()
  }
}
```

**Acceptance**:
- Chat user submits long text → calls summarise tool → sub-agent streams chunks back into the parent message → renders progressively in UI.
- Pattern documented in `docs/AGENTS.md`.

**Rollback**: remove the tool from chat agent's tools map. Sub-agent class stays; not invoked.

## Risk register (much smaller than v1)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SDK breaking change between 0.6.x bumps | Medium | Medium | Exact pin, manual changelog review |
| File / image upload SDK quirks | High | Low | Copy `inlineDataUrls` workaround from agents-starter verbatim. They've already solved it. |
| MCP integration shape differs from current | Medium | Low | Read SDK MCP types before Phase 1 starts. Probably 1-day learning, not blocker. |
| `routeAgentRequest` route collision | Low | Medium | Verify no `/agents/chat/*` routes exist in current Hono. (Likely clean.) |
| Lose a chat feature in the wholesale replace | Medium | Medium | Inventory all chat features before Phase 1. Migrate each, manually verify. |
| DO migration tag is one-shot for class shape | Low | Medium | Standard Cloudflare DO migration discipline; we're starting fresh so first tag is safe. |
| The 60+ chat tools need re-shaping | Medium | Medium | They mostly use `tool()` from `ai` already. Verify each fits the SDK pattern. |

No "Phase 5 partial rollback" risk anymore — there's no Phase 5 cutover. We replace once.

No "feature flag complexity" anymore.

No "two paths to maintain" anymore.

## Open questions to verify before Phase 1 starts

Smaller list than v1 because the architecture is simpler.

1. **MCP `userId` propagation**: how does `this.mcp` know the requesting user for credential lookup? Read the SDK MCP source.
2. **File parts and `inlineDataUrls`**: confirm the workaround pattern works for our existing image/PDF/audio paths.
3. **`pruneMessages` import path** in `ai@6.0.175`.
4. **`@callable()` decorator support** — already used in agents-starter; verify TS decorator syntax compiles cleanly under our `tsconfig.json`.
5. **`routeAgentRequest` mount point** — exact placement in our Worker fetch handler relative to Hono and asset serving.
6. **WebSocket cost model** — long-lived per-conversation connections. Verify CF DO pricing accommodates Jezweb's expected usage.
7. **History pruning vs compact-and-fork (issue #29)**: AIChatAgent has `pruneMessages` + `maxPersistedMessages` — does the SDK now obsolete part of #29?

## Effort + sequencing

| Phase | Estimate | Dependency |
|---|---|---|
| Phase 1 — Replace | 1 session (4-6 hrs) | — |
| Phase 2 — Cross-conv search | 0.5 session | Phase 1 done |
| Phase 3 — agentTool sub-agents | 1 session | Phase 1 done; Phase 2 not required |

**Total: 2.5 sessions of focused work.** Could be done in one long session if we're patient + Phase 2 is skipped.

## What's preserved verbatim from v1

- Open questions (with the smaller list above)
- Risk principles (exact pin, copy workarounds, verify before code)
- The "Read SDK before Phase 1" discipline

## What's dropped from v1

- Six decisions list (now four, mostly auto-resolved by Jez's guidance)
- Feature flag throughout phases
- Hybrid DO + D1 projection (replaced with minimal D1 index)
- Adapter pattern for AutonomousAgent specialists
- Cutover phase (no cutover — wholesale replace)
- Decommission phase (decommissioning happens during Phase 1's deletes)
- Dual-path testing (only one path now)
- 1-week soak (no parallel deploy to soak)
- Phase 5 partial rollback caveat (no cutover risk)

## Ready to start

Phase 1 is a single coherent session. Once kicked off, the chat module is in flux until landed — not safe to mix with other work.

If you confirm, I'll:
1. Verify the 7 open questions in a 30-min recon
2. Write a one-pager session-spec for Phase 1 with the file-by-file diff plan
3. Run Phase 1 in a single ~5-hour session
4. Smoke-test live + ship

Or sleep on it and decide tomorrow.
