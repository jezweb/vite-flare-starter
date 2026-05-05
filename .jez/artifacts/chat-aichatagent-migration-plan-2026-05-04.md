---
date: 2026-05-04
status: draft (awaiting Jez sign-off on the locked decisions)
owner: jez+claude
related:
  - GitHub issue #34
  - .jez/artifacts/overnight-execution-report-2026-05-04.md
  - https://github.com/cloudflare/agents-starter/blob/main/src/server.ts
  - https://www.npmjs.com/package/@cloudflare/ai-chat
---

# Chat module → AIChatAgent migration plan

## Headline

Migrate the chat module from `buildChatAgent` (custom AI SDK harness) onto Cloudflare's `@cloudflare/ai-chat` SDK in **6 phases over 3-4 focused sessions**, with a feature flag enabling parallel-path operation throughout.

The SDK gives us **3 capabilities we currently can't ship without re-implementing**: resumable streaming, multi-device live sync, retained streaming sub-agents (`agentTool()`). Plus standardised replacements for things we already have (DO storage, tool approval, overlapping-message strategies, MCP integration).

D1 conversations stays as a **write-through audit + search projection** so FTS5 search, admin tooling, and cross-conversation analytics keep working without rebuild.

The migration is high-stakes — chat is the daily driver. Risk mitigated by: feature flag throughout all phases, no required cutover (old path can stay as fallback), no destruction of existing data, every phase independently shippable.

## Why this is worth getting right

The chat module is by far the most complex surface in the starter — touching files, skills, projects, MCP, tool approval, vision, search, export, regenerate, edit, branching, history pruning, sources, conversation persistence, sidebar, title summarisation, and audit trail. Any one of those breaking in production looks like "the AI is broken" to users.

**Why now** (not 6 months ago, not 6 months later):
- `agentTool()` for streaming sub-agents shipped 2026-04-30 — 4 days ago.
- `@cloudflare/ai-chat` is 11 days old as a separate package.
- Active stabilisation cadence (9 versions in 11 days) means production bugs are being caught and fixed by Cloudflare in real-time.
- Our `agents@0.11.5` chat path is on the **deprecated** import (`agents/chat` re-exports with deprecation warning).
- Postponing means each new chat feature we ship deepens the divergence and makes migration harder.

**Why this is the right scope** (not bigger, not smaller):
- Smaller (just the SDK swap, not architectural change): leaves us still maintaining custom plumbing the SDK has standardised. No payoff.
- Bigger (rebuild conversation model from scratch): chat works fine functionally; the SDK upgrade is the win, not a rewrite.

## Decisions to lock before any code

**These need your explicit answer. The plan below assumes "yes" to each. If any is "no", the plan changes shape.**

### D1. Hybrid (DO authoritative + D1 projection) confirmed?

**Yes** assumes: AIChatAgent owns live state in DO SQLite. After each turn, `onChatResponse` hook writes a projection to D1 (`conversations`, `messages` tables) for FTS5 search, admin views, cross-conversation analytics. DO is the single writer. D1 is read-only from the rest of the app's perspective.

**Alternative (NO)**: pure migration to DO. Drop D1 conversations table. Re-implement search per-DO or via Vectorize.

**My recommendation**: yes, hybrid. The cost of write-through (one extra D1 write per turn, async via `ctx.waitUntil`) is far less than the cost of rebuilding search + admin + analytics. If you ever want to drop the projection, that's a separate decision later.

### D2. Version pinning strategy?

**Recommended**: pin `@cloudflare/ai-chat` to **exact** version (e.g. `0.6.2`, not `^0.6.2`). Track upstream changelog manually. Bump deliberately.

The 9-versions-in-11-days cadence is a stabilisation signal — patches are landing fast and some are subtle (provider tool-call replay regressions, sub-agent WebSocket fixes on deployed Workers). Not bleeding-edge, but not auto-update territory either.

`agents` itself: same exact pin recommendation until 1.0 lands.

### D3. Existing conversations — leave on legacy forever, or migrate?

Three options:

