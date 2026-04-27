# Long-running agent context + composable agent primitives

**Date**: 2026-04-27
**Scope**: Routines (scheduled agent instances firing every N minutes for weeks/months) and the higher-level question of agent capabilities as composable platform primitives for a future Jira-clone built on the same starter.

---

## Thread 1 — Long-running agent context management

### What the field is doing right now

| System | Pattern | Lossiness | Cost |
|---|---|---|---|
| **Claude Code `/compact`** | Auto-summarisation triggered near context limit. Preserves "requests + key code snippets"; loses early instructions, reasoning, full doc text. Mitigated by CLAUDE.md (rules outside transcript) + post-compaction hooks. | Lossy by design. | One summary call per compaction. |
| **Anthropic Memory Tool** (managed agents, public beta 2026‑04) | Agent-managed file directory. Tools: `view`, `create`, `str_replace`, `insert`, `delete`, `rename`. Markdown files persist across sessions; agent decides what to write. Bootstrapped explicitly (progress log, checklist). Used by Netflix/Rakuten in production. | Agent controls. | Per-call tool invocation; storage cheap. |
| **Letta / MemGPT** | Two-tier: **core memory** (in-context, editable blocks — persona + human + custom) + **archival memory** (vector DB, agent-queried via `archival_memory_search/insert`) + **recall memory** (raw conversation, time-indexed). Agent self-manages via tool calls. | Agent controls; archival is ANN. | Embedding + vector query per recall. |
| **LangGraph checkpointer** | Per-thread state snapshots at every superstep. Short-term = thread-scoped checkpoints; long-term = `BaseStore` (key-value, optionally with embeddings). Threads keyed by ID. Time-travel + replay built in. | None per-step (full snapshots). Long-term is opt-in summarisation. | Snapshot write per step — Redis backend recommended at scale. |
| **Cloudflare Agent Memory** (private beta 2026-04, GA pending) | Managed pipeline: extract → verify → classify → store. Content-addressed (SHA-256 of session+role+content) so re-ingestion is idempotent. Worker binding + REST. Designed as drop-in for SDK agents and for Claude Code/OpenCode. | Managed extraction; quality TBD. | Free during beta; pricing unknown. |
| **Run-tail summary** (rolling) | Each run writes a "what I learned" record; old run history deleted. | High (one paragraph replaces N turns). | One small LLM call per run. |
| **Vector-DB-of-summaries** | Episodic episodes embedded; recall via similarity at next run. | Medium (semantic miss possible). | Embed + query per recall. |

### What we already have

- `state.persona` — Letta core/persona equivalent.
- `state.blocks` — Letta named core memory blocks.
- `state.recentMessages` — sliding window (default 30); episodic-recent.
- `recallSemantic()` hook → `agentRecall()` over Vectorize (BGE Base, 768-dim, ownerKey-scoped).
- `memories` table — three-scope (project/user/org) trust model, separate from agent state.
- `agent_runs` — per-invocation audit (cost, trigger, outcome).

That's already four of Letta's five layers (persona, blocks, episodic, semantic). What we don't have is the **archival self-management loop**: tools for the agent to read/write/list its own memory file, MemGPT-style.

### The actual problem at scale

A routine that fires every 15 min for 30 days = 2,880 runs. With `maxRecentMessages: 30`, the sliding window stays bounded — so context blow-up isn't actually our risk. The risks are:

1. **Cross-run continuity**: each run loses the previous run's conclusions because the window only carries the last few turns. By run 100, run 1's findings are gone.
2. **Storage bloat**: `agent_runs` grows linearly forever. Token-usage analytics still useful, but row count compounds.
3. **Vectorize bloat / drift**: if every run dumps a "what I learned" memory, the index degrades — recall returns increasingly stale, redundant matches.
4. **Cost sneaking up**: forgetting to set `dailyBudgetUsd` on a routine means a runaway loop is possible.

### Recommended next primitive: `RoutineRun` + run-summary memory class

