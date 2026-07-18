---
date: 2026-07-17
status: active
owner: jez+claude
topic: What "fully embracing the Cloudflare agents stack" would mean for vite-flare-starter
related: "#113"
---

# Fully embracing the CF agents stack — research + adoption assessment

Trigger: Jez asked (2026-07-17) what full adoption of the new platform
surface — Think harness, Code Mode, fibers, Sessions, agent skills,
Sandbox-as-tool — would mean vs the starter's hand-built equivalents.
Researched from live docs (agents llms.txt corpus) + npm registry via four
parallel doc-readers; synthesised below. All version/API facts verified
live 2026-07-17.

## TL;DR

1. **We are already on the blessed stack** — `agents` 0.17.4 +
   `@cloudflare/ai-chat` 0.9.3 + AI SDK v6 is exactly what every new CF
   package peers on. "Embracing the stack" is incremental adoption inside
   the config we run, not a migration.
2. **AI SDK 7 is an anti-goal right now** — `agents`, `ai-chat`, `think`,
   `codemode` all pin `ai ^6`. The v7 roadmap item flips from "blocked on
   ai-chat" to "wait for the whole CF line to move together".
3. **AIChatAgent is not deprecated.** Think is a sibling harness on the
   same primitives — and it is **not Workers-AI-locked** (`getModel()`
   returns any AI SDK `LanguageModel`; OpenRouter works unchanged).
4. The platform has now shipped first-party versions of roughly **half of
   what this starter hand-built** (skills, approvals, scheduling,
   sub-agents, chat recovery, FTS sessions) — plus four genuinely new
   capabilities we have no equivalent for (fibers, durable Code Mode,
   detached agent-tools, messenger channels).
5. The two places the starter is **ahead of the platform** and should not
   migrate: the one-file ToolDefinition contract with per-tool React
   renderers (Code Mode collapses per-call UI), and Vectorize hybrid
   memory (Sessions memory is FTS/keyword, not semantic).

## Where the starter stands today

| Layer | Starter implementation | Package facts |
|---|---|---|
| Agent runtime | `agents` 0.17.4 — every DO extends SDK `Agent` | matches latest |
| Chat harness | `@cloudflare/ai-chat` 0.9.3 (`AIChatAgent`) + ~1,400-line `ChatAgent` | matches latest |
| AI SDK | `ai` ^6.0.228 + `@ai-sdk/react` v3 (custom transport) + OpenRouter | the blessed line |
| Tools | ~115 tools on one-file `ToolDefinition` (zod + React renderer), `find_tools` disclosure | — |
| Sandbox | `@cloudflare/sandbox` 0.12.3 (`run_python`/`generate_document`) | matches latest |
| Recurring agents | Routines engine (cron sweeper + channels-as-tools + skills + hooks) | — |
| Approvals | D1 `pending_approvals` + Inbox UI + `requestApproval` | — |
| Skills | R2/GitHub/bundled SKILL.md registry + editor + AI rewrite | Claude-Code format |
| Memory | Vectorize hybrid recall (sim+importance+recency) | — |
| Search | D1 FTS5 (conversations, entities, knowledge) | — |
| Artifacts | D1 versioned artifacts + WorkspacePanel + share-token publish | shipped 2026-07-17 |

## Platform capability map (from the four reader briefs)

### Think harness (`@cloudflare/think` 0.13.0 — experimental)

- `class X extends Think<Env>`; only `getModel()` required — returns an AI
  SDK v6 `LanguageModel`. **Explicitly not Workers-AI-exclusive**; per-turn
  model swap via `beforeTurn`. Our OpenRouter layer carries over unchanged.
- Built-in: agentic loop, retries + tool repair, stream resumption,
  DO-SQLite persistence, compaction + context-overflow recovery, **durable
  recovery on DO eviction mid-stream** (`chatRecovery: true` default —
  note: AIChatAgent has the same option defaulting to `false`, so some
  recovery is available to us TODAY without Think).
- **Workspace**: 8 file tools + network-disabled `bash` over a virtual FS
  in DO SQLite (R2 spillover) — agent scratch space without a container.
- **Actions**: `action()` = tools + **idempotency ledger** + approvals
  (inline `approval-gated` or parked `durable-pause`;
  `approveExecution/rejectExecution/pendingApprovals`) + declarative
  permissions (`authorizeTurn`/`authorizeAction`) + reply attachments.
- **Channels/messengers**: per-channel policy (own prompt/tools/step caps),
  Telegram/Slack webhook wiring, `deliverNotice()` push without a turn.