| Option | What | Effort | Risk |
|---|---|---|---|
| **Leave** | Conversations created before cutover stay on `buildChatAgent`. New conversations on AIChatAgent. | None | Two code paths to maintain forever |
| **Soft migrate** | Read still works on legacy. New messages on existing conversations route to AIChatAgent. | Medium | Edge cases on conversation continuation |
| **Hard migrate** | One-time export-import script. All conversations rehosted as DOs. | Medium-large | Migration script bugs lose data |

**My recommendation**: **leave** for v1. Old conversations are immutable history. New conversations get the new capabilities. Maintain two read paths but only one write path forever (existing conversations effectively become read-only in the legacy model). Decide later whether a one-time migration earns its keep.

### D4. AutonomousAgent specialists — keep, migrate, or adapt?

Our existing specialist agents (`AssistantAgent`, `ResearcherAgent`, `WriterAgent`, `AdminAgent`, `SweeperAgent`) extend `AutonomousAgent`, not `AIChatAgent`. The new `agentTool()` SDK primitive accepts `AIChatAgent` subclasses (and `Think`).

Three paths:

| Path | What | Trade-off |
|---|---|---|
| **Keep** | Specialists stay AutonomousAgent. We don't use `agentTool()`. Lose the new capability for delegation. | No effort, no win |
| **Migrate** | Each specialist becomes an `AIChatAgent` subclass. agentTool() works directly. | High effort, regression risk on specialists already in production |
| **Adapter** | Build one `AgentToolAdapter extends AIChatAgent` that wraps an AutonomousAgent. Specialists stay; agentTool() works through the adapter. | Medium effort, single seam |

**My recommendation**: **adapter** for v1. Specialists keep their current shape (multi-tool autonomous loops with their own contracts). The adapter lets the chat agent call them via `agentTool()` for streaming retained delegation. Once the adapter is stable, we can decide if any specific specialist should migrate to AIChatAgent natively.

### D5. Routing — Hono vs SDK router?

Current chat module uses Hono routes at `/api/chat/*`. The SDK provides `routeAgentRequest` for handling agent WebSocket + HTTP at `/agents/{class}/{name}` paths.

**Recommendation**: mount both. SDK handles `/agents/chat/*` for the new path. Hono keeps `/api/chat/*` for legacy + non-chat endpoints (conversations list, search, export, etc. — these are read-only D1 queries, fine to stay in Hono).

The `routeAgentRequest` is added to the existing Worker fetch handler as a fallback before Hono's catchall. No breaking change.

### D6. Concurrent message strategy?

SDK supports: `"queue" | "latest" | "merge" | "drop" | { strategy: "debounce", debounceMs: 750 }`.

Default is `"queue"` (process every message in order — matches our current behaviour).

**Recommendation**: start with `"queue"`. Migrate, dogfood, then revisit per-conversation-type (e.g. admin chat could be `"queue"`, regular chat could be `"latest"`).

## Phases

Each phase is independently shippable. After each phase, the app remains functional with the feature flag default to old path. Cutover only happens at Phase 5.

### Phase 0 — Preparation (~30 min, no chat code touched)

| Task | Notes |
|---|---|
| Update `agents` 0.11.5 → 0.12.3 | 8 patch versions; mostly fixes per the changelog. Run full test suite + e2e after. |
| Update `ai` 6.0.161 → 6.0.175 | minor patches; no breaking |
| Update `@ai-sdk/react` 3.0.163 → 3.0.177 | minor patches; no breaking |
| Add `@cloudflare/ai-chat@0.6.2` (exact pin) | new dep, not used yet |
| Verify type-check + build + tests + e2e all pass | 108 vitest + 14 Playwright |
| Commit: `chore: bump agents SDK + add @cloudflare/ai-chat 0.6.2` | one commit |

**Acceptance**: nothing functionally changed. Just newer SDK installed.

**Rollback**: trivial — revert the commit.

### Phase 1 — Parallel infrastructure (~1 session)

Goal: new AIChatAgent class lives alongside existing chat module. Feature flag defaults OFF. Both paths work.