Add ONE primitive — a `routine_runs` table that's a tail-keeping, summary-bearing audit row distinct from `agent_runs`:

```ts
interface RoutineRun {
  id: string
  routineId: string         // FK — many runs per routine
  agentId: string           // which AutonomousAgent fired
  userId: string
  startedAt: number
  finishedAt: number
  triggerKind: 'cron' | 'manual' | 'webhook'
  outcome: 'ok' | 'no_change' | 'error' | 'budget_exceeded'
  // Tail-summary: one paragraph, model-generated, replaces transcript
  summary: string | null
  // Structured findings the routine produced (so downstream code/UI
  // can consume without re-parsing the summary text)
  findings: Finding[]       // FK or JSON column
  // Pointer back to underlying agent_run for cost/usage drill-down
  agentRunId: string | null
}

interface Finding {
  id: string
  kind: string              // 'task_due_soon' | 'metric_anomaly' | 'new_email' | …
  payload: Record<string, unknown>
  createdAt: number
}
```

Why this shape:

- **Sliding window stays bounded** at the agent level (the existing 30-msg cap is fine).
- **Cross-run continuity** comes from the `summary` column being injected as an extra context block on the next run ("Previous run: …"). Naive: last summary; smarter: last N summaries; smartest: vector-recall over summaries by topical similarity to current trigger.
- **Vectorize stays clean** because we only embed the SUMMARY (one per run), not every turn. 2,880 runs = 2,880 vectors; cheap.
- **Findings are structured** so the inbox / approvals UI can render them without parsing prose.
- **`agent_runs` is unchanged** — RoutineRun is a higher-level construct that may span multiple `agent_runs` if a routine triggers tool-loops.

Pruning: keep last N=200 RoutineRun rows in full; for older, keep summary + findings only and drop the full agent_run reference. Or move them to D1 cold storage / R2 JSON. Either way, the sliding-window principle generalises from messages to runs.

This shape is the missing primitive. Sliding-window-of-runs replaces sliding-window-of-messages at the routine layer; semantic recall over run summaries gives long-term recall without context blow-up.

### Cost / latency table for the proposed shape

| Operation | Where | Cost | Latency |
|---|---|---|---|
| Persist RoutineRun row | D1 | negligible | <10ms |
| Generate run summary | Workers AI Kimi/Gemma | free | ~3–8s |
| Embed summary | Workers AI BGE Base | free | <1s |
| Recall N prior summaries | Vectorize | cheap | <100ms |
| Inject into next run | system prompt block | tokens × $/MTok | linear in N |

A 15-min cadence for 30 days at $0.0001/run summary cost = $0.29/month per routine. Acceptable.

---

## Thread 2 — Agent capabilities as composable primitives

### Prior art worth stealing

1. **Cloudflare Project Think** — durable execution + sub-agents + persistent sessions + sandboxed code as standalone primitives, with an opinionated base class (`Agent`) that wires them. This is exactly our pattern (`AutonomousAgent` extends `Agent`). Steal: keep primitives standalone-usable so a fork can pick what it wants.
2. **Pydantic AI Capabilities** — bundles tools + hooks + instructions + model settings as one composable unit. Steal: our `ToolDefinition` should grow into `Capability` (tool + hooks + persona-fragment) so a Jira-clone can mount "comments capability" and get tool + render + system-prompt-fragment as one unit.
3. **AgentKit (Inngest)** — networks of agents with shared state, deterministic routers, durable steps. Steal: routines should be expressible as `step.do(...)` style durable units, not raw cron handlers.
4. **MemGPT self-managed memory tools** — agent reads/writes its own memory via tools. Steal: expose `agent_memory_read/write/list` as tools when archival self-management matters (vs. our current implicit recall hook).
5. **LangGraph time-travel via checkpointer** — every step is replayable. Steal selectively — full replay is overkill for our routines, but a "rerun-from-summary" affordance is cheap and high-value when debugging stuck routines.

### What "BuilderClaude wires an agent into a feature it just built" needs

For a future Jira-clone session where the building Claude Code session can compose agent capabilities into new features, the platform needs five things in place:

