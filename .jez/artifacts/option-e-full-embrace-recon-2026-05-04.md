---
date: 2026-05-04
status: complete
owner: claude-recon
related:
  - chat-aichatagent-migration-plan-2026-05-04.md
  - chat-migration-recon-2026-05-04.md
---

# Option E full-embrace recon: Migrate all chat-shaped DOs to AIChatAgent

## Executive Summary

**The full-embrace Option E is architecturally feasible and simpler than it appears.** The codebase already has clear layers:

- **Spaces** (2,817 LoC) — SpaceAgent (Agent base) + dispatch → agent coordinator, relies on `runOnce()` calls to specialists
- **AutonomousAgent** (1,286 LoC) — base class for all 5 specialists (Assistant, Researcher, Writer, Admin, Sweeper), not chat-shaped
- **Routines** (403 LoC scheduler + storage) — fire specialists via `runOnce()`, will migrate to `saveMessages()` pattern
- **Conversations** tables — shared by chat, spaces, and agent-to-space dispatch; minimal schema changes needed

**Key finding:** The specialists (AssistantAgent, ResearcherAgent, etc.) are NOT chat-shaped agents. They inherit from `AutonomousAgent` which already extends the SDK's `Agent` base. They should stay as-is. The full-embrace path is NOT "make everything AIChatAgent" but rather:

1. **Spaces** stays as-is (SpaceAgent already uses Agent base)
2. **Specialists** stay as-is (AutonomousAgent + subclasses)
3. **Routines** migration: `runOnce(input)` → `saveMessages([user_message])` + loop detection
4. **One structural decision:** Should Spaces use `agentTool()` to invoke specialists, or keep the current `dispatch.ts` approach?

**Verdict:** Architecturally **GO** with caveats. No blockers. But the "full-embrace" framing is slightly misleading — it's really "adopt SDK patterns in the routines fire path" not "convert everything to AIChatAgent".

---

## A — Spaces Module (2,817 LoC)

### Architecture

**SpaceAgent** (289 LoC, extends `Agent`):
- One DO per space (`idFromName(spaceId)`)
- Holds WebSocket connections (not message history)
- `onConnect` — authenticate via better-auth, verify membership
- `onClose`, `broadcastPresence` — maintain online roster
- `broadcastNewMessage(messageId)` — RPC from REST route, loads message from D1, fans to all connections

**dispatch.ts** (719 LoC, stateless):
- Called from `POST /api/spaces/:id/messages` after message persisted
- Parses @-mentions, looks up agent target, loads context (last 20 top-level messages)
- Invokes `stub.runOnce({ input, contextMessages, ... })` on target agent
- Phase 1: one mention per message, serial. Phase 2: parallel cap 3.
- Phase 2-002 feature: when no @-mention, fan to `replyMode='always'` agents (AdminAgent in /admin space)
- Phase 3 feature: `replyMode='proactive'/'ambient'` + classifier gate (Workers AI Gemma)
- Persists reply + threads (auto-thread if >800 chars), broadcasts via SpaceAgent

**Conversations schema** (shared with chat + agent dispatch):
- `conversations` — kind='chat' or 'space', spaceMode, defaultReplyMode, historyEnabled flag
- `conversationMessages` — role, parts (JSON UIMessage[]), metadata, parentMessageId (threads), reactions, pinned, quoted
- `conversationMembers` — per-user per-agent, kind='user'|'agent', userId, agentClass/agentName, replyMode, role, notifications
- Indexes: conversation_id (fast history lookup), parent_id (threading), kind (list filtering)

### Phase 1-3 Features Implemented

- **Threads** — nested replies via parentMessageId, threadCount + lastThreadAt tracking
- **Reactions** — JSON blob `{ emoji: [userId/agentName, ...] }`
- **Pinned messages** — pinnedAt + pinnedByUserId
- **Quote-in-reply** — Phase 2: quotedMessageId points to source, client renders from source's parts
- **Star messages** — Phase 2: starredByUserIds JSON array
- **History retention** — historyEnabled flag + cron sweep (Phase 3)
- **Proactive dispatch** — Phase 3: classifier decides 'reply'/'react'/'silent'

