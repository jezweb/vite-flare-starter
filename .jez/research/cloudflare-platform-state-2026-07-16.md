---
date: 2026-07-16
status: active
owner: jez+claude
topic: Cloudflare developer platform state-of-play (fundamentals refresh, all claims verified live 2026-07-16)
---

# Cloudflare platform — state of play, July 2026

Headline event: **Agents Week 2026 (Apr 13-17)** — this year's dev event was agents-focused.
Index: https://blog.cloudflare.com/agents-week-in-review/

## Agents SDK (`agents` 0.17.4)

- **MCP elicitation** (0.17.4, Jul 13) — structured user input / consent mid-tool-call; OAuth re-auth on mid-session 401.
- **Background sub-agents** (0.17.0) — detached agent-tool runs, durable completion callbacks, `reportProgress()`, typed action ledger; unified `runTurn()`.
- `useAgentChat` via `agents/chat/react`.
- **In-SDK Agent Skills catalog** (Jun 2), Telegram channel, scheduled tasks with timezones — SDK converging on things the starter hand-built.
- Browser rebuild: single `browser_execute` tool, Live View URLs, rrweb recording.
- Durable-execution hardening: OOM retry budgets, orphan-message recovery, SQLite write batching (~10× fewer rows).

**Project Think (preview)** — layer ON TOP of Agents SDK (`@cloudflare/think`): fibers
(checkpointed crash-recoverable execution), Session API (tree messages, forking, compaction, FTS —
overlaps ChatAgent), execution ladder (Tier 0 file ops → Tier 4 full OS), sub-agents with own
SQLite + typed RPC. `@cloudflare/ai-chat` stays compatible; adopt selectively.
https://blog.cloudflare.com/project-think

**Voice**: `@cloudflare/voice` experimental — `withVoice(Agent)` full conversations (we only use
`withVoiceInput`), `useVoiceAgent` hook, built-in Deepgram Flux/Nova-3 STT + Aura TTS, no external
keys. Directly relevant to our voice mode. https://blog.cloudflare.com/voice-agents

## Sandboxes + Containers — GA (Apr 13)

- Sandboxes GA on Workers Paid: `exec`, `gitClone`, `runCode` (persistent Python/JS/TS),
  `startProcess`, `exposePort`, PTY terminal, `watch`, disk snapshots to R2, S3-compatible mounts.
  https://blog.cloudflare.com/sandbox-ga/
- Containers GA with **Active CPU pricing** (pay actual CPU, not idle).
- **Outbound Workers**: zero-trust egress proxy with credential injection (agent never sees keys).
- **Unblocks the deferred artifact/document-generation module** (memory: needed Containers) and a
  code-interpreter chat tool.

## Dynamic Workers — open beta (Mar 24)

Worker spawns Workers with runtime-specified code in V8 isolates; ~100× faster boot than
containers. Built for Code Mode. $0.002/unique worker/day (waived in beta; re-verify — via press
summaries). `@cloudflare/dynamic-workflows` runs Workflows inside them.

## Durable Objects

- **SQLite backend mandatory for new namespaces** (Jul 9).
- **Declarative `exports` replaces imperative migrations** (Jul 4) — changes our "4-piece DO wiring"
  docs; verify syntax when next touching wrangler.jsonc.
- **DO Facets GA** — isolated sub-SQLite per parent DO (sub-agents ride on this).
- `apac-ne`/`apac-se` location hints (Jun 19 — Sydney relevant); outbound connect()/WS blocks
  eviction ≤15min; `evictDurableObject` test helper in cloudflare:test.

## Workflows V2 — GA

50k concurrent instances (was 4.5k), 300 creates/sec, 2M queued. Zero-code migration. Dynamic
retry-delay functions (Jul 9). → batch-tasks "windows of 8" conservatism can be revisited.
https://blog.cloudflare.com/workflows-v2

## Workers AI + AI Gateway

- **Unified inference** (Apr 16): AI Gateway = 70+ models across 12-14 providers callable via the
  same `env.AI.run()` binding, **unified billing on the CF account**, spend limits, unified REST
  API. Direct challenge to our OpenRouter-for-everything layer — evaluate (check frontier/Anthropic
  coverage live per model). https://blog.cloudflare.com/ai-platform
