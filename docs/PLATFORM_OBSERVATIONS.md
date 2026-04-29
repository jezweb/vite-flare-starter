# Platform Observations

What we learned from other agent frameworks while designing this
starter. Captures **why the architecture looks the way it does** —
which patterns we adopted, which we deferred, which we built
differently.

This document ages: agent frameworks ship monthly. Snapshot is end
of April 2026. Re-survey before any major architectural decision.

---

## The frameworks surveyed

| Framework | What it is | What we learned from it |
|---|---|---|
| **Cloudflare `agents` SDK** | DO-based agent runtime + tooling | Foundation. We extend `Agent` for everything; sub-agent routing is the swarm primitive. |
| **AI SDK v6** (Vercel `ai`) | LLM abstraction + tool loop | Foundation. `streamText` + `ToolLoopAgent` + tool() are the inner loop. |
| **Anthropic Claude Agent SDK** | Open-sourced engine behind Claude Code | File-system-first memory, Skills as first-class concept, hooks lifecycle. We borrowed Skills + the hooks pattern. |
| **OpenAI Agents SDK** | Production successor to Swarm | Cleanest multi-agent handoff API (handoffs as tools). Our delegate_to_X pattern. |
| **Letta** (formerly MemGPT) | LLM-as-OS, self-managing memory | Block memory pattern (state.blocks). Hierarchy of core/recall/archival. We adopted blocks; deferred LLM-edits-own-memory. |
| **Mastra** | TypeScript multi-agent orchestration | Agents-as-tools handoff, workflow vs agent distinction. We adopted handoff; deferred explicit workflow primitive (use Cloudflare Workflows when needed). |
| **AutoGen / CrewAI** | Role-based multi-agent crews | Swarm + hierarchy patterns. We deferred the roles registry; one-instance-per-(user,slug) is simpler. |
| **A2A protocol** (Google-led) | Inter-agent message standard | Emerging, 150+ orgs. We don't speak A2A yet. Will add an adapter when the spec stabilises further. |

---

## Universal primitives (everyone agrees on)

These shipped in every framework. We have all of them:

| Primitive | What it is | Where in our starter |
|---|---|---|
| **Identity** | Agent has a name + system prompt + model | `state.name` + `state.persona` + `state.modelId` on AutonomousAgent |
| **Tool loop** | LLM → decide → call tool → observe → repeat until stop | `streamText({ tools, stopWhen })` from AI SDK; we wrap in runOnce |
| **Tool schema** | Zod / JSON Schema for input validation | `ToolDefinition.inputSchema` (Zod) |
| **MCP** | Cross-framework tool registry standard | Both directions: consume (Phase J) + expose (McpAgent worked example) |
| **Subagents-as-tools** | Spawn specialised agent via tool call | `delegate_to_writer` pattern in ResearcherAgent |
| **Hooks/middleware** | Pre/post-tool callbacks for audit/approval | `tool-adapter.ts` execute wrapper + `prepareStep` |
| **Sessions** | Resumable conversation context | DO state + `recentMessages` sliding window |
| **Tracing** | Structured spans, pluggable exporters | `agent_runs` audit table + Workers Logs structured events |

---

## Where frameworks diverge (no consensus)

These are the questions every framework answers differently. We made
our own calls, documented here so it's clear they're choices.

### Memory architecture

| Framework | Their answer |
|---|---|
| **Letta** | LLM edits its own memory via tools (core_memory_append, archival_memory_search) |
| **Cloudflare AgentMemory** | Managed Vectorize service, retrieval-based |
| **OpenAI** | Responses API chains via `previous_response_id` |
| **Anthropic** | Filesystem (CLAUDE.md, Skills, files in cwd) |
| **Us** | **Block memory** for always-in-context structured state, **sliding window** for episodic, **Vectorize hook** for semantic, **entities table** for structured records the agent acts on |

**Why we picked the hybrid**: blocks are cheap and predictable; semantic
memory is opt-in (forks pick if they need it); the entities table is the
"world model" most CRM/PM products need.

