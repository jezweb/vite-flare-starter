---
date: 2026-07-18
status: complete
owner: claude
---

# Brains-trust — agents-as-tools + fibers pilot (adoption step 5)

Panel: `openai/gpt-5.6-sol` + `google/gemini-3.1-pro-preview` via OpenRouter
(~43K tokens). Scope: `autonomous-agent.ts` (AgentToolChildAdapter + fiber
wrap + recovery hook), `researcher-agent.ts` (runAgentTool rework +
`onWriterFinished`). No Criticals.

## Cross-validated (both reviewers) → fixed

| Finding | Fix |
|---|---|
| **High — `onWriterFinished` swallowed delivery failures, defeating at-least-once.** Catching the D1 insert error and returning cleanly consumes the framework's delivery lease; a transient failure silently loses the notification forever. | Rethrow after logging — the lease stays unstamped, the reconcile backbone re-delivers, and the deterministic notification id makes eventual success idempotent. Also removed the try/catch around the child-inspection fetch so a transient fetch failure retries instead of permanently degrading to the 280-char summary. |

## Single-reviewer, accepted → fixed

| Finding | Reviewer | Fix |
|---|---|---|
| **High — cancellation only flipped the SQLite row; the model loop and tools kept executing.** | GPT-5.6 | `RunOnceInput.abortSignal` → streamText; `startAgentToolRun` holds an AbortController per run (chained to the parent's awaited signal); `cancelAgentToolRun` aborts it. Cooperative: a tool already mid-execute finishes; the loop stops between steps. |
| **Medium — child facet didn't enforce owner match.** A pre-owned facet reached with a different `userId` would silently run with the existing owner's tools + BYOK keys. | GPT-5.6 | Explicit mismatch guard at the child boundary — throws (row → 'error') instead of running. Defence-in-depth: framework facets are fresh per runId, so this is a can't-happen-via-the-framework path. |
| **Medium — recovery hook swallowed D1 failures, re-stranding the audit row it exists to finalise.** | GPT-5.6 | try/catch removed — a failure rethrows so the framework retries the hook; poison rows bounded by `fiberRecoveryMaxAgeMs`. |

## Rejected (with rationale)

- **"Truncated-fallback notification can never be replaced"** (GPT-5.6
  Medium): mostly mooted by the inspection-fetch rethrow above. The residual
  case — inspection returns cleanly but without text — delivers the 280-char
  summary, which beats no notification; accepted trade-off, documented in
  the handler comment.
- **"Move input-parse errors inside the lifecycle so they land in the child
  row"** (Gemini Low): the parent handles a rejected `startAgentToolRun`
  cleanly on both paths (verified in SDK dist — awaited returns an error
  result; detached dispatch fails synchronously with no orphan row). A
  pre-row throw is the more honest signal for a malformed dispatch.
- Gemini's Medium was a self-answering observation ("…it is resilient") —
  no action.

## Live verification (both before and after fixes)

- **Awaited**: researcher → `runAgentTool(WriterAgent)` → facet child →
  polished text returned inline on production Cloudflare. Facets +
  `ctx.exports` work on compat date 2026-04-01; class names survive the
  worker bundle (`var WriterAgent = class extends AutonomousAgent` — name
  inferred from the variable binding).
- **Detached**: dispatch → researcher turn ends immediately → writer
  completes → durable `onWriterFinished` fires → notification
  `writer-run-<runId>` with the full write-up (arrived < 8s after the
  parent turn in both runs).
- 269 unit tests + tsc green before and after panel fixes. One transient
  500 observed on a single dispatch (identical retry succeeded, no
  exceptions in tail) — consistent with an upstream model failure
  propagating through the route's existing error path, not a regression.

## Platform facts worth keeping (verified in agents@0.17.4 dist)

- `runAgentTool` children are **facet sub-agents named by runId**, resolved
  from `ctx.exports`; the framework rejects children lacking the 4-method
  adapter ("Use a Think subclass or an AIChatAgent subclass") — but the
  contract is public, and implementing it once on AutonomousAgent makes
  every autonomous agent dispatchable.
- `startAgentToolRun` is awaited **before** the detached branch — it must
  dispatch (keepAliveWhile, not awaited) and return `status: 'running'`
  immediately. Awaited parents block on `tailAgentToolRun`'s stream
  closing, then read the terminal row via `inspectAgentToolRun`.
- Detached `onFinish` is referenced by **method name** (schedule-style,
  eviction-surviving), delivered at-least-once via claim + lease — handlers
  must be idempotent and must **throw on failure** to get re-delivery.
- Fiber recovery hooks that throw are retried, bounded by
  `fiberRecoveryMaxAgeMs` — "rethrow on transient failure" is the correct
  idiom there too.