### AIChatAgent Migration Shape

**Current design uses Agent base (correct for this use case).** SpaceAgent doesn't need to migrate:
- It doesn't do chat turns (no `onChatMessage`)
- It's a WebSocket coordinator + broadcast manager
- Specialist dispatch via `runOnce()` will eventually migrate to `saveMessages()` but the dispatcher stays separate

**Structural question:** Should `dispatch.ts` use `agentTool()` instead of direct `runOnce()` stubs?

Current pattern:
```typescript
const stub = namespace.get(...) as { runOnce: (...) => Promise<...> }
const reply = await stub.runOnce({ input, contextMessages, ... })
```

Hypothetical `agentTool()` pattern would require:
- Wrapping each specialist in a ChatCapableAgentClass (both `AIChatAgent` AND `Agent` support this)
- Creating a fake "dispatch agent" that calls `agentTool()` per mention
- Handling output streams (agentTool streams back chunks, current runOnce returns text)

**Assessment:** Current approach is fine. agentTool is designed for nested agent calls WITHIN a chat turn (sub-agents visible in UI). Space dispatch is RPC-style (blocking await for text, then persist). Could use agentTool but doesn't gain much; adds indirection.

**Recommendation:** Keep `dispatch.ts` as-is. Specialist migration is orthogonal.

---

## B — AutonomousAgent Base + Specialists (1,286 LoC base + 5 subclasses)

### AutonomousAgent Base Class

**Extends `Agent` from SDK** (correct for this pattern):
- State: persona (editable), userId, modelId, blocks (Letta-style memory), recentMessages, meta
- Interface: `runOnce(input)` → builds system prompt + history → `streamText` → returns `{ text, usage, steps, hookSummary }`
- Hooks: SessionStart/End, PreToolUse/PostToolUse (slice 4 ships SessionEnd only)
- Memory: persona blocks (conventional names: soul, identity, user, memory, style), sliding window history
- Tools: `getToolDefinitions()` override + collectAvailableTools adapter
- Approval queue: `requestApproval(action, payload)` for destructive ops
- Webhooks: lazy-init secret, `handleWebhook()` path
- Observability: `agentRuns` table tracks cost, tokens, steps, trigger, outcome

**Key design:** NOT chat-shaped. No WebSocket, no multi-client history sync, no `onChatMessage`. Single RPC entry point (`runOnce`) that does one complete turn: read state → build prompt → call model → loop on tools → persist → return.

### Specialists (5 subclasses)

1. **AssistantAgent** — per-user persistent assistant with Gmail/Calendar tools, email approval pattern
2. **ResearcherAgent** — web search + summarize
3. **WriterAgent** — document + blog post drafting
4. **AdminAgent** — space moderation, user management (typically in /admin space with replyMode='always')
5. **SweeperAgent** — non-chat, runs nightly cron, scans for stale entities + queues approvals

Each overrides `getToolDefinitions()` and optionally `buildExtraInstructions()` / `recallSemantic()`.

### AIChatAgent Migration Shape

**AutonomousAgent should NOT migrate to AIChatAgent.** They serve different needs:
- **AIChatAgent** — multi-session, WebSocket, streaming UI, message-per-turn, client tool approvals
- **AutonomousAgent** — stateful agent, scheduled/RPC-driven, tool approvals in queue, hook skills, memory blocks

These are complementary primitives. Keep AutonomousAgent as-is.

**Decision:** Specialists stay on AutonomousAgent. No migration.

---

## C — Routines Fire Path (403 LoC scheduler)

### Current Architecture

