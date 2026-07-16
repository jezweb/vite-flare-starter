---
date: 2026-07-16
status: active
owner: jez+claude
topic: Four-agent platform-currency review — code vs Cloudflare July 2026. Synthesis + priorities.
supersedes-notes: corrections to cloudflare-platform-state-2026-07-16.md inline below
---

# Platform currency review — synthesis

Four parallel reviewers (deps / Agents SDK usage / AI layer / platform primitives), all claims
verified against live docs + our actual code. Full agent reports summarised here; corrections to
the morning research doc: **GLM-5.2 on CF is 262K ctx (not 1M)** · **Flagship is public beta, NOT
GA** (Jul 9 was auto-provisioning only; no pricing) · **base Agent.schedule() has NO timezone
support** (Think harness only — our localFireHour stays right) · detached runs are
`runAgentTool({detached})`, not "runTurn".

## P0 — security batch (same day, one PR)
better-auth 1.6.14→1.6.23 (replay-race fixes on one-time/reset tokens + SIWE nonces, Google `hd`
claim enforcement relevant to ALLOWED_AUTH_DOMAINS, D1 affected-row fix) · hono →4.12.30 (CORS
credential-reflection fix — our deny-by-default origin fn not directly exposed; upgrade anyway) ·
@cloudflare/vite-plugin →1.45.0 (ws CVE-2026-48779) · vitest-pool-workers →0.18.5 (D1-migration
SQL-injection fix). Then: tests + type-check + deploy + live auth smoke.