**Trade-off**: we don't have Letta's emergent self-editing memory. An
agent can't decide "I should remember this fact forever" without explicit
user prompting. That's fine for our patterns (admin / CS / digest); it
would matter for "AI companion" products where memory IS the product.

### Inter-agent messaging

| Framework | Their answer |
|---|---|
| **OpenAI Agents** | Handoffs — destination agent gets full conversation history; transfer modelled as a tool |
| **Anthropic** | Subagents spawned within a query; parent_tool_use_id traces |
| **Mastra** | Sub-agents registered as tools on the parent |
| **AutoGen / CrewAI** | GroupChat / Swarm modes — peer-to-peer or role-based routing |
| **A2A** | Wire-protocol standard; agents speak HTTP+JSON-RPC regardless of host framework |
| **Us** | **Sub-agent routing** (SDK primitive — hierarchical), **direct stub RPC** (anywhere-to-anywhere via `getAgentByName`), **Queues** (async fan-out, not yet wired) |

**Why we picked the three-tier menu**: each pattern fits different shapes.
Sub-agent for parent-child task delegation (researcher→writer). Direct
stub for "Anthro talks to your shop's assistant." Queues for high-fan-out
broadcast (not yet hot in our patterns; will add when needed).

### State sync to clients

| Framework | Their answer |
|---|---|
| **Cloudflare `agents` SDK** | Built-in via `state` setter + `useAgent` React hook + WebSocket |
| **AI SDK** | `useChat` polls / streams text only; no general state sync |
| **OpenAI / Anthropic SDKs** | Server-side state, no client sync; clients fetch |
| **Us** | **Currently chat-style streaming via SSE** (chat module), **agents SDK state sync available but not used** because we don't yet expose live agent state to UIs |