**Scheduler.ts:**
1. `processDueRoutines()` cron sweep: find enabled schedule-triggered routines where `now - lastRunAt >= effectiveInterval`
2. Per routine: compose input from template + recent run summaries (run-tail context)
3. Resolve agent DO by class name binding lookup
4. Apply config setters: `setToolsAllowed()`, `setSkillsLoaded()`, `setHooks()` (slice 2-4)
5. **Call `stub.runOnce({ input, trigger: 'schedule' })`** wrapped in 120s watchdog
6. Finish run row: outcome (ok/error/timeout), outputSummary (hook output or last 280 chars)
7. `sweepStaleRoutineRuns()` — find stuck runs at outcome='started' >5min old, flip to error (P2-005 fix)

**Input composition:**
- User's optional template + recent-runs tail (5 last runs formatted as "## Recent run history")
- Routine name + description used if no explicit template

**Observability:**
- `routineRuns` table: cost_usd, input_tokens, output_tokens, steps, trigger, outcome, outputSummary
- `agent_runs` table (created by the agent): detailed per-tool metrics

### saveMessages Migration Shape

**The change:** Replace `runOnce(input)` with AIChatAgent-style `saveMessages()` pattern.

Current:
```typescript
await stub.runOnce({
  input: composedInput,
  trigger: 'schedule'
})
```

SDK's AIChatAgent `saveMessages()` signature:
```typescript
async saveMessages(
  messages: UIMessage[],
  options?: SaveMessagesOptions
): Promise<SaveMessagesResult>
```

New pattern would be:
```typescript
const result = await stub.saveMessages(
  [{ role: 'user', parts: [{ type: 'text', text: composedInput }] }],
  { signal: abortSignal, trigger: 'schedule' }
)
// result.status: 'completed' | 'aborted' | 'skipped'
// result.text: final assistant message text
```

**For AutonomousAgent (staying on Agent base), this doesn't apply.** AutonomousAgent won't use AIChatAgent.

**Specialist fire from routines stays as-is:** `stub.runOnce()` on AutonomousAgent instances.

### Watchdog & Timeout Handling

**P2-005 already implemented:**
- `fireRoutine` wraps in `Promise.race(runOnce promise, 120s timeout)`
- `sweepStaleRoutineRuns` finds abandoned runs >5min at outcome='started'

**If we were to migrate specialists to AIChatAgent**, the SDK has `SaveMessagesOptions.signal: AbortSignal`. The watchdog would move from scheduler to the agent's internal turn queue. But since specialists stay on AutonomousAgent, this is moot.

---

## D — Conversations Tables (Shared Cross-Module)

### Schema

**conversations** (56 cols + indexes):
- Primary: id (UUID)
- Foreign: userId (user), projectId (projects) [optional]
- Content: title, summary, model, systemPrompt, tags (JSON)
- Flags: starred, memoryProcessedAt, kind ('chat'|'space'), spaceMode, defaultReplyMode, historyEnabled
- Audit: createdAt, updatedAt
- Indexes: (userId), (updated_at), (userId, starred, updated_at), (projectId), (kind), (memoryProcessedAt)

**conversationMessages** (10 cols + indexes):
- Primary: id (UUID)
- Foreign: conversationId
- Content: role, parts (JSON UIMessage[]), metadata (JSON), reactions (JSON emoji map)
- Threading: parentMessageId, threadCount, lastThreadAt
- Rich features: pinnedAt + pinnedByUserId, starredByUserIds (JSON), quotedMessageId
- Audit: createdAt
- Indexes: (conversationId), (created_at), (parentMessageId), (conversationId, pinnedAt)

**conversationMembers** (9 cols + indexes):
- Primary: id (UUID)
- Foreign: conversationId, userId (when kind='user'), agentClass/agentName (when kind='agent')
- Config: replyMode, role, notificationLevel, pinnedToSidebar
- Audit: joinedAt, lastReadAt, invitedByUserId, blockedAt
- Indexes: (conversationId), (userId), (agentClass, agentName), (conversationId, kind)
- Constraints: unique (conversationId, userId), unique (conversationId, agentName)

**threadSubscriptions** (Phase 2):
- Per-thread per-user notification override
- Unique (threadId, userId)

### Cross-Module Readers