| Task | Files |
|---|---|
| Create `src/server/modules/chat/ai-chat-agent.ts` — `ChatAgent extends AIChatAgent<Env>` skeleton with minimal `onChatMessage` (system prompt only, no tools yet, no skills, no MCP) | new |
| Add DO binding to `wrangler.jsonc`: `{ "name": "ChatAgent", "class_name": "ChatAgent" }` + new SQLite class migration tag | wrangler.jsonc, drizzle equivalent |
| Mount `routeAgentRequest` in `src/server/index.ts` Worker fetch handler (before Hono catchall) | server/index.ts |
| Add feature flag `VITE_FEATURE_AICHAT_AGENT=false` to `src/shared/config/features.ts` | features.ts |
| Client: when flag is on, ChatPage uses `useAgentChat({ agent: "ChatAgent" })` from `@cloudflare/ai-chat/react`; when off, existing path | ChatPage.tsx |
| Add WebSocket origin to TRUSTED_ORIGINS if needed | wrangler.jsonc |

**Acceptance**:
- With flag OFF: app behaves identically to before (the new code is dormant).
- With flag ON: a fresh conversation works end-to-end with the bare-minimum agent (text-only echo for testing). No skills, no tools, no MCP yet.
- DO storage created on first message.
- WebSocket connects + persists across reload.

