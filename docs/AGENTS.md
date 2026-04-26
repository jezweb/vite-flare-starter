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
| Multi-agent handoff (specialist agents call each other) | `AutonomousAgent` + custom `delegate_to_X` tool that calls another agent's stub | `ResearcherAgent` → `WriterAgent` |
| Expose agent's data over MCP for external clients | `McpAgent` from `agents/mcp` (SDK) + `McpServer` from `@modelcontextprotocol/sdk` | `ScratchpadMcpAgent` |
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

## Multi-agent handoff (worked example)

The agents-as-tools pattern, where the LLM decides when to hand off
by calling a tool that invokes another agent. From OpenAI Agents SDK,
Mastra, and Anthropic Claude Agent SDK conventions.

**Files**: `src/server/modules/autonomous-agents/researcher-agent.ts`
+ `writer-agent.ts`. Route: `POST /api/autonomous-agents/researcher/:slug { topic }`.

Flow:
1. ResearcherAgent's LLM uses `web_search` to gather facts
2. When it has enough material, the LLM calls `delegate_to_writer`
   with notes + brief
3. The `delegate_to_writer` tool fetches the WriterAgent stub and
   calls `runOnce` on it
4. Writer composes the polished response (no tools, just LLM)
5. Researcher returns the writer's text as its final answer

The handoff tool is **inline to the delegating agent** — partition
logic (which Writer instance to invoke) is explicit. Forks adapting
to a different topology (multiple writers routed by topic, parallel
fan-out) customise the tool body. Don't over-abstract this into a
shared factory until you have 3+ delegators with the same wiring.

```typescript
private delegateToWriterTool(): ToolDefinition<...> {
  const userId = this.state.userId ?? ''
  const env = this.env
  return {
    name: 'delegate_to_writer',
    description: '...',
    inputSchema: z.object({ notes: z.string(), brief: z.string() }),
    execute: async ({ notes, brief }) => {
      const writer = await getAgentByName(env.WriterAgent, `${userId}:writer`)
      await writer.setOwner(userId, 'writer')
      const result = await writer.runOnce({
        input: `Brief: ${brief}\n\n## Notes\n\n${notes}`,
      })
      return { ok: true, text: result.text }
    },
  }
}
```

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
- `POST /api/webhooks/agent/:class/:slug` — public, signature is the auth
- `GET /api/webhooks/agent/:class/:slug/info` — auth-gated, returns URL + secret to copy into the sender
- `POST /api/webhooks/agent/:class/:slug/rotate` — rotate secret

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

## Future extensions (not yet shipped)

- **Phase 0b** — refactor chat module onto `AIChatAgent` for state
  sync + sub-agent routing
- **AgentMemory** binding (waitlist as of April 2026) — wire when GA;
  the `recallSemantic` hook is the slot
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
