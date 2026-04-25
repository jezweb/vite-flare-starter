# Agent architecture

The starter ships **four kinds of agent**, all built on Cloudflare's
`agents` SDK. Pick the right base for what you're building — they're
not interchangeable.

```
Agent (from agents SDK)              ← all stateful long-lived things
│
├── LiveAgent (via withVoiceInput)   ← live WebSocket session (Voice / Video)
│
├── ReminderAgent                    ← scheduled task using SDK schedule()
│   (extends Agent directly)
│
├── AIChatAgent (SDK class)          ← multi-session chat surface
│   (NOT yet adopted by chat module — see the deferred Phase 0b refactor)
│
└── AutonomousAgent                  ← stateful AI with persona + memory + tools
    (in this starter)
    └── AssistantAgent               ← worked example: per-user persistent assistant
```

## Decision matrix

| If you need... | Use... | Worked example |
|---|---|---|
| Live mic / camera / WebSocket session per user | `Agent` + `withVoiceInput` (or `withVideoInput`) mixin | `VoiceInputExample`, `VideoInputExample` |
| Scheduled fire (one-shot or recurring) for non-AI work | `Agent` directly + `this.schedule()` / `this.scheduleEvery()` | `ReminderAgent` |
| Stateful AI assistant with persona + memory + tools | `AutonomousAgent` | `AssistantAgent` |
| Multi-session AI chat with state-sync to clients | `AIChatAgent` from `agents/chat` (SDK) | _not yet adopted; see chat module refactor TODO_ |
| Long-running multi-step business logic with checkpointing | Cloudflare Workflows + `AgentWorkflow` from `agents/workflows` | _not yet shipped_ |
| High-throughput async fan-out | Cloudflare Queues | _not yet shipped_ |
| Single account-wide cron | `wrangler.jsonc` `triggers.crons` | the `*/15 * * * *` healthcheck |

**Don't reach for raw `DurableObject`.** Every long-lived stateful thing
in this starter extends `Agent` from the SDK so we get state sync,
schedule/queue/retry, hibernation, RPC, MCP client, and observability
without re-implementing them. The one time we hand-rolled this
(commit 759207a, deleted in f8d646f) we re-invented every wheel and
shipped −332 net lines of code by deleting the work.

## AutonomousAgent — the AI agent base

`src/server/lib/agents/autonomous-agent.ts`

A subclass-and-go base for "AI entity with identity, memory, tools, and
autonomous triggers." Everything below this line is what subclasses get
for free.

### State shape

```typescript
interface AutonomousAgentState {
  name: string                       // friendly identity
  persona: string                    // system prompt
  userId: string | null              // owner — set once via setOwner()
  modelId: string                    // catalogue model id
  blocks: Record<string, string>     // Letta-style named context blocks
  recentMessages: UIMessage[]        // sliding window of conversation
  meta: { invocations, lastActiveAt, createdAt }
}
```

### Memory model

- **Persona** — the system prompt. Settable via `setPersona()`.
- **Blocks** — Letta-style named key/value sections, always rendered
  into the system prompt under their label. Use for compact long-term
  facts the model should always have in context (user profile, current
  goals, ongoing task notes). Every block costs input tokens on every
  turn — keep them small.
- **Episodic** — recent UIMessage history persisted in agent state,
  sliding-window capped at `maxRecentMessages` (default 30). The agent
  picks up where it left off on the next invocation.
- **Semantic** — NOT in the base. Wire Cloudflare's `AgentMemory`
  service in subclasses that need vector recall over long-term
  conversation history.

### Decision loop

```typescript
const result = await agent.runOnce({
  input: 'What's on my calendar tomorrow?',
  model: 'anthropic/claude-sonnet-4.6',  // optional override
  maxSteps: 5,                           // tool-call cap
})
// → { text, usage: {inputTokens, outputTokens}, steps }
```

Builds: system prompt (persona + blocks + extras) + history + new user
turn → `streamText` with the agent's tool catalog → persists assistant
response into history (sliding window).

### Subclass extension points

```typescript
export class MyAssistant extends AutonomousAgent<Env, AutonomousAgentState> {
  static override readonly className = 'MyAssistant'

  initialState = {
    ...AutonomousAgent.defaultInitialState(),
    persona: 'You are a research helper for...',
    modelId: 'anthropic/claude-sonnet-4.6',
  }

  // Tool catalog. Default is []. Reuse the chat module's tool
  // definitions or define inline.
  protected override async getToolDefinitions() {
    const { coreDefinitions } = await import('@/server/modules/chat/tools/core')
    return [...coreDefinitions]
  }

  // Inject dynamic context into the system prompt every turn
  // (e.g. current date, unread email count, today's calendar).
  protected override async buildExtraInstructions() {
    return `Current date: ${new Date().toISOString()}`
  }
}
```

### Triggers

Pick whichever fits the call pattern:

| Trigger | How |
|---|---|
| Direct REST | `getAgentByName(env.MyAgent, partition).runOnce({ input })` |
| Scheduled | `agent.scheduleSelfRun(fireAt, { input })` — one-shot |
| Recurring | use SDK's `agent.scheduleEvery(intervalSeconds, 'runScheduled', input)` directly |
| Inbound email | override `_onEmail` (SDK built-in) |
| Inter-agent message | call another agent's stub via `getAgentByName`; for hierarchies, use SDK sub-agent routing |
| WebSocket | not in the base — extend `AIChatAgent` if you need streaming-to-client |

### Per-(user, slug) partitioning

The convention across the starter is `${userId}:${slug}` as the
`getAgentByName` key. Each user can hold many named agents
(`morning-brief`, `research`, `support-bot`); the slug is the
namespace. `setOwner(userId)` is called on first interaction and
throws if a different userId tries to use the same partition — DO ids
are unguessable but defence in depth.

### What it doesn't do

- **Streaming to clients** — `runOnce` accumulates the full response
  before returning. For chat UIs needing token-by-token streaming,
  extend `AIChatAgent` from the SDK instead.
- **Multi-agent orchestration** — the primitives are here (sub-agent
  routing, RPC stubs, queues) but the handoff API isn't. Build a real
  product use case first to learn what the ergonomics should be.
- **Vector memory** — the sliding window is good for short-term
  context. Long conversations want `AgentMemory`; wire it in your
  subclass when you need it.

## ReminderAgent — non-AI scheduled work

`src/server/modules/scheduled-agents/reminder-agent.ts`

Pattern for "fire at time X" / "fire every N minutes" work that
doesn't involve an LLM. Direct use of the SDK's `schedule()` /
`scheduleEvery()` / `retry()` primitives — no AI machinery.

When NOT to use AutonomousAgent for scheduled work: when there's no
LLM involvement. A reminder, a sync, a cleanup, a heartbeat — these
are simpler as `extends Agent` directly.

```typescript
import { Agent } from 'agents'

export class ReminderAgent extends Agent<Env, ReminderState> {
  async scheduleReminder(when: number, payload: ReminderPayload) {
    const schedule = await this.schedule(when, 'fireReminder', payload, {
      retry: { maxAttempts: 4, baseDelayMs: 10_000 },
    })
    return { scheduleId: schedule.id }
  }

  // Alarm callback — SDK invokes by method name.
  async fireReminder(payload: ReminderPayload) {
    // Do the work. Throw to retry. Return value persists in
    // observability events.
  }
}
```

## Routes pattern

REST surface for talking to agents from Hono:

```typescript
import { getAgentByName } from 'agents'

const agent = await getAgentByName(env.MyAgent, `${userId}:${slug}`)
const result = await agent.runOnce({ input })  // typed RPC stub
```

`getAgentByName` returns a typed RPC stub. Methods on the agent class
are callable directly (server-to-server RPC). For client-side
WebSocket access (`useAgent` hook in browser), methods need the SDK's
`@callable` decorator — currently NOT used in this starter because
workerd doesn't yet accept stage-3 decorator syntax in worker bundles.
Forks needing browser-side agent calls can add a Vite plugin to lower
the syntax.

## Observability

The SDK emits structured events on schedule lifecycle (created /
fired / retried / failed) into Workers Logs. No parallel D1 audit
table — the SDK is the single source of truth. Forks that want
permanent SQL audit can subscribe to the SDK's observability event
stream and write to their own table.

For pending schedules: query via `agent.getSchedules({type, timeRange})`
over RPC. For execution history: filter Workers Logs by the agent
class name in the structured payload.

## Naming conventions

| Convention | Reason |
|---|---|
| Class names end in `Agent` | Matches SDK convention (`AIChatAgent`, `McpAgent`, `InputAgent`) |
| `static readonly className = 'X'` on every subclass | Constructor names get mangled by minifiers; explicit name surfaces in observability |
| Partition key: `${userId}:${slug}` | Per-user scoping; slug lets one user hold multiple named agents |
| Tool definitions: existing `ToolDefinition` contract | Same telemetry, truncation gate, approval flow as chat tools |

## Future extensions (not yet shipped)

- **Phase 0b** — refactor chat module onto `AIChatAgent` for state
  sync + sub-agent routing
- **AgentMemory** wiring for vector recall over long history
- **AgentWorkflow** worked example for long pipelines
- **A2A** endpoint adapter when the spec stabilises further
- **`McpAgent`** worked example (your agent as an MCP server)
- **Multi-agent handoff** — researcher + writer pattern via sub-agent
  routing, designed against a real product use case

## References

- Cloudflare agents SDK: <https://developers.cloudflare.com/agents/>
- AgentMemory: <https://blog.cloudflare.com/introducing-agent-memory/>
- AI SDK v6: <https://ai-sdk.dev/docs/agents/overview>
- Letta block memory pattern: <https://www.letta.com/blog/agent-memory>
- A2A protocol: <https://github.com/a2a-protocol>