- **Scheduled tasks**: NL DSL ("every weekday at 9:00 in
  Australia/Sydney"), prompt-turns or deterministic handlers,
  at-least-once + idempotency keys.
- **ThinkWorkflow**: `step.prompt(prompt, zodSchema)` — a full agentic turn
  as a durable Workflow step with structured output.
- **Client friction**: Think wants `useAgentChat` to own transcript state;
  the docs' escape hatch for custom clients is `AIChatAgent` — what we
  already run. Our bespoke transcript (tool renderers, `_ui`, artifacts
  panel) is the main reason not to swap ChatAgent wholesale.

### Runtime (stable core unless marked)

- **Fibers** (`runFiber`/`startFiber`/`keepAlive` + `ctx.stash()` +
  `onFiberRecovered`): work that survives DO eviction. NOT transparent
  replay — you checkpoint JSON snapshots and hand-roll resume in the
  recovery hook. Net-new capability; nothing in the starter does this.
- **Queue + retries**: SQLite FIFO `queue()` + full-jitter `retry()`;
  no dead-letter queue; queued-task retries head-of-line block.
- **runWorkflow + waitForApproval**: agent launches a real Workflow;
  `waitForApproval(step, {timeout:"7 days"})` pauses durably;
  `approveWorkflow`/`rejectWorkflow` from the agent; progress callbacks.
  Platform-native human-in-the-loop with multi-day pause.
- **schedule/scheduleEvery**: cron/date/interval, SQLite-backed,
  **overlap-skip** on `scheduleEvery` (our cron sweeper hand-rolls this).
- **Sub-agents**: `subAgent(Cls, name)` — child DOs with isolated SQLite +
  typed RPC + `onBeforeSubAgent` access control; recursive abort/delete.
- **Agent Skills** (`agents:skills`): SKILL.md-compatible progressive
  disclosure — bundled (Vite plugin) + `skills.r2()` sources, catalog in
  prompt, bodies on demand, plus `run_skill_script` (TS/JS/Python/Bash,
  30s cap). Near-exact match for our registry.
- **Sessions** (`agents/experimental/*`): tree-structured messages
  (branching!), LLM-writable context blocks, non-destructive compaction,
  FTS5 search, multi-session manager with fork + usage tracking. Would
  replace our D1-projection chat persistence wholesale — experimental.
- **Agents-as-tools** (experimental): `agentTool`/`runAgentTool` with
  **detached durable callbacks** surviving eviction/deploys, progress
  milestones, budget caps. Direct upgrade path for researcher→writer
  handoff and parts of batch-tasks.
- **Observability**: structured events on `diagnostics_channel`
  (rpc/state/chat/schedule/workflow/mcp), consumable from a Tail Worker
  with zero agent-side code.

### Code Mode (`@cloudflare/codemode` 0.4.3 — experimental, bundled inside `agents`)

- Model writes ONE JavaScript block composing many tool calls; runs in an
  isolated dynamic Worker (Worker Loader binding), network blocked,
  credentials never enter the sandbox; connectors cross via Workers RPC.
- **Durable runtime**: execution history, pause-on-approval with
  **replay-based resume** (completed calls return cached results),
  `rollback()` via per-connector `revert()`, saved snippets.
- `codemode.search()`/`describe()` = built-in progressive tool discovery —
  the platform's answer to large catalogs, one layer below our
  `find_tools`.
- `McpConnector` funnels an entire MCP server through one code tool.
- **The catch for us**: composed calls return ONE result — per-tool React
  renderers, shape-tier upgrades, `_ui` interactive elements, and per-tool
  telemetry have no per-call hook. Stateless `createCodeTool` silently
  DROPS approval-gated tools (unusable); the durable ToolSetConnector maps
  `needsApproval` → pause (usable).

### Other tools layer

- **Sandbox-as-tool**: `getSandbox(env.Sandbox, this.name)` — workspace
  persists across turns. We already run this via chat tools.
- **Browser Run**: CDP tools (`browser_execute/markdown/extract/links/
  scrape`) riding the Code Mode loader machinery.
- **AI Search**: managed RAG (R2/website indexing + retrieval). BYO
  Vectorize remains the right call for our hybrid memory; AI Search is the
  option for managed KB retrieval in forks.
- **Payments** (x402/MPP): agentic payments protocols — watch-only for us.

## Adopt / align / keep — the decision table

| Area | Call | Rationale |
|---|---|---|
| **Skills loading layer** | **ADOPT** (`agents:skills` + `skills.r2()`) | Near-exact format match; gains `run_skill_script`. Keep our editor/AI-sparkle/config-diff UI on top. Stable core. |
| **Chat recovery** | **ADOPT NOW** — set `chatRecovery: true` on our AIChatAgent | Available on our existing base class today; Think just defaults it on. Cheap resilience win. Verify behaviour with our custom transport first. |
| **Routines timer plumbing** | **ALIGN** — move per-routine firing to `scheduleEvery` (overlap-skip, SQLite persistence) | Keep the Routines product layer (config, channels-as-tools, inbox emission) — no platform equivalent. |
| **Approvals backend** | **ALIGN** — new workflow-shaped approvals on `waitForApproval`; Think Actions' ledger when we pilot Think | Keep the D1 queue + Inbox UI as the cross-cutting attention surface. |
| **Multi-agent handoff / batch fan-out** | **PILOT** agents-as-tools detached runs | Durable `onFinish` beats D1 polling; experimental — one feature first. |
| **Fibers** | **PILOT** on one long-running surface (research turn / mirror refresh) | Net-new durability; hand-rolled checkpoint/resume semantics need a worked example before patterning. |
| **Think harness** | **PILOT as a sibling agent** (AdminAgent successor or a messenger-facing agent) | Server-side wins (Actions, scheduled DSL, Telegram/Slack channels, recovery) without touching ChatAgent or the client. Experimental. |
| **Code Mode** | **PILOT behind a flag** — durable ToolSetConnector over long-tail/shape-tier tools only | Composition + context savings for data-shaping work; bespoke-renderer tools stay direct. Stateless variant unusable (drops approval-gated tools). |
| **Sessions** | **HOLD** until it leaves experimental or the chat module is due a rebuild | Swaps the whole persistence model; branching + compaction are compelling but not bolt-on. |
| **Client `useAgentChat`** | **HOLD** | Our transcript UI + tool renderers + WorkspacePanel are the product moat; no bring-your-own-client seam documented. |
| **ToolDefinition contract** | **KEEP** | Platform has no co-located render metadata; per-tool UX is our differentiator. |
| **Vectorize hybrid memory** | **KEEP** | Sessions memory is keyword/FTS; our semantic recall has no platform equivalent. We're ahead. |
| **AI SDK 7 migration** | **REVERSE-HOLD** | Whole CF line pins ai ^6; chase nothing until agents/ai-chat/think move together. |
| **AI Search / Payments** | **WATCH** | Document as fork options; no starter change. |

## Recommended sequencing

1. **Quick wins (1 session):** `chatRecovery: true` + diagnostics-channel
   observability into `agent_runs` + docs updates (AI SDK 7 stance,
   AIChatAgent positioning). Zero-risk, stable APIs.
2. **Skills migration (1 session):** swap registry loading to
   `agents:skills` sources, keep UI; adds script execution to every skill.
3. **Think pilot (1–2 sessions):** one new agent class (messenger-facing or
   AdminAgent v2) on Think — exercises Actions/approvals ledger, scheduled
   DSL, Telegram channel. Coexists in the same Worker.
   ✅ **DONE 2026-07-18** — `ThinkPilotAgent` (`server/modules/think-pilot/`,
   flag `VITE_FEATURE_THINK_PILOT`, page `/dashboard/think-pilot`).
   Live-verified: streaming turn, `record_note` ledger action (idempotency
   enforced — same key + different input → `ActionKeyConflict`),
   approval-gated `send_notification` (approve → real D1 notification row),
   D1 `userSkillSource` mounted (one skills store, two harnesses),
   `morning-brief` scheduled-DSL task reconciled on boot. Telegram channel
   deferred (no bot token in the starter; `getMessengers()` is the seam).
   Note: Think's `workspaceBash` must stay `false` while the `just-bash`
   stub alias exists.
4. **Code Mode pilot (1 session, flagged):** durable runtime over the
   shape-tier long-tail; measure context savings vs `find_tools`.
5. **Fibers + agents-as-tools pilot (1 session):** rework researcher→writer
   on detached runs; fiber-checkpoint one long loop.
6. **Hold reviews:** revisit Sessions + useAgentChat when Think/Sessions
   graduate from experimental, or at the next major chat-module rebuild.

Pin exact versions throughout; treat every 0.x bump as breaking (CI +
brains-trust gate on upgrades).

## Reader briefs (raw)

Archived in git history of this file's drafting session; key facts inlined
above. Sources: developers.cloudflare.com/agents/* (llms.txt corpus),
npm registry, all fetched 2026-07-17.