- New models 2026: Kimi K2.6 (262k ctx, thinking; our default), **Kimi K2.7-Code** (Jun 12),
  **GLM-5.2** (1M ctx, agentic coding), Gemma 4 26B, **Moondream 3.1** (fast vision, Jul 8),
  Nemotron 3 Super, FLUX.2 [klein] (image gen+edit), EmbeddingGemma, Qwen3-Embedding.
- **Churn warning**: K2.5 introduced Mar 19, deprecated May 30 (~10 weeks). May 30 retirement wave
  incl. older Llama/Gemma. → run `pnpm doctor:models` now; consider adding GLM-5.2 + Moondream 3.1.
- Async batch API + prefix-caching discounts (Mar 19); toMarkdown customization + `output.format:
  "text"` + GIF/BMP (Jul 10).

## New managed primitives overlapping starter modules

| CF product | Status | Overlaps |
|---|---|---|
| **Agent Memory** (managed extraction + 5-channel retrieval w/ RRF) | Private beta (waitlist) | `agent-memory.ts` hybrid recall |
| **AI Search** (AutoRAG renamed; per-tenant namespaces binding, BM25+vector) | Open beta, free | `knowledge` FTS5 |
| **Flagship** (native feature flags, KV+DO, sub-ms) | GA (Jul 9) | `feature-flags` module |
| **Artifacts** (git-compatible versioned storage for agents) | Beta | skills/config-diff history |
| **Browser Run** (Live View, human takeover, recordings, 4× concurrency) | GA | future browsing tool |
| **Code Mode** (`@cloudflare/codemode`, DynamicWorkerExecutor) | New | tool-search (different answer to same token problem) |

## Email Service

Sending = public beta since Apr 16 (binding + REST + SMTP:465, Workers Paid); Routing = GA.
**Jul 15: delivery/bounce lifecycle events via Queues** — natural add for our email provider
observability. https://developers.cloudflare.com/email-service/

## D1 — quiet

Nothing major since Nov 2025. `migrations_pattern` for nested dirs (Drizzle layouts, May 29);
budget alerts. Limits unchanged (10GB paid / 500MB free). Strategic signal: agent-era storage
investment is going into DO SQLite/facets, not D1.

## Storage/infra misc

- Vectorize: 10M vectors/index, topK 50, index updates <30s.
- R2: all action in Data Catalog (Iceberg); dashboard empty-bucket/delete-folder QoL.
- Hyperdrive: pool observability; PlanetScale Postgres/MySQL billable through CF (Jun 18).
- **KV legacy namespace API deprecated — migrate by Oct 15, 2026.**
- New **`cf` CLI** (3,000+ API ops, Local Explorer). `workers-types` v5 (Jul 3). **Wrangler auth
  profiles** (Jul 2 — per-directory account switching; useful for Jez's two accounts).
  `wrangler deploy --temporary` + Temporary Accounts API; Cloudflare Drop (account-less static sites).
- Agents Week security: Cloudflare Mesh (private networking for agents), Managed OAuth for Access
  (RFC 9728), resource-scoped API tokens. Registrar API beta (domain registration from code).

## Action shortlist for the starter

1. Run `pnpm doctor:models` (May 30 retirement wave; Gemma-3-12B deprecated).
2. Evaluate AI Gateway unified inference vs OpenRouter layer.
3. Sandboxes GA → build the deferred code-interpreter / document-generation module.
4. Adopt DO declarative `exports` next time wrangler.jsonc is touched; update DO-wiring docs.
5. Deliberate "adopt vs keep ours" pass: SDK skills catalog / sub-agents / useAgentChat / Project
   Think sessions vs our skills, routines, ChatAgent.
6. Join Agent Memory waitlist; watch Flagship + AI Search vs our modules.
7. Email delivery events via Queues for provider observability.
8. Revisit batch-tasks concurrency window (Workflows V2 headroom).
9. KV legacy API check in forks before Oct 15, 2026.
