---
date: 2026-09-25
status: active
owner: claude
---

# Monthly Model Catalogue Refresh — 2026-09-25

## Catalogue Diff

| Metric | Value |
|---|---|
| Previous snapshot | 2026-08-25T21:10:36Z (145 models) |
| New snapshot | 2026-09-25T21:06:23Z (167 models) |
| Added | 37 models |
| Removed | 15 models |
| Net change | +22 |

### Notable additions

- **Anthropic**: Claude Opus 5.5, Claude Fable 5.1 (new model family)
- **OpenAI**: GPT-5.5, GPT-5.6 series, GPT-6 family (Astra, Sol, Luna)
- **Google**: Gemini 3.8 Flash
- **DeepSeek**: V4.1 Flash
- **xAI**: Grok 4.7
- **Qwen**: qwen3.8 series (Flash, Max, Omni, Max-0902, Max-Prime)
- **Z.AI**: GLM 5.3 series (replacing 5.2 / 4.7-flash OpenRouter variants)
- **Workers AI**: `@cf/zai-org/glm-5.3`, `@cf/zai-org/glm-5.3-flash` (new CF bindings)
- **Xiaomi**: MiMo V2.6 series (new provider in catalogue)
- **Cohere**: command-a-plus

### Notable removals

- `anthropic/claude-fable-5` → superseded by `claude-fable-5.1`
- `anthropic/claude-opus-5-fast` → superseded by `claude-opus-5.5`
- `z-ai/glm-4.7-flash`, `z-ai/glm-5.2` → superseded by `z-ai/glm-5.3-*`
- `nvidia/nemotron-3-ultra-550b-a55b` → removed from OpenRouter
- `moonshotai/kimi-k2.7-code` → removed (experimental model retired)
- `google/gemini-3-pro-image`, `google/gemini-3.1-flash-image` → removed

## Build Status

- `pnpm type-check`: ✅ PASS (no TypeScript errors)
- `pnpm build`: ✅ PASS (clean build in 4.57s)

## ⚠️ Stale Model IDs in `src/shared/config/models.ts`

**7 ENABLED_MODEL_IDS are no longer in the catalogue.** The app will still
run (these are plain strings with no type enforcement), but affected models
will show without metadata in the UI and may fail at inference time if
OpenRouter has also retired them.

| Stale ID | Status | Suggested replacement |
|---|---|---|
| `anthropic/claude-opus-4.8` | Removed | `anthropic/claude-opus-5.5` or `anthropic/claude-opus-5` |
| `anthropic/claude-sonnet-4.6` | Removed | `anthropic/claude-sonnet-5` |
| `openai/gpt-5.4` | Removed | `openai/gpt-5.5` (or keep `gpt-5.4-mini` as the fast option) |
| `deepseek/deepseek-v4-pro` | Removed | `deepseek/deepseek-v4-pro-0813` |
| `deepseek/deepseek-v4-flash` | Removed | `deepseek/deepseek-v4.1-flash` or `deepseek-v4-flash-0731` |
| `qwen/qwen3.6-plus` | Removed | `qwen/qwen3.7-plus` or `qwen/qwen3.8-max-prime` |
| `x-ai/grok-4.20` | Removed | `x-ai/grok-4.7` (or `x-ai/grok-4.6`) |

**Action required:** Edit `src/shared/config/models.ts` to replace stale IDs
with their successors. Run `pnpm models:refresh` is already done — the
catalogue data is fresh.

## New Direct-SDK Provider Candidates

Current direct providers in `providers.ts`:
`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/deepseek`,
`@ai-sdk/mistral`, `@ai-sdk/xai`

### Candidates considered

| Package | npm version | Models in catalogue | Recommendation |
|---|---|---|---|
| `@ai-sdk/zai` | 3.0.19 (2026-09-25) | 7 (glm-5, glm-5.3-*) | **Worth adding** — Z.AI has 7 models in our catalogue, active development, `@ai-sdk/zai` is the official Vercel SDK. Direct key (`ZAI_API_KEY`) would bypass OpenRouter for GLM models. |
| `@ai-sdk/cohere` | 4.0.50 (2026-09-25) | 1 (command-a-plus) | **Candidate but low priority** — only 1 model in our catalogue. Add if a fork user has a Cohere key. |
| `@ai-sdk/groq` | 4.0.50 (2026-09-25) | 0 | **Skip** — no Groq models in our catalogue. |
| `@ai-sdk/cerebras` | 3.0.57 (2026-09-25) | 0 | **Skip** — no Cerebras models in our catalogue. |
| `@ai-sdk/perplexity` | 4.0.52 (2026-09-25) | 0 | **Skip** — no Perplexity models in our catalogue. |
| `@ai-sdk/togetherai` | 3.0.58 (2026-09-25) | 0 | **Skip** — no Together AI models in our catalogue. |
| `@ai-sdk/fireworks` | 3.0.60 (2026-09-25) | 0 | **Skip** — no Fireworks models in our catalogue. |

### Previously skipped (still correct)

- `@ai-sdk/alibaba` (Qwen) — no `@ai-sdk/qwen` exists on npm; Qwen routes via
  OpenRouter. Alibaba Tongyi API has a different endpoint format. Skip.
- `@ai-sdk/moonshotai` — Kimi K2.6 runs free on Workers AI (`@cf/moonshotai/kimi-k2.6`).
  Direct Moonshot API would add cost for no benefit. Skip.

## Open Questions

1. **Model ID updates in `models.ts`** — 7 stale IDs need human review. The
   suggested replacements above are based on the catalogue but semantic
   versioning of AI models is not always predictable (capabilities may differ).
   Recommend reviewing each replacement before committing.

2. **Claude Fable 5.1** — new Anthropic model family. Consider adding
   `anthropic/claude-fable-5.1` to `OPENROUTER_MODELS` (128K ctx, tools,
   likely a mid-tier between Haiku and Sonnet based on the name pattern).

3. **GPT-6 family** — `openai/gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna` series
   added to catalogue. These are likely OpenAI's newest frontier models.
   Consider replacing `gpt-5.4` with a GPT-6 variant.

4. **`@ai-sdk/zai` direct support** — worth adding to `providers.ts` so forks
   with a `ZAI_API_KEY` bypass OpenRouter for GLM models. Low effort, high
   value for the Z.AI user segment. Not done autonomously per task constraints.

5. **Xiaomi MiMo V2.6** — new provider in catalogue (3 models). Small but
   active. No `@ai-sdk/xiaomi` exists yet. Routable via OpenRouter only.