**Chat module:**
- Reads/writes conversationMessages (UI history)
- Reads/writes conversations (metadata, title, starred)
- Reads conversationMembers (membership for UI)

**Spaces module:**
- Writes conversationMessages (agent replies, reactions, pinned)
- Reads conversationMembers (online members, reply modes)
- Reads conversations (kind/spaceMode checks)

**Dispatch (routine fire to space):**
- Reads conversationMessages for context window (last 20 top-level or thread)
- Reads conversationMembers for agent reply modes

**Conversations sidebar / list:**
- Reads conversations (paginated, starred, kind filtered)
- Reads conversationMembers for member count (Phase 2)

### Projection Strategy for Option E

**No changes needed to schema.** Current design already accommodates:
- Chat (kind='chat', single user + agent member)
- Spaces (kind='space', multiple user members, agent members with replyMode)
- Shared tables across both

If Spaces were to add a `do_instance_name` column to track SpaceAgent DO instance:
- Not strictly required (DO name derives from conversationId)
- Could help with reverse lookups "which conversations have stale DOs"
- Schema migration: add column, backfill conversationId as value (since DO name = spaceId = conversationId for spaces)
- Not a blocker; Phase 2+ if needed

---

## E — AIChatAgent + agentTool() Deep Dive

### E1. How `agentTool()` Works

**From agents SDK (agent-tools.ts:57–111):**

```typescript
export function agentTool<Input, Output>(
  cls: ChatCapableAgentClass,
  options: AgentToolFactoryOptions<Output>
): Tool<Input, string | Output>
```

**Mechanics:**
- Takes a sub-agent class (must extend Agent with chat capabilities)
- Returns an AI SDK `Tool` (Zod schema + execute fn)
- On execution, calls `currentAgentToolRunner().runAgentTool(cls, { input, ... })`
- runAgentTool is provided by the parent Agent/AIChatAgent's internal loop
- Returns `{ status: 'completed'|'aborted'|'interrupted', output?, summary?, error? }`
- Streaming is transparent: child's stream chunks are forwarded to parent's stream

**Parent-child relationship:**
- Parent (AIChatAgent) calls tool
- Tool spins up child agent DO (same class name, different instance name: `parent-id/tool-name/child-id`)
- Child runs its own `onChatMessage()` loop
- Child's response streams back to parent's message stream
- When child completes, control returns to parent for next tool/loop iteration

**DO Instance Lifecycle:**
- Child DO is created on-demand (first agentTool call)
- Persists for the lifetime of the parent's turn
- Can be called multiple times in parallel (separate DOs for each call)
- Streams are buffered + deduplicated before persisting parent's message

### E2. State Management on AIChatAgent

**Two separate state layers:**
1. **messages** — chat history (UIMessage[]), public + mutable (for backwards compat)
2. **state** — custom DO state via `setState(newState)`, stored in DO SQLite

