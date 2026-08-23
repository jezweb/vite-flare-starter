# Agent architecture

The starter ships **four kinds of agent**, all built on Cloudflare's
`agents` SDK. Pick the right base for what you're building — they're
not interchangeable.

> **Building "an agent that watches X periodically and surfaces findings"?**
> Don't subclass `AutonomousAgent` for it. Use a **Routine** —
> declarative config (agent + schedule + tools allow-list + skills +
> hooks) on top of an existing `AutonomousAgent`. See
> [`ROUTINES.md`](./ROUTINES.md) for the canonical pattern. Issue #50
> decision F: Routines is the user-facing pattern; `scheduled-agents`
> and `webhook-agents` stay as the lower-level primitives.

```
Agent (from agents SDK)              ← all stateful long-lived things
│
├── LiveAgent (via withVoiceInput)   ← live WebSocket session (Voice / Video)
│
├── ReminderAgent                    ← scheduled task using SDK schedule()
│   (extends Agent directly)
│
├── AIChatAgent (SDK class)          ← multi-session chat surface
│   └── ChatAgent                    ← worked: the chat module (shipped, #34)
│
├── AutonomousAgent                  ← stateful AI with persona + memory + tools
│   (in this starter)
│   ├── AssistantAgent               ← worked: per-user persistent assistant
│   ├── ResearcherAgent              ← worked: web_search + delegate_to_writer
│   └── WriterAgent                  ← worked: prose composer (handoff target)
│
└── McpAgent (SDK class)             ← agent exposed AS an MCP server
    └── ScratchpadMcpAgent           ← worked: per-user scratchpad over MCP
```

## Decision matrix