**Why we don't sync state**: the chat module pre-dated AutonomousAgent.
The kimi-style "Computer pane showing live tool execution" is the natural
next step (deferred — issue #40). When we adopt it, state sync from the
SDK does the heavy lifting.

### Workflow vs agent

| Framework | Their answer |
|---|---|
| **Mastra** | Explicit Workflow primitive (graph of steps) alongside Agent (open-ended) |
| **Anthropic** | Hooks (PreToolUse, PostToolUse, etc) in the agent loop — no separate workflow concept |
| **Cloudflare** | `AgentWorkflow` composes Agent with Cloudflare Workflows (durable steps + checkpointing) |
| **Us** | **Use Cloudflare Workflows directly when needed** — durable multi-step business logic with retries. AutonomousAgent for open-ended decision loops. SweeperAgent for cron-like recurring work. No middle-ground "explicit workflow" primitive. |

**When to reach for Workflows**: long-running pipelines (>30 min),
multi-stage data import, anything that needs explicit step retries
across DO restarts. The starter doesn't ship a worked Workflows
example yet (issue #40 roadmap).

### Approval / human-in-the-loop

| Framework | Their answer |
|---|---|
| **AI SDK v6** | `needsApproval` flag on tool — pauses the stream mid-call, UI confirms |
| **OpenAI Agents** | Guardrails — input/output validation, no native human-loop UX |
| **Anthropic** | Hooks intercept tool calls, but human approval is app-layer |
| **Mastra / AutoGen** | App-layer (no built-in queue) |
| **Us** | **Two patterns side-by-side**: chat module's `needsApproval` for synchronous chat (matches AI SDK v6), **plus our async approval queue** (Phase A) for autonomous agents that run without a live user |

**Why we built the queue**: autonomous agents fire on schedule or
webhook with no live UI session. Synchronous "pause + ask" doesn't
work — there's nobody to ask in real time. Async queue + notifications
+ review tab is the right shape for the autonomous case.

---

## What we adopted from each framework

### From AI SDK v6

- **The streaming + tool loop primitive** (`streamText`, `tool()`) — wrapped but not replaced
- **`needsApproval`** flag on tool definitions for synchronous chat
- **Token usage in message metadata** — drives cost tracking + size indicators
- **`pruneMessages` + `convertToModelMessages`** — context management primitives

### From Cloudflare `agents` SDK

- **`Agent` base class for everything** — DO + state + RPC + hibernation + alarms
- **`agent.schedule()` / `agent.scheduleEvery()` / `agent.queue()`** — replaced our hand-rolled equivalents
- **Sub-agent routing** for hierarchical delegation
- **Stable session affinity for Workers AI** via `agent.sessionAffinity`
- **`McpAgent` base** for exposing agents as MCP servers

### From Anthropic Claude Agent SDK

- **Skills as first-class concept** — bundled + R2-uploaded + GitHub-loaded SKILL.md format
- **Progressive disclosure** — load_skill tool returns body on demand (Level 2)
- **Hooks lifecycle thinking** — pre/post-tool execute wrapping in tool-adapter

### From OpenAI Agents SDK

- **Handoffs as tools** — our `delegate_to_X` pattern is this
- **Sessions interface concept** — though we use DO state instead of their MemorySession

### From Letta

- **Block memory pattern** — `state.blocks` as Letta-style structured context blocks
- **Three-tier memory taxonomy** — core/recall/archival, ours is blocks/episodic/semantic

### From Mastra

- **Sub-agents registered as tools on the parent** — same as OpenAI handoffs, our `delegate_to_X`
- **The agent vs workflow distinction** — informed why we use Workflows directly rather than building a workflow primitive

### From the wider ecosystem

- **MCP everywhere** — both consume (Phase J) and expose (McpAgent)
- **Tool Search** (Cloudflare AI Engineer talk) — find_tools + lazy activation (Phase K)
- **BYOK with env fallback** — common pattern in B2B AI products, formalised in Phase L
- **Approval queue + audit table** — common in human-in-the-loop products (Anthropic's Workbench, OpenAI's playground both have manual review)

---

## What we deferred (and why)

### Cloudflare's "Code Mode"

**What it is**: typed TypeScript SDK + sandboxed isolate execution. Agent
writes TS code that calls the SDK; isolate runs it. 99.9% input-token
reduction vs tool-per-endpoint.

**Why deferred**: major architectural shift. Worth it for products with
50+ similar API operations (CRM, Atlassian-clone). Our current pattern
(60 tools + Tool Search) is sufficient for the products we're building.

**What we'd need**: typed SDK exposing app primitives (entities, agents,
conversations, files), `eval_typescript` tool running in
`@cloudflare/sandbox` isolates, response collection back to agent. ~2-3
days of focused work. Tracked in roadmap issue #40.

### AgentMemory (private beta)

**What it is**: Cloudflare's managed memory service — Vectorize + DO +
Workers AI under one binding (`env.MEMORY`).

**Why deferred**: not GA as of April 2026. Our `recallSemantic` extension
hook on AutonomousAgent is the slot — when the binding ships, swap helper
internals. Tracked in issue #35.

### Letta-style "LLM edits own memory"

**What it is**: agent has tools to append/replace its own context blocks
mid-conversation. Memory becomes self-managed.

**Why deferred**: powerful for AI companion / long-relationship products;
overkill for our admin / CS / digest patterns where memory is mostly
user-configured. Easy to add as a tool (`update_block(name, value)`)
when a fork needs it.

### Hono `mcpFromHono(app)` middleware

**What it is**: walk a Hono app's routes, auto-generate an MCP server
from them. "Your REST API is now also an MCP server" with one line.

**Why deferred**: nice-to-have for fork-users with existing REST APIs.
Not blocking any product use case yet. Tracked in roadmap issue #40.

### Agent activity stream / live execution pane

**What it is**: kimi-style "Computer" right pane showing live tool
execution + file tree + version-aware preview.

**Why deferred**: significant UX work. Would use the `agents` SDK's state
sync. Worth doing once we have a real product use case to anchor the UI
against (not just a demo).

---

## What we built differently from any framework

### Three-layer input-budget management

Every framework has SOME context management — none combine all three:

1. **Per-tool result truncation** with R2 spillover (Phase A of issue #30)
2. **History trimming** with Haiku summarisation (issue #31)
3. **Tool Search** lazy-activation (Phase K)

Other frameworks pick one approach. Ours layer cleanly because they
operate at different points in the pipeline (tool result → conversation
history → tool registry exposure).

### Per-agent cost tracking + budget gate

`agent_runs.cost_usd` is computed from token counts × catalog prices at
write time. Phase D's budget gate queries this to enforce per-agent
daily caps. The combination (tracking + gate) is one most frameworks
defer to "you wire your own observability."

### BYOK with explicit env fallback

`getServiceKey(env, owner, provider)` checks user → org → env in order.
Backwards-compatible (env-only deployments still work) but adopts BYOK
incrementally. Most B2B AI products either force BYOK (alienates solo
users) or env-only (alienates clients). The fallback chain is the right
default.

### Generic entities table for CRUD-heavy apps

`entities` table with `type` discriminator + JSON `fields` blob is the
"start here" for CRM / Jira / PM products. Frameworks usually leave you
to define your own tables; we ship the generic primitive + agent tools
+ "evolve out when you need to" guidance.

### Approval queue as DB table, not in-stream

Other frameworks pause the agent stream for approval (synchronous).
Ours queues to D1 + dispatches to `executeApproved` on user approve
(async). Right shape for autonomous agents; matches AI SDK's
`needsApproval` for synchronous chat.

---

## Trajectory predictions (next 6 months)

These shape what we'd build next.

1. **A2A + MCP becomes the default interop layer.** Microsoft's
   unification of Semantic Kernel + AutoGen behind A2A, Google's spec
   maturation, 150+ orgs in production. Cloudflare will likely add
   native A2A routing in `agents` SDK. We'd add an A2A adapter then.

2. **Managed memory becomes table stakes.** Cloudflare AgentMemory GA,
   OpenAI hosted memory endpoints, Anthropic's promised memory feature
   in Claude. Our `recallSemantic` hook is ready.

3. **Hibernation-first design spreads.** The actor model (DO = agent)
   solves cold-start cost. Other edge providers (Vercel, Deno Deploy,
   Cloudflare Workers AI itself) will add primitives that look like
   DOs. We're already there.

4. **Context blocks / memory blocks converge.** Letta's "block memory"
   and Cloudflare's "context blocks" are the same idea. Will become a
   named pattern. We use it now.

5. **Tool approval becomes UI primitive.** AI SDK's `needsApproval` +
   `sendAutomaticallyWhen` is early. Expect framework-level UI for
   human-in-the-loop. Our queue + `/dashboard/approvals` is one
   instance of this.

6. **Code Mode becomes mainstream.** Cloudflare's pattern (typed SDK
   + sandboxed isolate) will get adopted by other agent frameworks
   once tooling stabilises. We'd consider building it when there's
   a product that genuinely needs 50+ API operations.

---

## What we got wrong (so far)

Honest list of architectural calls that turned out suboptimal. Updated
as we discover them.

### Hand-rolled `ScheduledAgent` before checking the SDK

**The mistake**: built schedule/retry/queue/alarm telemetry on raw
DurableObject before realising `Agent` from `agents` SDK ships all of
it (better).

**The fix**: Phase 0 refactor — deleted 332 lines of hand-rolled code,
extended `Agent` instead.

**Lesson**: check the SDK exports before building infrastructure
primitives. Documented in `docs/AGENTS.md` "Don't extend raw
DurableObject — use the SDK base."

### Per-tool definitions in two places

**The mistake** (resolved): server `execute` and client `render` were
defined in separate files. Drift was inevitable.

**The fix**: Phase 0 unified `ToolDefinition` contract. Single file
per domain holds both halves.

**Lesson**: contracts > conventions. When two halves of a primitive
must stay in sync, make them one shape.

### Stateless MCP example shipped as stateful

**The mistake** (open): `ScratchpadMcpAgent` worked example uses DO
state because it's a per-user scratchpad. Reading the example gives
fork-users the impression every MCP server needs DO state.

**The fix planned**: ship a stateless companion example
(WeatherMcpAgent or similar) with docs explaining when to pick which.
Tracked in issue #40.

### No worked example for AgentWorkflow

**The mistake** (open): Cloudflare Workflows + `AgentWorkflow` is in
the SDK + Cloudflare's roadmap. We have no worked example. Forks
needing durable multi-step pipelines have to figure it out alone.

**The fix planned**: ship one worked example (image processing
pipeline or similar) demonstrating Agent → Workflow → callback to
Agent. Tracked in issue #40.

---

## better-auth plugin survey (2026-04-29)

The starter ships these better-auth plugins:

| Plugin | Why |
|---|---|
| `organization()` | Multi-tenant orgs (Phase I) |
| `lastLoginMethod()` | "Last used" badge on SignInPage — UX nicety |
| `testUtils()` | Conditional on `TEST_AUTH_TOKEN` — powers `/api/test-auth/*` |

The full plugin catalogue was reviewed for fit. Findings below — when
you reach for one of these, either pull it from this list or update
the list with the verdict.

### Considered, not adopted

| Plugin | Why we skipped |
|---|---|
| `bearer()` | We have our own API tokens module with finer-grained scopes |
| `admin()` | Org plugin's owner/admin/member roles cover team auth; impersonation isn't needed since `testUtils()` mints sessions directly |
| `magicLink()` | OAuth-only by default; `testUtils()` is the test-mode equivalent |
| `multiSession()` | Org switcher already covers "switch workspace"; per-account multi-session adds UX complexity for marginal gain |
| `anonymous()` | Niche — every product so far needs a real account |
| `deviceAuthorization()` | Niche — TV / IoT-specific, not a fit for SaaS |
| `oidcProvider()` | Be-your-own-OIDC is rare; revisit if a fork needs SSO into other apps |
| `twoFactor()` / `phoneNumber()` / `emailOTP()` | High-value but ship-when-needed (Google OAuth handles MFA upstream for now) |
| `captcha()` | OAuth-only signup means abuse risk is bounded by Google's verification; revisit if email/password is enabled at scale |
| `jwt()` / `mcp()` | App-to-app auth; not yet a fork need |

### Community plugins worth knowing about

| Plugin | When you'd reach for it |
|---|---|
| [better-auth-cloudflare](https://github.com/zpg6/better-auth-cloudflare) (zpg6) | New project on Cloudflare from scratch — adds geolocation enrichment, KV rate-limiting helpers, R2 file tracking, CLI scaffolding. Don't migrate this starter, but note for forks starting fresh. |
| [better-auth-harmony](https://github.com/GeKorm/better-auth-harmony) | Production-grade signup hardening — email normalization + 55k disposable-domain blocklist. Ship when a fork enables email/password signups at scale. |
| [better-auth-devtools](https://github.com/C-W-D-Harshit/better-auth-devtools) | Dev panel for test users / session inspection / role editing. Complements our `/api/test-auth` endpoint — could ship as `/dashboard/dev/auth` in dev mode. Not a fit for production. |
| [better-auth-audit-logs](https://github.com/ejirocodes/better-auth-audit-logs) | Auto-captures auth events with PII redaction. We already log via `databaseHooks.user.create.after` and `session.create.after` — would duplicate. Note as alternative if those hooks become unwieldy. |
| [better-invite](https://github.com/Sandy/better-invite) | Standalone invitation flow. Org plugin already covers our needs — this is for products without org structure. |

### How to use this section

When a fork (or future session) considers adding a better-auth plugin:

1. Check the table here first — verdict may already exist
2. If new, evaluate against the matrix: official > community > custom
3. Update this section with the new verdict + one-line rationale

---

## How to use this document

When making an architectural decision:

1. **Check "Universal primitives"** — if it's something every framework
   has, look for our existing implementation, don't rebuild
2. **Check "Where frameworks diverge"** — if no consensus exists,
   our choice is a choice not a fact; you can override per-product
3. **Check "What we deferred"** — if the thing you need is here, look
   at the linked roadmap issue + decide if it's worth pulling forward
4. **Check "What we got wrong"** — past mistakes flagged so you don't
   repeat them in a fork

When researching a new framework / pattern:

1. Map it against "Universal primitives" — confirm it covers the table
   stakes
2. Look at the divergence axes — where does it sit on memory /
   messaging / state sync / workflow / approval?
3. Update this document if you find converging patterns we missed
