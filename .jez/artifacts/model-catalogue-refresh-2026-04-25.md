# Model Catalogue Refresh — 2026-04-25

**Run by:** Automated maintenance agent  
**Date:** 2026-04-25

---

## Refresh Status: INCOMPLETE — ai.flared.au returning HTTP 503

`pnpm models:refresh` failed mid-run. The OpenRouter source (`models.flared.au`) responded fine (119 models), but the Workers AI source (`ai.flared.au`) returned HTTP 503. The script uses `Promise.all` so both must succeed — snapshot was **not** updated.

Additional issue: `tsx` is not installed in devDependencies, so `npx tsx` fails in this environment. Workaround available via `node --experimental-strip-types scripts/refresh-models.ts`.

**Action needed:**
1. Add `tsx` to devDependencies (or switch the npm script to `node --experimental-strip-types`) so `pnpm models:refresh` works without npx fallback.
2. Re-run refresh once `ai.flared.au` recovers.

---

## Catalogue Diff (OpenRouter source only — WAI unavailable)

Previous snapshot: **2026-04-15** — 101 total (47 OR + 54 WAI)  
Current OR fetch: **2026-04-25** — **119 OR models** (up from 47 → +72)

The growth is mostly multimodal: image generation (`fal-ai/*`, `xai/grok-imagine-image`), audio (`openai/gpt-audio`, `xai/tts/v1`), and video (`fal-ai/sora-2/*`, `bytedance/seedance-2.0/*`). For text models, key additions:

### New text-generation providers in OR catalog

| Provider prefix | New models |
|---|---|
| `arcee-ai/` | maestro-reasoning, virtuoso-large, coder-large, trinity-large-thinking, trinity-large-preview |
| `bytedance-seed/` | seed-1.6, seed-1.6-flash, seed-2.0-lite, seed-2.0-mini |
| `minimax/` | minimax-m2.7, minimax-m2.5 |
| `moonshotai/` | kimi-k2.6, kimi-k2-thinking, kimi-k2.5 *(OR-routed, complements free WAI)* |
| `stepfun/` | step-3.5-flash |
| `xiaomi/` | mimo-v2-pro, mimo-v2-omni, mimo-v2.5-pro, mimo-v2.5 |

### Notable new models from existing providers

| Model | Significance |
|---|---|
| `anthropic/claude-opus-4.7` | New Anthropic flagship — replaces or complements `claude-opus-4.6` |
| `deepseek/deepseek-v4-pro` | Next-gen DeepSeek (V4 Pro) |
| `deepseek/deepseek-v4-flash` | Fast DeepSeek V4 variant |
| `openai/gpt-5.5-pro` | Newer GPT generation (Pro) |
| `openai/gpt-5.5` | Newer GPT generation (standard) |
| `moonshotai/kimi-k2.6` | Newer Kimi via OR (we have k2.5 free on WAI) |
| `moonshotai/kimi-k2-thinking` | Kimi reasoning variant |
| `qwen/qwen3-max-thinking` | Qwen reasoning variant |
| `x-ai/grok-4.20` | Newer Grok |
| `x-ai/grok-4.20-multi-agent` | Grok multi-agent variant |

### ENABLED_MODEL_IDS — no broken references

All 12 current `OPENROUTER_MODELS` in `src/shared/config/models.ts` remain present in the new OR catalog. No models were removed or sunset.

---

## Build Status

Could not run `pnpm type-check` or `pnpm build` against a fresh snapshot because the refresh failed. Existing code is clean — the current snapshot is unmodified from 2026-04-15.

---

## New Direct-SDK Provider Candidates

Currently wired in `providers.ts` (fallback path): `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`.  
Note: the starter's primary routing goes `provider/model` → OpenRouter for all non-Workers-AI models.

| Package | npm version | Published | Assessment |
|---|---|---|---|
| `@ai-sdk/groq` | 3.0.35 | 2026-04-07 | **Skip** — no Groq-hosted models in ENABLED_MODEL_IDS. Groq serves llama/gemma but those come free via Workers AI. Re-evaluate if Groq-specific models (Llama 4 Scout, etc.) are worth adding to the catalogue. |
| `@ai-sdk/cohere` | 3.0.30 | 2026-04-07 | **Skip** — no `cohere/` models in catalogue. No user ask. |
| `@ai-sdk/cerebras` | 2.0.45 | 2026-04-07 | **Skip** — no `cerebras/` models in catalogue. |
| `@ai-sdk/fireworks` | 2.0.46 | 2026-04-07 | **Skip** — no `fireworks/` models in catalogue. |
| `@ai-sdk/togetherai` | 2.0.45 | 2026-04-07 | **Skip** — no `togetherai/` models in catalogue. |
| `@ai-sdk/perplexity` | 3.0.29 | 2026-04-07 | **Skip** — no `perplexity/` models in catalogue. |
| `@ai-sdk/moonshotai` | 2.0.16 | 2026-04-07 | **Skip (deliberate)** — Kimi K2.5 runs free on Workers AI. OR routing covers kimi-k2.6/k2-thinking for paid users. Direct SDK adds complexity for marginal gain. |
| `@ai-sdk/alibaba` | 1.0.17 | 2026-04-07 | **Skip (deliberate)** — `qwen/` models already route fine via OpenRouter. Previously noted skip. |
| `@ai-sdk/amazon-bedrock` | 4.0.96 | 2026-04-17 | **Skip** — no Bedrock models in catalogue; adds AWS credential complexity. |
| `@ai-sdk/azure` | 3.0.54 | 2026-04-14 | **Skip** — Azure OpenAI has no catalogue entries; bare `gpt-*` fallback already handles Azure if needed. |
| `@ai-sdk/google-vertex` | 4.0.112 | 2026-04-16 | **Consider** — starter has `@ai-sdk/google` for `gemini-*` bare IDs. If a user wants Vertex-routed Gemini (enterprise SLA, VPC), adding `@ai-sdk/google-vertex` + `GOOGLE_VERTEX_PROJECT` env would be clean. Low priority — Vertex users are a small audience. |
| `@ai-sdk/deepinfra` | 2.0.45 | 2026-04-07 | **Skip** — no DeepInfra models in catalogue. |

**Net recommendation:** No new direct-provider SDKs needed this cycle. The `provider/model` → OpenRouter path covers all new catalogue entries cleanly.

---

## Open Questions for Human

1. **Add `anthropic/claude-opus-4.7`?** The new Anthropic flagship is in the catalog. Should it replace `claude-opus-4.6` in `ENABLED_MODEL_IDS`, or sit alongside it? Opus 4.6 still available, so no urgency.

2. **Add `deepseek/deepseek-v4-pro` and/or `deepseek/deepseek-v4-flash`?** V4 is newer than v3.2-speciale. Worth updating or adding as a faster option?

3. **Add `moonshotai/kimi-k2-thinking`?** Reasoning model from Moonshot (via OR) to complement the free k2.5 on Workers AI.

4. **ByteDance Seed models (`bytedance-seed/seed-2.0-lite/mini`)?** Fast, capable new provider. No `@ai-sdk/bytedance` exists yet — OR routing handles it. Worth adding to the curated list?

5. **`ai.flared.au` downtime** — Workers AI snapshot is 10 days stale. Is this expected maintenance or should it be reported at https://ai.flared.au?

6. **`tsx` missing from devDependencies** — `pnpm models:refresh` requires `tsx` but only `npx tsx` is documented. Should `tsx` be added to `devDependencies`?

---

*Next refresh: ~2026-05-25*