1. **Declarative agent definitions** — agents defined as data, not code. Today `AutonomousAgent` requires a subclass + DO migration. A `defineAgent({ persona, tools, schedule })` factory that produces a registered DO class on the fly would let BuilderClaude scaffold one without editing wrangler.jsonc.
2. **Capability registry** — domain bundles (tool + render + persona fragment + db schema). When BuilderClaude builds "tickets" it registers a TicketsCapability, and any agent can mount it.
3. **Routine declarative API** — `defineRoutine({ agentId, schedule, prompt, budgetUsd })` writes to `routines` table; cron sweeper picks it up. No new code needed.
4. **Inbox / Findings as first-class** — Findings table is consumed by an Inbox UI module; BuilderClaude's new feature gets an inbox surface for free by emitting Findings.
5. **MCP-as-output** — every capability auto-exposes itself over MCP (we already do this for ScratchpadMcpAgent). BuilderClaude wires an external Claude Code session into the new feature without code.

### Anti-patterns / lock-in risks

| Risk | Why it locks you in | Mitigation |
|---|---|---|
| Routine state lives in `AutonomousAgent.state` only | Can't migrate routines independently of agents; can't share routines across agent kinds. | Keep `routines` table separate from agent state — routine references agent, not vice versa. |
| Findings shape coupled to one renderer | Future UI rewrite means migrating findings. | Findings are `{kind, payload}` (free-form payload); renderers register per `kind`. |
| Capability registry hard-coded into starter | Forks can't add their own without editing core. | Auto-discovery from `clients/<name>/capabilities/*.ts` (we already do this for tools). |
| Cron-only triggers | Webhooks, manual, inter-agent excluded. | Routine `triggerKind` enum; cron is one of N. |
| Run summary becomes load-bearing for correctness | If summary is wrong, agent decisions degrade silently. | Always keep last K full runs alongside summaries; summary is hint, not source of truth. |

### Concrete recommendation: routine/run/finding shape

```ts
// routines table — declarative
{ id, agentId, userId, name, schedule, prompt, isActive, dailyBudgetUsd, createdAt }

// routine_runs table — audit + summary
{ id, routineId, agentId, userId, startedAt, finishedAt, outcome, summary, agentRunId }

// findings table — structured outputs of any agent run
{ id, sourceRunId, sourceRoutineId, agentId, userId, kind, payload, status, createdAt }
```

Findings drive the Inbox UI, the approvals queue, and any feature-specific renderer. Routines are pure declarative config — adding one is a row insert. Runs are the audit trail; summaries are the cross-run continuity primitive.

### How this connects to the Jira-clone vision

When BuilderClaude builds a Jira-clone on this starter, the platform already exposes: `defineAgent`, `defineRoutine`, capability registry (tools + render + db), Findings/Inbox surface, approvals queue, MCP auto-export, memory primitives (blocks + sliding window + Vectorize recall + run summaries), and observability (`agent_runs`, `routine_runs`). Building "auto-triage incoming tickets" becomes: register a TicketsCapability, define a triage agent with that capability mounted, define a routine that fires every 5 min with prompt "review new tickets, propose labels". No code edits to the starter — composition only. That's the test of whether the primitives are right: a feature that didn't exist when the starter was built can be assembled from the existing primitives without forking the starter.

Sources:
- [Letta — Agent Memory blog](https://www.letta.com/blog/agent-memory)
- [Letta Docs — memory management](https://docs.letta.com/advanced/memory-management/)
- [Anthropic — Memory Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
- [Anthropic — Managed Agents](https://www.anthropic.com/engineering/managed-agents)
- [LangGraph — Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [Cloudflare — Agent Memory](https://blog.cloudflare.com/introducing-agent-memory/)
- [Cloudflare — Project Think](https://blog.cloudflare.com/project-think/)
- [Inngest AgentKit](https://agentkit.inngest.com/overview)
- [Claude Code — Compaction](https://platform.claude.com/docs/en/build-with-claude/compaction)
