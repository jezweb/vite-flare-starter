---
date: 2026-07-18
status: complete
owner: claude
---

# Brains-trust — Code Mode pilot (`code_mode` tool, @cloudflare/codemode 0.4.3)

Panel: `openai/gpt-5.6-sol` + `google/gemini-3.1-pro-preview` via OpenRouter
(~19K tokens). Scope: `code-mode.ts`, chat-agent wiring hunk, CORE_TOOL_NAMES
addition, client renderer, plus the live proof-of-done narrative. No
Criticals, no Highs.

## Live findings that predated the panel (fixed during build)

| Finding | Fix |
|---|---|
| Naive exposure = 98 tools / 69KB description (~17K tok/turn) — inverts the cost case entirely; also correlated with stalled turns. | Curated 22-tool read/compute allowlist → 13.7KB (~3.4K tok/turn), measured via `code_mode_built` log. |
| codemode's `runCode` THROWS on sandbox errors (zod rejection of composed-tool args — live: `q: ""`); the thrown tool error killed the whole chat stream (`chat_stream_error`). | Wrapper converts to `{result:{error,hint}}` tool output — model reads it and self-corrects. Live-verified: 2 failed compositions → self-fix → success. |
| Models call `codemode.get_server_time()` (no args) → zod "received undefined" → wasted retries. | Description now mandates `fn({})`. Retries went 2 → 0 on the next live run. |

## Panel: accepted → fixed

| Finding | Reviewer | Fix |
|---|---|---|
| **Medium — no call budget inside a composition.** Generated code can `Promise.all()` an unbounded RPC burst (web_search × 50) within the 60s timeout; final result bypasses the toAiSdkTool truncation gate. | GPT-5.6 | Per-turn budget: 40 sandbox tool calls (counter spans the turn's executions; build is per-turn), plus 30KB serialized-result cap with a model-actionable truncation note. |
| **Low — renderer duck-types legitimate `{error}` results as sandbox failures.** Code returning `{error: "no records matched"}` as data would render as "Composition failed". | Gemini | Error-lift now narrows on the wrapper's guaranteed `hint` field. |

## Panel: rejected (with evidence)

- **"`filterTools` is never applied — needsApproval guarantee is factually
  untrue"** (Gemini Medium): wrong. `createCodeTool()` applies `filterTools`
  internally — verified in `@cloudflare/codemode` dist
  (`const filtered = filterTools(provider.tools)` in `ai.js`). The comment
  now cites the locus so future readers don't re-litigate.
- **"Raw exception messages exposed to transcript"** (GPT-5.6 Low): normal
  per-tool errors already reach the model/transcript via the AI SDK's
  tool-error parts; code_mode does not widen exposure. Not actioned.
- **Type assertion on wrapped execute** (Gemini Low): acknowledged tradeoff,
  reviewer themselves called it acceptable. Not actioned.

## Measurements (the pilot's stated goal)

- code_mode active: +13.7KB (~3.4K tokens) per turn, flat.
- Equivalent find_tools flow for a 3-tool task: 1 find_tools round-trip +
  3 tool-call round-trips, every intermediate result entering context.
  code_mode collapses to 1 round-trip with only the final value in context.
- Break-even is roughly "turns that compose ≥2-3 tools with non-trivial
  intermediate payloads"; ordinary chats pay the 3.4K for nothing — hence
  opt-in `CODEMODE=true`, default OFF.