## P1 — the coordinated bumps
1. **AI SDK within-v6 alignment** (one changeset): ai →6.0.228, @ai-sdk/react →3.0.230 (**fixes a
   latent peer conflict**: we're on 3.0.198, ai-chat 0.9.3 floor is 3.0.204), @ai-sdk/mcp →1.0.62,
   providers latest 3.x, @openrouter/ai-sdk-provider **cap at 2.10.0** (3.0.0 = ai v7 peer),
   workers-ai-provider →3.3.1 (gains AI Gateway routing + auto-retry on 429/5xx).
   **AI SDK v7 is BLOCKED**: agents 0.17.4 + ai-chat 0.9.3 both peer-pin ai ^6. Watch their peers;
   v7 brings WorkflowAgent, native tool approvals (`needsApproval`→`toolApproval` rename hits our
   ToolDefinition contract), MCP Apps. `npx @ai-sdk/codemod v7` when unblocked.
2. **Cloudflare agents changeset** (one PR, tested together): agents 0.14.1→0.17.4 + ai-chat
   0.8.1→0.9.3 (currently exact-pinned) + voice 0.2.1→0.3.4 + wrangler →4.111. We're 3 months
   behind; this is pure hardening (10× fewer SQLite stream writes, orphaned-stream recovery, OOM
   circuit breakers, stall watchdog, isRecovering, RPC-survives-socket-churn). Breaking to audit:
   **0.16.0 default 30s RPC timeout** (audit long agent RPCs), WorkerTransport signature (unused),
   skills-with-scripts compile step (our SKILL.md prose unaffected). Wrangler 4.106 auth profiles
   = per-directory switching between the two Jezweb CF accounts.

## P2 — new capability builds (value order)
1. **Sandbox code-interpreter + doc-gen tools** (~1d) — deferral condition met (Sandboxes GA).
   `run_python` + `generate_document` as one-file ToolDefinitions; output shape already matches the
   terminal shape-renderer (zero client code). Sandbox id keyed (user, conversation); artifacts
   harvested to FILES under isOwnedR2Key; VITE_FEATURE_SANDBOX flag; note @cloudflare/sandbox
   0.12.x Session-Id requirement. Decide DO-exports timing together (§P3).
2. **Email delivery events via Queues** (~0.5d) — six lifecycle events live Jul 15; we have zero
   post-acceptance feedback today. New consumer + email_events/email_suppressions tables →
   bounce-suppression pattern. email-service provider only (document as such).
3. **AI quick wins** (~0.5d combined): add `@cf/zai-org/glm-5.2` (reasoner-role candidate) +
   Moondream 3.1 as documents.ts vision fallback; `pnpm models:refresh` (snapshot 3wks old); fix 4
   stale "K2.5" comments; batch-tasks dynamic retry-delay fn (verified syntax in review) + fix the
   window-of-8 comment (it's AI rate limits, not Workflow limits); investigate `x-session-affinity`
   prefix-cache header for the chat agent's big static prefix (verify provider header support);
   toMarkdown `output.format:"text"` at both call sites (verify syntax).
4. **AI Gateway: complement, don't replace** — unified billing covers only
   OpenAI/Anthropic/Google/Vertex/xAI/Groq; replacing OpenRouter orphans deepseek/qwen/mistral/z-ai.
   Do: (a) zero-effort — route the OpenRouter provider THROUGH the gateway (BYOK proxy) for
   logging/caching, one baseURL change; (b) optional AI_GATEWAY_ID route in resolveModel() for the
   frontier trio (spend limits, ZDR, one CF bill). Verify compat-endpoint streaming w/ AI SDK v6
   before building.

## P3 — deliberate migrations (own PRs, not urgent)
DO declarative `exports` (one-way! 11 live namespaces; decides how Sandbox's DO gets declared —
coordinate with P2.1; update DO_AGENTS.md/CLAUDE.md "4-piece wiring") · workers-types v4→v5 or
better: drop for `wrangler types` (worker-configuration.d.ts already exists) · TypeScript 7 (8-12×
faster tsc; tsconfig types field already explicit) · React Router v8 (`react-router-dom` package
name is DEAD; import-path swap, baseline satisfied) · pnpm pin 9.0.0→10.28.0 (stale/wrong) + add
engines field node>=22 · compatibility_date 2026-04-01→current · biome 2.5.4 + migrate ·
safe minor/patch sweep (vite 8.1.5, tailwind 4.3.2, playwright 1.61, sentry, codemirror, milkdown…).

## Adopt-vs-keep verdicts (hand-rolled vs upstream)
KEEP: skills registry (SDK SkillRegistry lacks per-user scoping; steal `run_skill_script` idea) ·
approvals D1 queue (product surface; SDK's waitForApproval noted in docs) · routines localFireHour ·
agent-memory.ts (managed Agent Memory = private beta waitlist; swap boundary already in file) ·
knowledge FTS5 (AI Search = future per-org corpus sibling, never a replacement) · feature-flags D1
module (Flagship beta; add as targeting/rollout sibling at GA) · tool-search (Code Mode = CF's
alternative answer; doc note only).
ADOPT LATER/PROTOTYPE: withVoice full-duplex live mode beside PTT (barge-in, streaming STT) ·
sub-agents on DO facets (kills routines' env-binding constraint) · MCP elicitation (blocked on
migrating user-mcp off @ai-sdk/mcp createMCPClient → this.mcp manager) · Think Session API
branch-on-regenerate prototype (works without Think) · fibers (watch — kills the stale-run sweeper
failure class).

## Hygiene / stale docs
- `.claude/rules/chat-usechat-initial-messages.md` describes code that no longer exists (hook now
  useAgentChat + getInitialMessages) — retire/rewrite.
- agents docs deep links moved (api-reference/* → runtime/*) — sweep docs/AGENTS.md, DO_AGENTS.md.
- zod-to-json-schema likely removable (zod 4 native z.toJSONSchema — verify call sites).
- KV: repo clean; one line in PLATFORM_SERVICES.md for forks (legacy REST routes EOL Oct 15).
- doctor:models: CLEAN (verified run). No deprecated @cf/ IDs.

## Watchlist
agents/ai-chat peers moving to ai ^7 · Flagship GA + pricing · Agent Memory waitlist → GA ·
AI Search namespaces provisioning-by-API + pricing · Think graduation (fibers, Session API) ·
@base-ui 1.6 OTPField import path (verify during bump).