**Rollback**: feature flag → off. New conversations created with flag-on stay accessible (they're in DO storage), just no longer routable through the dormant code path. Trivial recovery: re-enable flag.

**Risks**:
- DO migration tag is irreversible. If the class definition changes incompatibly later, careful migration needed.
- WebSocket path collision if any existing route matches `/agents/*`.

### Phase 2 — Feature mapping (~1 session)

Goal: one-by-one, the existing chat module's features start working in the AIChatAgent path. Feature flag still OFF by default; toggle ON to test each feature.

Each feature is its own commit so progress is granular.

| Feature | Strategy | Complexity |
|---|---|---|
| **System prompt** | Pass `system` to `streamText`. The A1 pattern (`getSystemPrompt(userId)`) plugs in cleanly. | Low |
| **Skills (slash commands + activation)** | Parse user input in `onChatMessage`. Inject skill body into system prompt or as a `system`-role message. Skills already have a clean module-export shape. | Medium |
| **Project context** | Read `projectId` from agent state (set on first message via `@callable()` or initial body). Inject project context into system prompt. | Medium |
| **MCP integration** | `this.mcp.getAITools()` — built-in. Connection list comes from D1 connections table; `this.mcp.addServer()` per active connection on agent init. | Medium |
| **Tool approval** | Per-tool `needsApproval: async (input) => boolean`. Replaces our channels-based approval queue for chat-originated tool calls. (Routine-originated approvals stay on the existing channels system.) | Low |
| **File attachments (text, audio, PDF, images)** | UIMessage parts already support files. Watch for the `inlineDataUrls` workaround if needed (data: URI quirk in AI SDK's downloadAssets step). | Medium |
| **Vision** | Same UIMessage `image` part shape works. Workers AI vision models need `sessionAffinity: this.sessionAffinity` for routing. | Low |
| **Sources footer** | Stored as message metadata. Already preserved through UIMessage. | Low |
| **Tool result rendering** | Same UIMessage parts. Existing client-side renderers should work unchanged. | Low |
| **Message validation against tool schemas** | The SDK validates via Zod input schemas. Our existing validation is approximately a duplicate. | Low |
| **Regenerate / branch / edit** | SDK supports regenerate via `useAgentChat`. Edit + branch are derivative — re-call `saveMessages` with edited list. | Medium |
| **Token usage display** | `streamText` returns usage; surface via UIMessage metadata. | Low |
| **Title summarisation** | Trigger from `onChatResponse` after first turn. Write title to D1 conversations projection (Phase 3). | Low |

**Out of scope for this phase**:
- Cross-conversation features (sidebar, search, export) — those continue to read from D1 in legacy mode. Phase 3 wires the projection so they keep working for new conversations.
- Sub-agent delegation — Phase 4.
- Compact-and-fork (issue #29), history trim (#31), truncation gate (#30) — these depend on history primitives. AIChatAgent has `pruneMessages`, `maxPersistedMessages`, and `messageConcurrency`. Re-evaluate each issue against the new primitives separately.

**Acceptance per feature**: feature works in flag-ON path. Existing flag-OFF path still works. Both are exercised manually + e2e where Playwright covers it.

**Rollback per feature**: feature flag stays off; conversations in flag-ON state still work because DO storage persists; toggle back is trivial.

**Risks**:
- File upload + image handling has the most undocumented SDK surface area. Budget extra time.
- MCP integration may have differences from our current path (we pass `userId` for credential lookup; SDK may need a different shape).

### Phase 3 — D1 write-through projection (~0.5 session)

Goal: every chat turn in the new path writes a projection to D1 so FTS5 search + admin views + cross-conversation analytics keep working without rebuild.

| Task | Files |
|---|---|
| Implement `onChatResponse(result)` in `ChatAgent`. Write conversation row + N message rows to D1 via `ctx.waitUntil`. | ai-chat-agent.ts |
| D1 schema: add `do_conversation_id` column to `conversations` (links the DO instance to the D1 audit row). | drizzle migration |
| Sidebar list query: union conversations from D1 (legacy) + conversations with `do_conversation_id` (new). Both sources show in the user's history. | sidebar query |
| FTS5 search: `messages_fts` continues to work — projection writes feed it. | no change |
| Admin views: read from D1 unchanged. | no change |
| Conversation deletion: deletes both DO storage AND D1 projection. | new endpoint |

**Acceptance**:
- Send a message in flag-ON conversation. Within 1s the conversation appears in sidebar.
- Search the message body via existing FTS5 — it hits.
- Admin view shows the conversation with token usage + model + cost.

**Rollback**: D1 schema change is additive (nullable column). Removing the projection writes is a code revert.

**Risks**:
- Double-write means D1 + DO can drift if writes fail. Mitigation: DO is authoritative; D1 projection is regenerable from DO history if needed.
- Performance: every turn now does an extra D1 write. Measure latency. Should be <50ms via waitUntil so user-visible latency unchanged.

### Phase 4 — Sub-agent delegation via `agentTool()` (~1 session)

Goal: prove the new SDK capability with one concrete delegation. Establish the AutonomousAgent → AIChatAgent adapter pattern.

| Task | Approach |
|---|---|
| Build `AgentToolAdapter` that wraps an existing `AutonomousAgent` so it's callable as an `agentTool`. The adapter extends `AIChatAgent`, takes the wrapped agent class via Props, and delegates `onChatMessage` to the wrapped agent's `runOnce`. | new file: `src/server/lib/agents/agent-tool-adapter.ts` |
| Pick one specialist for the proof-of-concept: `ResearcherAgent` (most likely to benefit from streaming chunks back). | reuse existing class via adapter |
| In `ChatAgent`, expose `tools.research = agentTool(AgentToolAdapter, { ... })`. | ai-chat-agent.ts |
| Test: chat user asks "research X" → ChatAgent calls `research` tool → adapter spawns ResearcherAgent → streams chunks back to chat UI. | manual + e2e |
| Document the pattern in `docs/AGENTS.md` "Streaming sub-agents via agentTool" subsection. | docs |

**Acceptance**:
- One delegation works end-to-end. Chunks stream back to the parent chat.
- Existing `delegate_to_X` inline tools still work for non-research delegation (don't break them).
- Adapter is generic enough to wrap other specialists later.

**Rollback**: agentTool is opt-in per chat tool. Remove the tool from the agent's `tools` map → no delegation, but everything else works.

**Risks**:
- Adapter's `runOnce` → streaming bridge is the most novel code in the migration. May surface edge cases not covered by either AutonomousAgent or AIChatAgent's internal contracts.
- Headless agent-tool turns (per the README) don't have client tools — confirm our specialists don't need browser-side tools.

### Phase 5 — Cutover (~0.5 session)

Goal: feature flag default flips to ON for new conversations. Old conversations continue on legacy path.

| Task |
|---|
| Set `VITE_FEATURE_AICHAT_AGENT=true` as default in `features.ts` |
| Sidebar UX: indicator (subtle) on legacy conversations explaining "this conversation uses the older chat engine". |
| Documentation update in CLAUDE.md "Chat module" section. |
| Re-run full Playwright e2e suite. |
| Real-flavour data battery on a flag-ON conversation. |

**Acceptance**:
- New conversations land on AIChatAgent.
- Old conversations still openable, still streamable via legacy.
- All e2e tests pass.
- 1-week soak before considering Phase 6.

**Rollback**: flip the default back to false. New conversations created during the cutover window stay in DO storage but get the legacy treatment for any future messages — actually that's broken; we'd want the rollback to mean "new conversations route to legacy", which means existing-DO conversations need a way to continue on AIChatAgent indefinitely. **This means rollback after Phase 5 is partial — DO-rooted conversations can't be moved back to D1ChatStorage easily.** Worth scoping a "legacy fallback for DO conversations" path during Phase 5 or accepting that rollback after Phase 5 means "new messages fall back; old chat-agent conversations are forever AIChatAgent-shaped".

### Phase 6 — Decommission (optional, after 4-8 week soak)

Goal: remove `buildChatAgent`, `D1ChatStorage` interface, `createAgentUIStreamResponse` SSE plumbing if nothing else uses them.

Only run this when:
- No new conversations have hit the legacy path in 30 days
- Old conversations are accessible via legacy or soft-migrated
- Team is comfortable with the AIChatAgent path

This phase is optional. The starter pattern philosophy says "disable, don't delete" — so we may keep `buildChatAgent` as a reference implementation forever, even if no chat surface uses it.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SDK breaking change between 0.6.2 → 0.6.x | Medium | Medium | Exact version pin; manual changelog review before bumps |
| File / image upload hits SDK quirks | High | Medium | Budget extra time in Phase 2; copy `inlineDataUrls` workaround proactively |
| MCP integration shape differs from our current | Medium | Low | Read SDK MCP source before Phase 2 starts |
| Adapter pattern leaks abstraction | Medium | Medium | Keep adapter minimal; document the seam |
| D1 projection writes fail silently | Low | Medium | Structured logging on every projection write; alert on consecutive failures |
| Sidebar query union performs poorly at scale | Low | Low | Index `do_conversation_id`; cap rows |
| Phase 5 cutover surfaces a regression on real Jezweb data | Medium | High | 1-week soak with Jez as the canary user; manual re-walk of every chat surface before flipping default |
| Chat agent class definition changes incompatibly post-migration tag | Low | High | Standard Cloudflare DO migration discipline; never remove a class, only deprecate; new tag for breaking shape changes |
| Feature flag complexity (~3 weeks of two paths) | High | Low | Both paths share UIMessage shape — most rendering code unchanged. Tests cover both paths. |

## Testing strategy

### Vitest
- New tests for `ChatAgent` (mock DO storage via vitest-pool-workers). Cover: onChatMessage with system prompt, tool approval gate, MCP integration, projection write to D1.
- Adapter tests: wrap a mock AutonomousAgent, call as agentTool, verify chunk flow.
- D1 projection tests: assert row appears after onChatResponse, assert FTS5 finds it.

### Playwright (extending existing 14 tests)
- Add tests with `VITE_FEATURE_AICHAT_AGENT=true` (set via env in setup).
- Cover the same killer flows as legacy path so we catch regressions.
- One test per Phase 2 feature (system prompt, skills, projects, MCP, files, vision, regenerate).
- One test for resumable streaming (close socket mid-stream, reopen, verify resume).
- One test for multi-device sync (open 2 contexts, send in one, see in the other).
- One test for agentTool delegation (Phase 4).

### Manual
- Real-flavour data battery (apostrophes, accents, RTL, HTML canary, long content, file uploads) re-run against AIChatAgent path before cutover.
- Multi-day soak with Jez as the canary user — flag-ON for personal use only — for 7 days before Phase 5 default flip.

## Rollback plan

| Phase | Rollback | Notes |
|---|---|---|
| 0 | git revert | Trivial |
| 1 | git revert + DO migration tag stays (idempotent) | Class shape stays, just unused |
| 2 | feature flag off | Both paths stay viable |
| 3 | git revert projection code | D1 schema additive change stays |
| 4 | remove agentTool from chat tools map | Adapter code stays for next attempt |
| 5 | flip flag default off (with caveat — see Phase 5 risk) | **Partial rollback only** |
| 6 | git revert | If decommissioned code is needed back |

## Open questions / things I don't know yet

These need answering during implementation, not now. Listing so they're not surprises.

1. **MCP `userId` propagation**: our current chat passes the requesting user's ID into MCP credential lookup. AIChatAgent's `this.mcp` may need a different shape for per-user credential isolation in multi-tenant orgs.

2. **`@callable()` for chat-side actions**: which client-side methods should be `@callable()`? Things like "regenerate this message", "edit this message", "branch from here" — could be `@callable()` instead of HTTP. Decide during Phase 2.

3. **History pruning vs compact-and-fork (issue #29)**: AIChatAgent has `pruneMessages` for token-aware trimming. Our compact-and-fork (issue #29) is a user-driven compaction. Does the SDK obsolete part of #29? Decide during Phase 2.

4. **AdminAgent in the new world**: AdminAgent currently extends AutonomousAgent and runs in admin Spaces. Its dispatch flow (which we just fixed for P2-002) doesn't go through chat. Migration of AdminAgent is **out of scope** for this plan. Stays AutonomousAgent.

5. **Cost of WebSocket vs SSE**: WebSocket connections held open per-conversation — DO billing implications? Cloudflare's DO pricing model accommodates this but worth measuring.

6. **Token counting / cost telemetry**: our current `messages.metadata` has token counts per message. Verify this preserves through SDK persistence. If not, write our own counting in `onChatResponse`.

7. **Search on agent-tool sub-agent runs**: when a research delegation happens, the sub-agent's chunks are part of the parent message tree. Does FTS5 need to project sub-agent content separately? Probably no — the sub-agent's output appears in the parent assistant message.

## Effort + sequencing

| Phase | Estimate | Risk to existing functionality |
|---|---|---|
| 0 — Preparation | 30 min | Very low |
| 1 — Parallel infra | 1 session (4-6 hrs) | Low (flag off) |
| 2 — Feature mapping | 1 session | Low (flag off) |
| 3 — D1 projection | 0.5 session | Low (additive D1 column) |
| 4 — agentTool sub-agents | 1 session | Low (opt-in per tool) |
| 5 — Cutover | 0.5 session + 1-week soak | High (flag default flip) |
| 6 — Decommission | 0.5 session (optional) | Low |

**Total**: 4-5 sessions of focused work + 1-week soak between Phase 5 and 6.

**Sequence dependencies**:
- 0 must precede 1 (SDK installed)
- 1 must precede 2 (skeleton must exist)
- 2 must precede 3 (need real turns to project)
- 3 should precede 5 (cutover needs working sidebar)
- 4 can run parallel with 3 (independent feature)
- 5 must precede 6

**Recommended grouping**:
- Session A: Phase 0 + Phase 1 (~1 session — ship the parallel infra)
- Session B: Phase 2 (most feature work — own session)
- Session C: Phase 3 + Phase 4 (projection + sub-agents — both fit one session if Phase 2 went smoothly)
- Soak: 1 week with flag toggleable per-user
- Session D: Phase 5 cutover

## Decisions awaiting your sign-off

Six decisions, listed at the top under "Decisions to lock". Please confirm or push back on each before I start. The plan as written assumes:

1. ✅ Hybrid (DO + D1 projection)
2. ✅ Exact version pinning
3. ✅ Leave existing conversations on legacy path
4. ✅ Adapter pattern for AutonomousAgent specialists (not full migration)
5. ✅ Mount SDK router alongside Hono (not replace)
6. ✅ Concurrent strategy `"queue"` (default)

Push back on any. The plan reshapes accordingly.

## What I'd want to verify before Phase 1 starts

Before writing any chat code, I'd:
- Read `@cloudflare/ai-chat`'s `react.d.ts` end-to-end (we've only seen `index.d.ts` so far)
- Read `agents/chat` types to understand what the SDK considers public API surface
- Skim `cloudflare/agents-starter` `src/app.tsx` to see canonical client patterns
- Check whether `sessionAffinity` matters for our model selection (we have many providers)
- Verify the `pruneMessages` import path in current `ai@6.0.175`
- Check `routeAgentRequest` behaviour with our existing routes — collision check

If any of those surface a blocker, the plan reshapes before code is written.
