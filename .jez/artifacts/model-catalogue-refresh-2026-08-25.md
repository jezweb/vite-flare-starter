---
date: 2026-08-25
status: active
owner: claude
---

# Model Catalogue Refresh — 2026-08-25

## Summary

Monthly automated refresh of `src/shared/data/models-snapshot.json` from
[models.flared.au](https://models.flared.au) (OpenRouter) and
[ai.flared.au](https://ai.flared.au) (Workers AI).

**Note:** `pnpm models:refresh` could not be run (tsx not in devDependencies),
so the script was replicated in Python, fetching from the same upstream URLs
the script uses. Output format matches the existing snapshot structure.

---

## Catalogue Diff

| Metric | Before | After |
|---|---|---|
| Total models | 127 | 145 |
| Snapshot date | 2026-07-25 | 2026-08-25 |
| OpenRouter models | ~108 | 116 |
| Workers AI text-gen | ~19 | 29 |

### Added (32 models)

| Model ID | Notes |
|---|---|
| `anthropic/claude-opus-5` | Claude 5 family — flagship |
| `anthropic/claude-sonnet-5` | Claude 5 family — balanced |
| `anthropic/claude-fable-5` | Claude 5 family — creative |
| `anthropic/claude-opus-5:batch`, `claude-sonnet-5:batch`, `claude-fable-5:batch` | Batch variants |
| `deepseek/deepseek-v4-pro-0813` | Dated checkpoint, 1M ctx |
| `deepseek/deepseek-v4-flash-0731` | Dated checkpoint, 1.3M ctx |
| `deepseek/deepseek-v4-flash-vision-exp` | Experimental vision model |
| `@cf/deepseek-ai/deepseek-v4-flash-0731` | Workers AI — DeepSeek V4 Flash dated |
| `@cf/deepseek-ai/deepseek-v4-pro-0813` | Workers AI — DeepSeek V4 Pro dated |
| `google/gemini-3.7-flash` | New Gemini, 1M ctx |
| `google/gemini-3.5-flash-lite:batch`, `gemini-3.6-flash:batch`, `gemini-3.7-flash:batch` | Batch variants |
| `x-ai/grok-4.6` | Updated Grok, 500K ctx |
| `qwen/qwen3.7-flash` | Qwen 3.7 Flash |
| `qwen/qwen3.8-max` | Qwen 3.8 Max, 1M ctx |
| `qwen/qwen3.8-2.4t-a95b` | Qwen 3.8 large MoE |
| `@cf/qwen/qwen3.8-27b` | Workers AI — Qwen 3.8 27B |
| `z-ai/glm-5.3` | Updated Z.AI / ZhipuAI model |
| `z-ai/glm-5.2:batch` | Batch variant |
| `nvidia/nemotron-3-ultra-550b-a55b:batch`, `nvidia/nemotron-3.5-lightning` | NVIDIA models |
| `openai/gpt-5.6-*` | 6 new GPT-5.6 variants (luna/sol/terra, pro/standard) |
| `minimax/minimax-m3:batch` | MiniMax |
| `moonshotai/kimi-k2.7-code:batch` | Kimi code model batch |
| `bytedance-seed/seed-2-1-turbo`, `seed-2.0-code` | ByteDance Seed models |

### Removed (14 models)

| Model ID | Impact |
|---|---|
| `anthropic/claude-opus-4.8` | ⚠️ **BREAKING**: Referenced in `src/shared/config/models.ts` — needs manual update to `claude-opus-5` |
| `anthropic/claude-opus-4.7-fast` | Low impact — fast variant |
| `anthropic/claude-opus-4.8-fast` | Low impact — fast variant |
| `x-ai/grok-4.3` | Superseded by `grok-4.20` (already in use) |
| `x-ai/grok-build-0.1` | Experimental — removed |
| `qwen/qwen3.6-27b`, `qwen3.6-35b-a3b`, `qwen3.6-flash` | Superseded by qwen3.7/3.8 series |
| `qwen/qwen3.6-max-preview`, `qwen3.7-max` | Preview/max removed |
| `qwen/qwen3.5-plus-20260420` | Dated checkpoint removed |
| `google/gemini-3.5-flash`, `gemini-3.1-flash-lite` | Superseded by 3.6/3.7 |
| `openai/gpt-chat-latest` | Alias removed |

---

## Build Status

✅ `pnpm type-check` — **passed** (exit 0)  
✅ `pnpm build` — **passed** (exit 0, 6.75s)

Committed: `1bab38d chore(models): refresh catalogue snapshot from flared.au`  
Pushed to: `main`

---

## New Direct-Provider SDK Candidates

Currently wired direct providers: `anthropic`, `openai`, `google`, `deepseek`, `mistral`, `x-ai`
Providers in our catalogue needing direct wiring: **qwen**, **z-ai**

### Considered and Skipped

| Package | Provider | Reason |
|---|---|---|
| `@ai-sdk/alibaba` v2.0.35 | Qwen (Alibaba Cloud) | **Previously deliberately skipped** — Qwen runs free on Workers AI as `@cf/qwen/qwq-32b` + `@cf/qwen/qwen3.8-27b`. Direct SDK adds cost/key complexity without benefit when free WAI tier covers the main Qwen use case. |
| `@ai-sdk/cohere` | Cohere | Not in our OpenRouter catalogue — no models to route |
| `@ai-sdk/groq` | Groq | Not in our catalogue |
| `@ai-sdk/perplexity` | Perplexity | Not in our catalogue |
| `@ai-sdk/togetherai` | Together AI | Not in our catalogue |
| `@ai-sdk/deepinfra` | DeepInfra | Not in our catalogue |
| `@ai-sdk/fireworks` | Fireworks | Not in our catalogue |

No new direct-provider SDK candidates are recommended this month.

---

## Open Questions for Human

1. **`anthropic/claude-opus-4.8` removed** from OpenRouter — the comment in
   `models.ts` says `"4.6 retired from catalogue 2026-05"` and points to 4.8
   as the replacement. Now 4.8 is gone too. Recommend updating to
   `anthropic/claude-opus-5` (same 1M ctx, now in catalogue). The comment
   about cost (`$5/$25 per Mtok`) will also need updating.

2. **Claude 5 family** (`claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`)
   are now in the catalogue. Consider whether `claude-sonnet-5` or
   `claude-haiku-4.5` → `claude-haiku-5` should replace `claude-haiku-4.5`
   (still in catalogue, still supported).

3. **`@cf/deepseek-ai/deepseek-v4-pro-0813`** is now in Workers AI — if the
   free tier is important for deployments without OpenRouter key, this dated
   checkpoint is a viable free alternative to the OpenRouter `deepseek-v4-pro`.

4. **tsx not in devDependencies** — `pnpm models:refresh` fails in clean
   environments where tsx isn't globally installed. Consider adding
   `tsx` as a devDependency so the refresh script works out of the box.