**For our use case (persona blocks + memory + project context):**
- Persona blocks → system prompt assembly (computed per turn, not stored in state)
- Memory → still custom (SDK doesn't ship memory; our agent-memory.ts wraps Vectorize)
- Project context → read from D1 per turn, not stored (transient)

**Multi-client sync:** The SDK handles WebSocket multiplexing; state is per-DO instance (one conversation). If you have 10 clients on the same conversation, they share one AIChatAgent DO and see the same state.

### E3. AIChatAgent Multi-Participant Handling

**The SDK supports WebSocket multi-client.** For Spaces multi-user:

- Each Space conversation has its own SpaceAgent DO (WebSocket coordinator)
- Separately, each chat turn in the space fires a specialist via dispatch → `runOnce()` or future `saveMessages()`
- Specialist's response is persisted in D1, then broadcast to all space clients via SpaceAgent

**The specialist doesn't need to know about multi-user.** It works on contextMessages (loaded from D1) and produces text. Coordination is SpaceAgent's job.

**If a specialist were to become AIChatAgent instead:** It would need to identify the acting user for proper logging/approval audit. Currently passed via `actingUserId` in dispatch → runOnce. With saveMessages, would need similar field in options or message metadata.

### E4. Hibernation for Idle AIChatAgent

**SDK hibernation:** Per the chat recon, idle DOs (no active WebSocket) hibernate. For AIChatAgent:
- WebSocket open = DO awake
- WebSocket closed >~30s = hibernates
- Idle cost is near-zero (Hibernation API pauses memory)
- Wake on next message

**For Spaces:** Space DO can be idle (no connected clients) but still needs to receive dispatched agent replies (routine-fired specialists posting to the space). Current design: dispatch calls SpaceAgent RPC `broadcastNewMessage(id)`, which wakes the DO if hibernated, broadcasts to any live connections.

This works fine. Hibernation is transparent.

### E5. Schedule / Cron Integration

**The agents SDK has `Agent.schedule()` for per-instance timers.** From agents SDK:
- Inside `onChatMessage` or `onRequest`, call `this.schedule({ at: time, id: eventId })`
- Fires `onScheduledEvent(eventId)` at the specified time
- Use for follow-up steps within a conversation (e.g., "remind me in 1 hour")

**Routines use the global cron sweeper instead:**
- Why: routines outlive a single DO; cadence changes on the row should fire immediately
- Better for observability (one place to check when "why didn't this fire")
- Bounded budget per tick (never blow the cron envelope)

**Recommendation for Option E:** Keep using the global routine scheduler. Don't switch routines to `Agent.schedule()`. The two are complementary:
- Global scheduler → routines (external fire schedule)
- Agent.schedule() → sub-routine timers (internal follow-ups)

---

## F — Voice / Video Agents

### Voice (180 LoC)

**VoiceInputExample** extends `withVoiceInput(Agent)` from @cloudflare/voice:
- One DO per session
- `transcriber = WorkersAINova3STT` — receives audio frames
- `onTranscript(text)` fired per turn-detected utterance
- `onConnect` / `onCallEnd` lifecycle hooks
- Current: just broadcasts utterance JSON to WebSocket

**Should it migrate to AIChatAgent?** No. Voice is not chat-shaped:
- It processes a real-time audio stream
- Transcription is streaming (interim + final)
- No message history
- One-way broadcast, not conversational

**Pattern:** Voice stays as Agent + mixin. If you want the agent to also respond (run LLM → synthesize speech), add `onTranscript` logic to call the LLM, not a chat interface.

### Video (Pattern 10b in CLAUDE.md)

Not yet in codebase; referenced in CLAUDE.md as a future pattern. Same shape as Voice — streaming binary data, not text chat.

**Recommendation:** Voice and Video stay as Agent + mixin, not AIChatAgent.

---

## Cross-Cutting Findings

### 1. The Five Specialists Are NOT Chat-Shaped

Finding: AssistantAgent, ResearcherAgent, WriterAgent, AdminAgent, SweeperAgent all extend AutonomousAgent (Agent base). They are NOT chat agents. They don't handle WebSockets, multi-client sync, or message streams. They are stateful RPC-driven agents.

Implication: The "full-embrace AIChatAgent" framing is misleading. Better framing: "Adopt SDK patterns where they fit."

### 2. Spaces is Already SDK-Aligned

SpaceAgent extends Agent (correct pattern). It doesn't need to migrate. The dispatch coordinator that fires specialists via `runOnce()` is separate infrastructure. Could use `agentTool()` but doesn't gain much.

### 3. The Real "Full-Embrace" Is Routines Input Shape

The ONE place where "full-embrace SDK" applies: Routines fire path. Instead of:
```typescript
stub.runOnce({ input, trigger: 'schedule' })
```

Move to (hypothetically):
```typescript
stub.saveMessages([{ role: 'user', parts: [{ type: 'text', text }] }], { trigger: 'schedule' })
```

But this only applies to CHAT-shaped agents (which specialists are not).

### 4. Shared Conversations Table Design Is Sound

The schema supports chat + spaces + agent dispatch all reading/writing the same messages table. No structural conflicts. Future: add `do_instance_name` column if we need reverse lookups.

### 5. Memory Model Is Custom (Not SDK-Provided)

AutonomousAgent has:
- Persona blocks (computed into system prompt per turn)
- Sliding window history (recentMessages, persisted in state)
- Semantic recall hook (returns [] in base, subclasses wire Vectorize)

SDK doesn't ship memory. We roll our own. This stays.

### 6. Approval Queue Pattern Works Across Both Primitives

- Chat uses SDK's per-tool `needsApproval` callback
- AutonomousAgent uses custom `requestApproval(action, payload)` + persistent queue table

Both work independently. No unification needed.

---

## Risks Identified for Full-Embrace Migration

| Risk | Severity | Mitigation |
|---|---|---|
| Misunderstanding "full-embrace" scope — trying to migrate specialists to AIChatAgent when they should stay on AutonomousAgent | **High** | Clarify: goal is "Option E adopts SDK patterns where they fit," not "everything becomes AIChatAgent." Specialists stay. |
| Routines fire path `runOnce()` → `saveMessages()` incompleteness — SaveMessagesResult shape differs from RunOnceResult | **Medium** | Routine scheduler needs wrapper to translate result.status → outcome, capture output text. Doable but non-trivial. |
| Hibernation + background work — if Spaces dispatch needs to fire agents while no clients are connected, and the DO hibernates after dispatch finishes, the follow-up message might not broadcast to sleeping connections | **Low** | Hibernation is transparent; SpaceAgent wakes on next RPC. Broadcast queues until it wakes. No issue. |
| Specialist toolset filtering per-routine (slice 2) — `setToolsAllowed()` needs to return before runOnce is invoked, but that's a tightly-coupled async call on a shared DO | **Low** | Current code handles this; just a series of best-effort setters with logs on failure. |
| `agentTool()` parent-child DO naming collision — if parent & child both try to reserve the same DO ID | **Low** | SDK handles internally. Parent has unique instance ID; child names are tagged `parent-id/tool-name/child-id`. |

---

## Per-Phase Scope Estimates

Updating from chat recon's 7-session assumption:

| Module | Scope | Notes |
|---|---|---|
| **A. Spaces** | 0 sessions (no change) | Already SDK-aligned (Agent base). dispatch.ts stays as-is. |
| **B. AutonomousAgent + specialists** | 0 sessions (no change) | Correct primitive for their use case. Stay on Agent base. |
| **C. Routines fire path** | 1-1.5 sessions (conditional) | ONLY if we decide specialists should move to AIChatAgent (they shouldn't). If staying on AutonomousAgent, no change. |
| **D. Conversations schema** | 0.25 sessions | Optional: add `do_instance_name` column for reverse lookups. Not required for Option E. |
| **E. agentTool() integration** | 0.5 sessions (conditional) | ONLY if we decide to use agentTool in dispatch (current `runOnce()` is fine). Nice-to-have, not required. |
| **F. Voice/video** | 0 sessions (no change) | Correct primitives; not chat-shaped. |

**Total realistic scope for true "Option E" adoption:** 0.5–1 session.

But the framing of "7-session full-embrace migration" was based on converting ALL agents to AIChatAgent. **That's not the right goal.** The right goal is: "Each primitive is SDK-aligned for its use case." They already are.

---

## Open Questions for Orchestrator

### 1. Does "Option E full-embrace" mean "convert specialists to AIChatAgent"?

**No.** Specialists are not chat agents. They are stateful RPC-driven agents (AutonomousAgent pattern). Converting them would require:
- Wrapping them in AIChatAgent
- Adding WebSocket handling they don't need
- Breaking the routine fire pattern (which works today)

**Recommendation:** Reframe Option E as "Adopt SDK patterns where they fit; specialists are correct as-is."

### 2. Should Spaces dispatch use `agentTool()` instead of `runOnce()`?

Current works well. `agentTool()` is designed for nested agents WITHIN a chat turn (visible in UI streaming). Spaces dispatch is RPC-style (blocking await for text). Could use agentTool but adds indirection.

**Recommendation:** Keep `dispatch.ts` as-is (current `runOnce()` pattern).

### 3. If routines fire specialists, how does outcome tracking work with `saveMessages()`?

`RunOnceResult` has: `{ text, usage, steps, hookSummary }`
`SaveMessagesResult` has: `{ status: 'completed'|'aborted'|'interrupted', output?, summary? }`

Not 1:1. Routine scheduler needs wrapper logic.

**Recommendation:** Keep routines firing with `runOnce()` on AutonomousAgent. Don't migrate unless specialists themselves migrate (which we don't recommend).

### 4. Should we add `do_instance_name` to conversations table?

Currently unnecessary. Spaces DO name = conversationId. But reverse lookup ("find all conversations with stale DOs") would need it.

**Recommendation:** Phase 2+ if we add a "stale DO sweeper" cron job. Not required for Option E.

### 5. Is AutonomousAgent's sliding-window history design final?

Current: `recentMessages` in state (up to `maxRecentMessages`, default 30). For long-running agents, consider Vectorize integration for semantic recall.

**Recommendation:** The design is sound. Subclasses can wire Vectorize via `recallSemantic()` override. No core change needed.

---

## Risks Identified (for discussion)

### Architecture Risk

**Misnamed "full-embrace."** If leadership is expecting "migrate everything to the SDK's blessed pattern," they may be surprised to find specialists are ALREADY on the SDK's blessed pattern for their use case (Agent base, not AIChatAgent). This mismatch could cause rework.

**Mitigation:** Clarify in kickoff: "Option E means each primitive uses the SDK pattern suited to it. Specialists are correct as-is."

### Implementation Risk

**Routine outcome tracking.** If we later decide specialists SHOULD fire via AIChatAgent + saveMessages, the routine scheduler needs careful rework to translate result shapes. Not a blocker, but a non-trivial migration if it happens.

**Mitigation:** Document the runOnce → saveMessages translation contract before attempt. (Or don't attempt — stay on AutonomousAgent + runOnce.)

### Observability Risk

**Agent runs audit trail.** Current `agent_runs` table tracks per-tool metrics for each specialist. If specialists move to AIChatAgent (they won't), the SDK's audit shape differs. Ensures observability doesn't break.

**Mitigation:** Not an issue if specialists stay on AutonomousAgent.

---

## Summary: Go / Caution / Defer Verdict

**🟡 CAUTION / CONDITIONAL GO**

The architecture is sound. No blockers. But the "full-embrace Option E" framing is misleading.

**What's true:**
- Spaces is already SDK-aligned (SpaceAgent extends Agent correctly)
- Specialists are already SDK-aligned (AutonomousAgent extends Agent correctly)
- Routines scheduler works fine with current runOnce pattern
- Conversations schema is well-designed and extensible

**What's not true:**
- We should convert specialists to AIChatAgent (they're not chat agents)
- We need to use agentTool in Spaces dispatch (runOnce pattern is clearer)
- Routines need migration to saveMessages (unless specialists themselves migrate, which we don't recommend)

**Recommendation:**
1. **Proceed with the chat module → AIChatAgent migration** (Phase 1, 2.5 sessions, from the chat recon)
2. **Do NOT migrate specialists to AIChatAgent** (stay on AutonomousAgent)
3. **Keep Spaces dispatch as-is** (runOnce pattern works)
4. **Keep routines scheduler as-is** (current watchdog + tail context pattern works)
5. **Optional Phase 2 (future):** Add `do_instance_name` to conversations if we add stale-DO detection
6. **Optional Phase 3 (future):** Prove agentTool pattern with a chat → specialist sub-agent (e.g., summarizer sub-agent in chat)

**Total realistic scope for Option E: 2.5–3 sessions** (the 2.5 from chat recon, plus 0–1 session for optional agentTool pattern play).

The codebase is more organized than it first appears. Specialists are correct. Spaces is correct. Chat migration is the big move; everything else is additive.