| If you need... | Use... | Worked example |
|---|---|---|
| Live mic / camera / WebSocket session per user | `Agent` + `withVoiceInput` (or `withVideoInput`) mixin | `VoiceInputExample`, `VideoInputExample` |
| Scheduled fire (one-shot or recurring) for non-AI work | `Agent` directly + `this.schedule()` / `this.scheduleEvery()` | `ReminderAgent` |
| Stateful AI assistant with persona + memory + tools | `AutonomousAgent` | `AssistantAgent` |
| Multi-agent handoff (specialist agents call each other) | `AutonomousAgent` + `delegate_to_X` tool on `this.runAgentTool` (awaited or detached facet child) | `ResearcherAgent` → `WriterAgent` |
| Expose agent's data over MCP for external clients | `McpAgent` from `agents/mcp` (SDK) + `McpServer` from `@modelcontextprotocol/sdk` | `ScratchpadMcpAgent` |
| Multi-session AI chat with state-sync to clients | `AIChatAgent` from `agents/chat` (SDK) | `ChatAgent` in `src/server/modules/chat/chat-agent.ts` (shipped — closed issue #34) |
| Long-running multi-step business logic with checkpointing | Cloudflare Workflows + `AgentWorkflow` from `agents/workflows` | _not yet shipped_ |
| High-throughput async fan-out | Cloudflare Queues | _not yet shipped_ |
| Single account-wide cron | `wrangler.jsonc` `triggers.crons` | the `*/15 * * * *` healthcheck |
| **Task-running agent where Anthropic owns the loop** | [`cloudflare/claude-managed-agents`](https://github.com/cloudflare/claude-managed-agents) template | — (separate repo, not this starter) |

**Don't reach for raw `DurableObject`.** Every long-lived stateful thing
in this starter extends `Agent` from the SDK so we get state sync,
schedule/queue/retry, hibernation, RPC, MCP client, and observability
without re-implementing them. The one time we hand-rolled this
(commit 759207a, deleted in f8d646f) we re-invented every wheel and
shipped −332 net lines of code by deleting the work.

### vite-flare-starter vs Claude Managed Agents

[Cloudflare announced Claude Managed Agents](https://blog.cloudflare.com/claude-managed-agents/)
in May 2026 — a deployment pattern where **Anthropic hosts the agent
loop** (model + reasoning + tool-call orchestration) and **Cloudflare
hosts the sandbox + tools**. It's not a competitor to this starter;
it's an *alternative deployment shape* for a different product
shape. The two are complementary.

| | vite-flare-starter | Claude Managed Agents |
|---|---|---|
| Agent loop | Self-hosted (`AutonomousAgent` + AI SDK v6) | Anthropic-managed |
| Tools | `ToolDefinition` in `src/server/modules/chat/tools/` | `defineTool({ name, inputSchema, run })` in `custom-tools.js` |
| Sandbox | `@cloudflare/sandbox` already bound | Same primitive |
| Persistence | DO storage + D1 projection + R2 | Anthropic-managed state |
| Multi-tenancy | Per-(user, conv) DO instance | Anthropic-managed |
| MCP | Native — agent inherits user's MCP tools | Via custom tools |
| Customisation ceiling | Full (we own the loop) | Constrained to template + custom tools |
| **Pick when** | Building a SaaS product (chat UX, projects, orgs, voice, skills, memories) | Building a task-running agent fast ("hey Claude, do X") |

Their tool shape `defineTool({ name, inputSchema: z.object(...), run })`
is nearly identical to our `ToolDefinition` contract — independent
convergence on the same primitive is good validation. If you ever need
to expose this starter's tools to a managed agent, the adapter is
~20 lines (map `ToolDefinition.execute` → `defineTool.run`).

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
  turn — keep them small. **See "Persona conventions" below for the
  reserved block names.**
- **Episodic** — recent UIMessage history persisted in agent state,
  sliding-window capped at `maxRecentMessages` (default 30). The agent
  picks up where it left off on the next invocation.
- **Semantic** — extension hook (`recallSemantic(input)`) on the
  base; default returns `[]`. Override in subclasses to inject
  long-term memory snippets that get rendered as a `## Relevant
  memory` block in the system prompt for that turn only (NOT
  persisted to state.blocks).

  Three wiring options:

  | Option | Status (Apr 2026) | When to pick it |
  |---|---|---|
  | **Cloudflare AgentMemory** (`env.MEMORY.recall(...)`) | Private beta — waitlist only | The SDK-blessed long-term path once GA |
  | **Vectorize directly** | Generally available | Want full control; OK with embedding via Workers AI |
  | **D1 FTS5** | Already in starter (conversations search) | Cheaper, keyword recall over precise phrases |

  Worked example with Vectorize:

  ```typescript
  protected override async recallSemantic(input: string): Promise<string[]> {
    if (!this.env.MEMORY_INDEX) return []
    const embeddings = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: input })
    const matches = await this.env.MEMORY_INDEX.query(embeddings.data[0], {
      topK: 5,
      filter: { ownerKey: `${this.state.userId}:${this.state.name}` },
    })
    return matches.matches
      .filter((m) => m.score > 0.7)
      .map((m) => String(m.metadata?.text ?? ''))
      .filter(Boolean)
  }
  ```

### Persona conventions

Five conventional `state.blocks` names render in stable order with
semantic headings, before any user-defined blocks. Adopted from
[goanna's](https://github.com/jezweb/goanna) file family
(SOUL.md / IDENTITY.md / USER.md / MEMORY.md / STYLE.md) so an agent
written for either system maps cleanly onto the other.

| Block | Purpose | Auto-seeded? |
|---|---|---|
| `soul` | Personality, values, vibe — system-prompt warm | No (user-owned) |
| `identity` | Name, role, what-this-agent-is | Yes — from `static metadata` on first `setOwner()` |
| `user` | Capped distillation of the steering human (5-10 lines) | No |
| `memory` | Warm cache of curated essentials (soft cap ~2KB) | No |
| `style` | Voice, tone, formatting preferences | No |

Render order in the system prompt:

```
state.persona
## Soul        (if blocks.soul set)
## Identity    (if blocks.identity set)
## User        (if blocks.user set)
## Memory      (if blocks.memory set)
## Style       (if blocks.style set)
## Context blocks
### <other-block-name>      (any non-conventional blocks, alphabetical)
<buildExtraInstructions output — skills + dynamic context>
## Relevant memory          (semantic recall snippets, this turn only)
```

Empty blocks are skipped. Non-conventional block names continue to
render under `## Context blocks` alphabetically — fork-users with
custom names keep their existing behaviour.

```typescript
// Set conventional blocks
await agent.setBlock('soul', 'Warm, direct, Australian English. No em dashes.')
await agent.setBlock('user', 'Jez — solo founder building Jezweb. Prefers terse responses.')
await agent.setBlock('memory', 'Active project: vite-flare-starter v2.4. Goanna interop in flight.')
```

The `identity` block is auto-seeded from the agent's `static metadata`
on first `setOwner()` call — `displayName + description + userPurpose`
become the initial value. Override any time with `setBlock('identity', ...)`.

`soul` is intentionally NOT auto-seeded. Voice + values are user-owned;
the platform doesn't impose a personality. Goanna's `boss/SOUL.md` is
the reference shape — short paragraphs about how the agent talks, what
it cares about, what it refuses.

### Compaction guard — what survives context loss

Long-running autonomous agents lose conversation history when the chat
DO trims (see `src/server/lib/ai/trim-history.ts`) or when a fork's
session crosses model context limits. The persona blocks ARE the
compaction guard — anything inside them re-renders into the system
prompt every turn, so it survives any history trim.

Use this checklist when a routine fires (or before manually compacting
state) to decide what should live in blocks vs ephemeral history:

| Belongs in a block | Belongs in history (OK to lose) |
|---|---|
| Active goals / commitments the agent owes the user | The discussion that produced the goal |
| Critical user decisions the agent made *because of* the user | Pleasantries, "ok cool" exchanges |
| The current `Next` breadcrumb (one line: "Next step: …") | Tool-call traces — they're audit data, not state |
| Persona, voice, formatting constraints | Streaming chunks, partial drafts |
| Stable domain facts (style guide, glossary, project conventions) | One-off Q&A the agent already answered |

Recommended block hygiene — write these as part of `reflect` skill or
the agent's own `setBlock` calls:

- **`memory.next`** — single line: "Next: review the 3 PDFs Jez
  uploaded; deliver summary by Friday." Updated at end of each
  productive turn.
- **`memory.in_flight`** — bullet list of in-progress tasks. Append on
  start, strike on completion, prune ≥14 days old.
- **`memory.user_asks`** — open questions OWED TO the user, with dates.
  Adapted from goanna's `asks.md` pattern. Promote to closed when
  answered.
- **`user`** — capped distillation (5-10 lines) of the steering human.
  Re-derived ~weekly from conversation, not constantly bloated.

What NOT to put in blocks:
- The full conversation transcript (that's what history is for)
- Raw tool outputs (they bloat — store in DB / R2 and reference by id)
- Anything you can re-derive cheaply from D1 in `recallSemantic`

The principle: blocks are the agent's working memory; semantic recall
(Vectorize) is its long-term memory; history is its short-term memory.
Compaction loses short-term — make sure working + long-term capture
the state you can't afford to lose.

### Domain-scoped system prompts

`buildChatAgent({ env, userId, systemPrompt })` already accepts a
caller-supplied system prompt — use it. Don't inline the prompt at the
chat-route level; author it in the domain module that owns the
behaviour and import.

```typescript
// src/server/modules/<domain>/lib/system-prompt.ts
export const DOMAIN_SYSTEM_PROMPT = `You are <product> — <one-line role>.

## Formatting Constraints (MANDATORY)

These rules apply to every response, including chat replies, tool
outputs, and email drafts. They are not negotiable.

1. No em dashes anywhere. Use commas, full stops, or line breaks.
2. Dates as "Day Month" (e.g. "12 May"). Australian English.
3. Sign off every email with "<owner full name>". Never "the team".
4. No marketing fluff: no "I hope this finds you well".

## Domain context
...
`
```

Pass it at the route level:

```typescript
import { DOMAIN_SYSTEM_PROMPT } from '@/server/modules/<domain>/lib/system-prompt'

const { agent } = await buildChatAgent({
  env: c.env,
  userId,
  systemPrompt: DOMAIN_SYSTEM_PROMPT,
})
```

**Why a module instead of inline strings:** mandatory client-specific
rules (formatting, sign-offs, AU English) survive skill changes when
they live in the system prompt's "MANDATORY" section, not scattered
across skills. Skills are too soft to reliably override default LLM
habits — em dashes are the canonical example. See
`~/.claude/rules/llm-prompting-worked-examples.md` for the lesson.

**Multi-tenant adaptation:** export `getSystemPrompt(tenantId)`
instead of a constant. Resolve tenant-scoped guardrails, then pass
the result the same way:

```typescript
const systemPrompt = await getSystemPrompt(tenantId)
const { agent } = await buildChatAgent({ env, userId, systemPrompt })
```

Worked example: rightcover's
`src/server/modules/insurance/lib/system-prompt.ts` (private repo,
Jezweb-internal) ships an 80-line module with identity, mandatory
formatting rules, domain context, and guardrails. Skills like
`renewal-review-home` add per-task detail on top.

### Decision loop

```typescript
const result = await agent.runOnce({
  input: 'What's on my calendar tomorrow?',
  model: 'anthropic/claude-sonnet-5',  // optional override
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
    modelId: 'anthropic/claude-sonnet-5',
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
- **Complex orchestration graphs** — the handoff API is here
  (`runAgentTool` awaited/detached, see the worked example below), but
  there's no DAG/planner layer. Build a real product use case first to
  learn what the ergonomics should be.
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

## Multi-agent handoff (worked example — `runAgentTool`)

The agents-as-tools pattern, where the LLM decides when to hand off by
calling a tool that dispatches another agent. Since adoption step 5
(#113) this runs on the agents SDK's native **`runAgentTool`**: the
child runs as a **facet sub-agent** — a child Durable Object spawned
inside the parent, named by the runId, with its own isolated SQLite.

**Files**: `src/server/modules/autonomous-agents/researcher-agent.ts`
+ `writer-agent.ts`. Route: `POST /api/autonomous-agents/researcher/:slug { topic }`.

Flow:
1. ResearcherAgent's LLM uses `web_search` to gather facts
2. When it has enough material, the LLM calls `delegate_to_writer`
   with notes + brief
3. The tool calls `this.runAgentTool(WriterAgent, ...)` in one of two
   delivery modes the model chooses between:
   - **awaited** (default): blocks until the writer facet completes,
     returns the text inline — with real interruption semantics
     (`retryable`, `childStillRunning`) instead of an opaque RPC error
   - **`background: true`**: detached dispatch — the researcher's turn
     ends immediately; when the writer finishes (even across an
     eviction or deploy — a durable reconcile alarm on the parent
     guarantees delivery), the `onWriterFinished` method fires and
     posts the text as an in-app notification

```typescript
// awaited
const result = await this.runAgentTool<AgentToolRunInput, AgentToolRunOutput>(
  WriterAgent, { input: { input: brief, userId } }
)
// detached — onFinish is a METHOD NAME (schedule-style, survives eviction)
const dispatch = await this.runAgentTool(WriterAgent, {
  input: { input: brief, userId },
  detached: { onFinish: 'onWriterFinished' },
})
```

**The child side is implemented once on `AutonomousAgent`** — the
framework requires children to implement its `AgentToolChildAdapter`
(`startAgentToolRun` / `cancelAgentToolRun` / `inspectAgentToolRun` /
`getAgentToolChunks` / `tailAgentToolRun`), and the base class provides
it, so **any** autonomous agent can be dispatched this way with zero
per-agent code. Contract mechanics worth knowing before you customise:

- `startAgentToolRun` must dispatch (under `keepAliveWhile`) and return
  `status: 'running'` immediately — the parent awaits it before
  branching on detached, so blocking there would serialise everything.
- The child's SQLite row is the durable truth; awaited parents block on
  `tailAgentToolRun`'s stream closing, then read the terminal row.
- Detached `onFinish` handlers are delivered **at-least-once** (claim +
  lease). They must be idempotent (the worked example uses a
  deterministic notification id + `onConflictDoNothing`) and must
  **throw on transient failure** — swallowing an error consumes the
  delivery and loses the result forever.
- Cancellation is cooperative: `cancelAgentToolRun` aborts the child's
  decision loop via `RunOnceInput.abortSignal`; a tool already
  mid-execute finishes.
- Fibers back the durability: the child's run (and every `runOnce`)
  executes inside `runFiber` with per-step checkpoints, so an eviction
  mid-run is *detected* on the next wake (`onFiberRecovered`) and
  terminalised instead of stranding forever.

Cost shape: researcher uses Sonnet (research strategy benefits from
flagship); writer uses Haiku (cheap prose generation). Each agent
sets its own `state.modelId` default; per-call overrides pass through
the tool input.

## Agent-as-MCP-server (worked example)

The inverse of the chat module's MCP-client pattern: here, the agent
**is** the MCP server. External MCP clients (other Claude Code
sessions, Anthropic Workbench, custom tooling) connect over
Streamable-HTTP and call our tools.

**Files**: `src/server/modules/mcp-agents/scratchpad-mcp-agent.ts`,
mounted at `/mcp/scratchpad/<sessionId>` in `src/server/index.ts`.

The example exposes a per-user persistent scratchpad — get / set /
append / clear tools. Trivial to demonstrate the pattern; forks
adapt to expose whatever app data they want over MCP (notes, todos,
conversation history, R2 files, search indices).

Subclass shape:

```typescript
import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export class ScratchpadMcpAgent extends McpAgent<Env, State> {
  server = new McpServer({ name: 'scratchpad', version: '1.0.0' })

  async init() {
    this.server.registerTool('get_scratchpad', { ... }, async () => ({ ... }))
    this.server.registerTool('set_scratchpad', { ... }, async ({ text }) => { ... })
    // ... more tools
  }
}
```

Mounted in `src/server/index.ts`:

```typescript
const scratchpadMcpHandler = ScratchpadMcpAgent.serve('/mcp/scratchpad', {
  binding: 'ScratchpadMcpAgent',
})

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith('/mcp/scratchpad')) {
      return scratchpadMcpHandler.fetch(request, env, ctx)
    }
    // ... rest of routing
  },
}
```

Connect from Claude Code:
```bash
claude mcp add scratchpad https://your-worker.dev/mcp/scratchpad/<sessionId>
```

⚠ **Auth note**: the worked example is unauthenticated for demo
clarity. Production forks MUST add auth — the agents SDK exports
`AgentMcpOAuthProvider` for OAuth-protected MCP endpoints. Or wrap
the path in your auth middleware before the handler runs.

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

The SDK instruments every agent unconditionally and publishes
structured events on Node **diagnostics channels** (`agents:chat`,
`agents:schedule`, `agents:mcp`, `agents:fiber`, `agents:workflow`, …).
Publishing to a channel with no subscriber is a no-op, so this costs
nothing until something listens. Two consumers:

1. **In-worker subscriber** — `server/lib/agent-diagnostics.ts`
   (side-effect import in `server/index.ts`) subscribes to the
   incident-shaped subset (recovery, failed, stalled, degraded,
   repaired) and emits one JSON line per event, so `wrangler tail`
   and Workers Logs surface chat-recovery incidents, stream stalls,
   and schedule/MCP failures with zero per-agent code.
2. **Tail Worker** — in production every published event is also
   auto-forwarded via `event.diagnosticsChannelEvents`. A fork that
   wants durable audit (D1 / Analytics Engine) attaches a Tail Worker
   and needs no agent-side code at all.

For pending schedules: query via `agent.getSchedules({type, timeRange})`
over RPC. For execution history: filter Workers Logs by the agent
class name in the structured payload.

### Chat recovery (durable streaming)

`ChatAgent` sets `chatRecovery` (plus a 3-minute stream-stall
watchdog) as class fields — a deploy, eviction, or hung provider
mid-turn resumes the interrupted turn instead of stranding a dead
spinner. The framework bounds recovery with attempt/no-progress/work
budgets and posts a terminal message if it gives up (`onExhausted`
logs a `chat_recovery_exhausted` line for alerting). Two rules when
touching this: config MUST stay a class field (budgets are evaluated
on wake before `onStart()`), and remember recovery re-runs flow back
through `onChatMessage`, so guards there must stay idempotent.

## Naming conventions

| Convention | Reason |
|---|---|
| Class names end in `Agent` | Matches SDK convention (`AIChatAgent`, `McpAgent`, `InputAgent`) |
| `static readonly className = 'X'` on every subclass | Constructor names get mangled by minifiers; explicit name surfaces in observability |
| Partition key: `${userId}:${slug}` | Per-user scoping; slug lets one user hold multiple named agents |
| Tool definitions: existing `ToolDefinition` contract | Same telemetry, truncation gate, approval flow as chat tools |

## Approval queue (human-in-the-loop)

Pattern for "agent drafts an action, user reviews + approves before
execute." Universal need for any agent that takes destructive
actions (send email, post message, transact).

**Files**: `src/server/modules/approvals/` + base-class methods on
`AutonomousAgent`. Routes: `/api/approvals/*`.

How it works:

1. Agent's tool calls `this.requestApproval(action, payload, summary)`
   from inside its execute body. Stores a row in `pending_approvals`,
   returns the id. Nothing fires.
2. LLM relays "I queued N approvals" to the user.
3. User reviews via `GET /api/approvals?status=pending` (or future UI).
4. On `POST /api/approvals/:id/approve`, the route looks up the
   originating agent and calls `agent.executeApproved(action, payload)`
   which performs the action with full env access.
5. Subclass implements `executeApproved(action, payload)` — switch on
   `action`, dispatch to per-action methods.

Worked example: `AssistantAgent.requestEmailApprovalTool()` queues
`send_email`; `AssistantAgent.executeApproved` handles `send_email` by
calling Gmail API with the user's OAuth token.

## Webhook ingestion

External event triggers (Slack messages, GitHub PRs, Stripe events,
custom integrations). Each agent instance has a per-agent webhook
secret; the receiver verifies HMAC SHA-256 (preferred) or plain
shared secret, then dispatches to `agent.handleWebhook(payload, headers)`.

**Files**: `src/server/lib/agents/webhook-verify.ts` + `src/server/modules/webhook-agents/routes.ts`.

Routes:
- `POST /api/webhooks/agent/:class/:handle` — public. `:handle` is an
  HMAC-signed `userId:slug` minted by `/info`; it authenticates the
  address (and yields the per-user DO name) before the sender signature
  is checked. Bare slugs are rejected — one user can never address or
  squat on another user's agent.
- `GET /api/webhooks/agent/:class/:slug/info` — auth-gated, returns the
  handle URL + secret to copy into the sender
- `POST /api/webhooks/agent/:class/:slug/rotate` — rotate secret

Agent DOs are namespaced `userId:slug`, so two users can both have a
"github" agent. If you upgraded from the bare-slug scheme, re-fetch
`/info` and update the URL in your external sender — old bare-slug URLs
return 401.

`handleWebhook` default invokes `runOnce({ input: JSON.stringify(payload) })`.
Subclasses override to parse webhook envelopes (Slack event, GitHub PR
hook, Telegram update) into something LLM-friendlier.

## Observability

Every `runOnce` invocation writes a row to `agent_runs` (id, class,
name, userId, trigger, input summary, started/finished, duration,
outcome, usage, cost, steps, tools called).

**Files**: `src/server/modules/agent-observability/`.

Routes:
- `GET /api/agent-observability/runs?class=&name=&trigger=&outcome=&since=&limit=`
- `GET /api/agent-observability/runs/:id`
- `GET /api/agent-observability/summary` — last 30 days, grouped by class

Different shape from `aiUsageLogs` (per-LLM-call): `agent_runs` groups
LLM calls under their agent invocation. "Show me everything
ResearcherAgent:cf-workers did today" is one query.

## Per-agent budget gate

`state.dailyBudgetUsd` per agent instance — `runOnce` checks today's
spend (rolling 24h from `agent_runs.cost_usd`) before firing. Over
budget = `BudgetExceededError` (route returns 429). Soft warn at 80%.

Set via `PUT /api/autonomous-agents/:slug/budget {dailyUsd}`. Pass
`null` to remove.

Free model runs (Workers AI) don't count — `cost_usd` is null for
unpriced models. The cap protects against paid-model spend.

## Tracked entities

Generic typed entity store for CRM / Atlassian-style apps. One
`entities` table discriminated by `type`; type-specific data in a
`fields` JSON blob.

**Files**: `src/server/modules/entities/` (CRUD) + `src/server/modules/chat/tools/entities.ts` (agent-callable).

Tools: `entity_create`, `entity_update`, `entity_get`, `entity_list`,
`entity_search`. All scoped to `ctx.userId`.

Routes:
- `GET    /api/entities?type=&status=&assignee=&q=&limit=`
- `POST   /api/entities`
- `GET    /api/entities/:id`
- `PATCH  /api/entities/:id` — partial; `null` in fields clears keys
- `DELETE /api/entities/:id`
- `GET    /api/entities/stats/by-type/:type`

Use cases: `type='ticket'` (Atlassian), `type='deal'` (CRM),
`type='task'` (project management). Forks evolve out into typed
tables when a type grows past ~10 indexed fields or needs FK
relationships.

## Semantic memory (Vectorize)

`recallSemantic(input)` extension hook fires before each `runOnce`
turn — returns relevant memory snippets injected as `## Relevant
memory` block in the system prompt for that turn only.

**Files**: `src/server/lib/agents/agent-memory.ts` — `agentRemember`
/ `agentRecall` / `agentForgetAll`.

Storage: one shared Vectorize index per fork, per-agent scoping via
`metadata.ownerKey = \`\${userId}:\${agentName}\``. BGE Base (768-dim,
free Workers AI binding).

Opt-in: uncomment the `AGENT_MEMORY` binding in wrangler.jsonc + run
the `wrangler vectorize create` commands listed there. Without the
binding, `recallSemantic` returns `[]` and agents work without
semantic memory (agent-memory tools also don't register).

`AssistantAgent` demonstrates the pattern: overrides `recallSemantic`
to call `agentRecall`; conditionally registers a `remember` tool when
`AGENT_MEMORY` is bound.

When Cloudflare AgentMemory ships GA (currently private beta), swap
the helper internals for `env.MEMORY.recall(...)` — subclasses don't
change.

## Approval queue UI

`/dashboard/approvals` — React page listing pending approvals with
approve/reject buttons + collapsible payload preview. Auto-refreshes
every 15s. Deep-link from notification dropdown via
`?focus=<approvalId>`.

`AutonomousAgent.requestApproval` also writes a `userNotifications`
row when queuing, so the bell badge picks up new approvals
automatically — no client polling needed.

## Cron-driven entity processing

`SweeperAgent` (`src/server/modules/autonomous-agents/sweeper-agent.ts`)
demonstrates the recurring AutonomousAgent pattern: scan an entity
type for stale items + per-item LLM reasoning + queue approvals.

Routes:
- `POST   /api/autonomous-agents/sweepers/:slug` — configure + start
- `GET    /api/autonomous-agents/sweepers/:slug` — status (config + lastSweep + nextRunAt)
- `DELETE /api/autonomous-agents/sweepers/:slug` — stop the recurring schedule
- `POST   /api/autonomous-agents/sweepers/:slug/run-now` — manual fire

Use cases: stale ticket triage, deal followup, contact reconnect
nudges, abandoned cart recovery, expiring subscription alerts.

Tuning: keep `maxPerSweep` low (default 10) and `actionDescription`
conservative — every queued approval costs user attention.

## Organizations (better-auth Organization plugin v1)

Multi-user team / workspace structure. V1 ships orgs + members +
active-org tracking on session. Invitation email flow + custom roles
+ team sub-grouping deferred for a focused later session.

Plugin endpoints (auto-mounted by better-auth at `/api/auth/organization/*`):
- `create`, `list-organizations`, `set-active-organization`,
  `add-member`, `remove-member`, etc.

Starter additions:
- `getActiveOrg(c)` — resolve the user's active org from session
- `getOrgRole(db, userId, orgId)` — explicit membership check
- `listUserOrgs(db, userId)` — for org switcher UI
- `requireOrgRole(c, allowedRoles)` — Express-the-policy gate
  returning Response on failure
- `GET /api/organizations/me` / `me/membership` / `active`

`entities` table gains an opt-in `organization_id` column. NULL =
personal entity (default behaviour). Forks adopting org-scoped
resources fill on insert + add membership checks at the route layer.

Use case: even a two-user org gives "shared components" — both
members see + act on the same entities, queue + review the same
approvals.

## Agent ↔ user MCP integration

`AutonomousAgent.buildToolset` automatically layers in the owner's
MCP connections (from the per-user `mcp_connections` table). When the
user connects a new MCP server via Connectors → Add MCP, every
autonomous agent they own immediately inherits its tools.

Solves the "Google Chat tool integration" use case: connect the
Jezweb google-chat MCP at `https://chat.mcp.jezweb.ai/mcp`, and your
AssistantAgent / SweeperAgent / ResearcherAgent get
`chat_spaces` / `chat_messages` / `chat_members` tools. Same pattern
for any other MCP — no native rewrite per provider.

Best-effort: a failing MCP load logs and continues with native tools
only — never breaks the agent run.

## Tool Search (progressive tool disclosure)

Pattern from Matt Carey's "Every API Is a Tool for Agents" talk
(Cloudflare AI Engineer 2026). Instead of injecting all 60+ tool
definitions into the model's context every turn, expose a small
`CORE_TOOL_NAMES` set + a `find_tools(query)` search tool. The agent
searches for what it needs; prepareStep activates discovered tools
on subsequent steps.

**Files**: `src/server/lib/ai/tool-search.ts`, wired in
`src/server/lib/ai/agent.ts` (chat module). Composes with the
existing privileged-tool gating in `prepare-step.ts`.

Always-active core (~10 tools): `find_tools`, `done`,
`get_server_time`, `calculate`, `show_*` UI tools, `load_skill`,
`recall`, `remember`. Specialised tools (Gmail, Calendar, Drive,
browser, image gen, MCP-inherited) are search-required.

Typical savings: 8-12K input tokens per turn on a fully-equipped
chat session. Pairs with the truncation gate (#30) and history trim
(#31) — three layers of input-budget management.

To opt out: omit `coreToolNames` from the `computeActiveTools` call
in your fork's prepareStep. All tools become visible (legacy
behaviour); privileged-tool gating still applies.

AutonomousAgent doesn't use Tool Search yet — its subclasses ship
smaller curated catalogs (10-20 tools) where savings are marginal.
Easy to add by threading the same prepareStep into runOnce; deferred
until a fork has an autonomous agent with 30+ tools.

## Platform stance (2026-07)

Verified live against the shipping SDKs (`agents` 0.17.x,
`@cloudflare/ai-chat` 0.9.x, `@cloudflare/think` 0.13.x,
`@cloudflare/codemode` 0.4.x). Full adoption assessment with the
adopt / align / pilot / hold decision table:
[`.jez/artifacts/agents-stack-embrace-2026-07-17.md`](../.jez/artifacts/agents-stack-embrace-2026-07-17.md).

- **AI SDK stays on v6.** The entire Cloudflare agents line pins
  `ai ^6`. Migrating this starter to AI SDK 7 ahead of the platform
  is an ANTI-goal — chase nothing until `agents`/`ai-chat`/`think`
  move together.
- **AIChatAgent is not deprecated.** `@cloudflare/think` is a sibling
  harness (server-owned loop, Actions ledger, channels), not a
  replacement for the bring-your-own-inference `AIChatAgent` our chat
  module is built on. Think is the PILOT path for a new agent class,
  not a migration target for ChatAgent.
- **Pin exact versions; treat every 0.x bump as breaking.** CI +
  brains-trust gate on upgrades.

### Think pilot (`ThinkPilotAgent`)

A working Think agent ships as the pilot:
`src/server/modules/think-pilot/think-pilot-agent.ts`, page at
`/dashboard/think-pilot` behind `VITE_FEATURE_THINK_PILOT`. What it
demonstrates, and what a fork should copy when evaluating Think:

- **Actions ledger** — `action({ inputSchema, idempotencyKey, execute })`.
  The ledger replays a settled result when the same key + input recur
  (recovery-retry safe) and throws `ActionKeyConflict` when a key is
  reused with different input. Stronger than our approvals module,
  which trusts the executor to run once.
- **Approval-gated side effects** — `approval: true` renders an
  in-transcript Approve/Deny card (`getToolApproval` +
  `addToolApprovalResponse` on the client); the turn auto-continues
  after the decision. `kind: "durable-pause"` + the client-callable
  `pendingApprovals`/`approveExecution` RPCs are the dashboard-style
  alternative (maps to our Inbox pattern).
- **Scheduled-task DSL** — `getScheduledTasks()` returns declarative
  `"every day at 07:30"` tasks reconciled on boot. Per-instance and
  code-declared; user-facing recurring agents still belong to Routines.
- **Skills interop** — `getSkills()` mounts the same D1-backed
  `userSkillSource` the chat agent uses. One skills store, two harnesses.
- **Model routing** — `getModel()` returns a constructed `LanguageModel`
  from our provider registry, bypassing Think's AI-Gateway string slugs
  so the pilot honours the app's existing key configuration.

Gotchas: `workspaceBash` must stay `false` while the repo's `just-bash`
stub alias exists (Think's built-in workspace Bash tool needs the real
package — see `server/lib/ai/skills/just-bash-stub.ts` to opt in);
messengers (`getMessengers()`) are the seam for Telegram etc. but need a
bot token, so the starter leaves them unwired.

### Code Mode (`@cloudflare/codemode`)

Now a real package (bundled inside `agents`): the model writes one
JavaScript block composing many tool calls, executed in an isolated
dynamic Worker (network blocked, credentials never enter the
sandbox). Our stance is **pilot behind a flag, durable variant
only**: the stateless `createCodeTool` silently DROPS
approval-gated tools, and composed calls return a single result, so
per-tool React renderers and telemetry can't fire. Right scope for
us: the long-tail/shape-tier tools; bespoke-renderer tools stay
direct.

## Adjacent patterns not yet adopted

### Stateless MCP by default

**Idea**: MCP servers reach for sessions + Durable Objects unreflexively
when many don't actually need them. Cloudflare is pushing stateless
defaults into the MCP TypeScript SDK.

**Where we already do this badly**: `ScratchpadMcpAgent`
deliberately uses DO state (per-user persistent scratchpad — needs
state). For a fork building a STATELESS MCP (tools that just call
external APIs without per-session state), the McpAgent base is
overkill — use `createMcpHandler` from `agents/mcp` directly.

**What we'd add**: a stateless companion example
(e.g. `WeatherMcpAgent` — tools that just call openweathermap with no
per-session state) + documentation note about when to pick which.

### MCP-as-middleware (Hono-native)

**Prediction from the talk**: MCP becomes a standard middleware flag
in web frameworks. Hono / Express expose any API to agents natively
without writing tool definitions.

**Where we partially do this**:
- Phase J: any user-connected MCP becomes available to autonomous agents
- McpAgent: any AutonomousAgent we build can expose itself as an MCP
  server (other Claude Code sessions consume it)

**What we'd add**: a `mcpFromHono(app)` helper that walks a Hono
app's routes + auto-generates an MCP server from them. Forks would
get "your REST API is now also an MCP server" with one line.
Requires Hono route introspection + a route-to-tool-schema converter.

## Future extensions (not yet shipped)

- ~~`agents:skills` migration~~ — **resolved 2026-07-18 as interop,
  not swap**: our D1 layer (per-user overrides, enable/disable,
  always_active) has no SDK equivalent, so the registry stays ours;
  `userSkillSource` adapts it to the SDK `SkillSource` interface and
  `run_skill_script` runs function-style JS via the Worker Loader
  runner. See AGENT_TOOLKIT.md §Skill scripts.
- **Think pilot** — one new agent class (messenger-facing or
  AdminAgent v2) on `@cloudflare/think`
- **Agents-as-tools / fibers pilot** — rework researcher→writer on
  detached durable runs; fiber-checkpoint one long loop
- **AgentMemory** binding (waitlist as of April 2026) — wire when GA;
  the `recallSemantic` hook is the slot
- **AgentWorkflow** worked example for long pipelines
- **A2A** endpoint adapter when the spec stabilises further

## References

- Cloudflare agents SDK: <https://developers.cloudflare.com/agents/>
- AgentMemory: <https://blog.cloudflare.com/introducing-agent-memory/>
- AI SDK v6: <https://ai-sdk.dev/docs/agents/overview>
- Letta block memory pattern: <https://www.letta.com/blog/agent-memory>
- A2A protocol: <https://github.com/a2a-protocol>
