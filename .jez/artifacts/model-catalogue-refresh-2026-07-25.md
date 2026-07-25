---
date: 2026-07-25
status: active
owner: claude
---

# Monthly Model Catalogue Refresh — 2026-07-25

## Summary

Snapshot refreshed and committed to `main`. Build passes. **Actionable: 6 models in `models.ts` are no longer in the catalogue — needs a human decision to update or remove them.** 1 new direct-SDK candidate worth evaluating.

---

## Catalogue Diff

| | Count |
|---|---|
| Previous total | 130 |
| New total | 127 |
| Added | +5 |
| Removed | −8 |

**Added (5 models):**
| Model ID | Notes |
|---|---|
| `anthropic/claude-opus-5` | New flagship, 1M ctx |
| `anthropic/claude-opus-5-fast` | Faster variant, 1M ctx |
| `google/gemini-3.5-flash-lite` | Lightweight Flash, 1M ctx |
| `google/gemini-3.6-flash` | Next-gen Flash, 1M ctx |
| `moonshotai/kimi-k3` | Kimi successor, 1M ctx (OpenRouter) |

**Removed (8 models):**
| Model ID | Impact |
|---|---|
| `deepseek/deepseek-v4-pro` | **⚠️ In `models.ts`** |
| `deepseek/deepseek-v4-flash` | **⚠️ In `models.ts`** |
| `openai/gpt-5.4` | **⚠️ In `models.ts`** (gpt-5.4-mini still present) |
| `x-ai/grok-4.20` | **⚠️ In `models.ts`** |
| `anthropic/claude-sonnet-4.6` | **⚠️ In `models.ts`** |
| `qwen/qwen3.6-plus` | **⚠️ In `models.ts`** |
| `moonshotai/kimi-k2.6` | OpenRouter route only — `@cf/moonshotai/kimi-k2.6` (Workers AI) still present |
| `openai/gpt-5.4-image-2` | Not in `models.ts` |
| `openai/gpt-5.5-pro` | Not in `models.ts` |
| `xiaomi/mimo-v2.5`, `xiaomi/mimo-v2.5-pro` | Not in `models.ts` |

Note: removed count above is 10 not 8 because the JS diff used IDs — 2 of the "removed" were already absent from `models.ts`.

---

## Build Status

```
pnpm type-check: ✅ PASS
pnpm build:      ✅ PASS (5.45s)
```

The snapshot JSON is data, not typed code, so the 6 missing model IDs don't cause build errors — they will appear in the UI without enriched metadata (no context length, pricing, capability tags) until the config is updated.

---

## Models in `models.ts` Missing from Catalogue

These 6 IDs are still enabled in `src/shared/config/models.ts` but were removed from the upstream catalogue:

| Model | Recommendation |
|---|---|
| `anthropic/claude-sonnet-4.6` | Superseded — replace with `anthropic/claude-sonnet-5` or `anthropic/claude-opus-5-fast` |
| `openai/gpt-5.4` | May be retired — check OpenRouter. `openai/gpt-5.4-mini` still in catalogue |
| `deepseek/deepseek-v4-pro` | Removed — replace with whatever the current DeepSeek V4 id is, or drop |
| `deepseek/deepseek-v4-flash` | Removed — same as above |
| `qwen/qwen3.6-plus` | Removed — check if a newer Qwen id is available |
| `x-ai/grok-4.20` | Removed — check for current Grok id in catalogue |

**Do not auto-fix.** These changes require human decisions about replacements, pricing, and which models to enable. Edit `src/shared/config/models.ts` to resolve.

---

## New Direct-SDK Candidates

Currently wired: `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/deepseek`, `@ai-sdk/mistral`, `@ai-sdk/xai`.

### `@ai-sdk/moonshotai` — **WORTH EVALUATING**

| | |
|---|---|
| Package | `@ai-sdk/moonshotai` v3.0.17 |
| Published | 2026-07-21 (4 days ago — very recent) |
| Matching model | `moonshotai/kimi-k3` (just added to catalogue) |
| Previous skip reason | "Kimi runs free on Workers AI" — applied to K2 |
| Current situation | K2 still on Workers AI free. **K3 is OpenRouter-only so far.** If you add `MOONSHOT_API_KEY`, direct wiring saves OpenRouter margin on K3 calls. |
| Recommendation | Evaluate when K3 usage grows. Low-priority for now since K3 is also routed through OpenRouter automatically. |

### Skipped / Not Applicable

| Package | Reason skipped |
|---|---|
| `@ai-sdk/groq` v4.0.13 | No Groq-prefixed models in our catalogue |
| `@ai-sdk/cohere` v4.0.12 | No Cohere models enabled |
| `@ai-sdk/perplexity` v4.0.13 | No Perplexity models enabled |
| `@ai-sdk/cerebras` v3.0.14 | No Cerebras models enabled |
| `@ai-sdk/alibaba` | Previously deliberate skip (Qwen runs via OpenRouter prefix `qwen/`) |

---

## Open Questions for Human

1. **Which models replace the 6 removed ones?** Check the live catalogue at [models.flared.au](https://models.flared.au) for current IDs, then update `src/shared/config/models.ts`.
2. **`claude-sonnet-4.6` removed from catalogue** — this is notable as it's the current session model. Is this being superseded by Sonnet 5 in OpenRouter? If so, update the default + docs.
3. **DeepSeek V4 fully removed** — both pro and flash gone. Worth checking if new DeepSeek IDs exist (V5?) before removing the DeepSeek section.
4. **Add `moonshotai/kimi-k3` to `models.ts`?** K3 is now in the catalogue. K2 still runs free on Workers AI but K3 is OpenRouter-only.

---

## Commit

`381b198` `chore(models): refresh catalogue snapshot from flared.au` pushed to `main`.
