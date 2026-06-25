---
date: 2026-06-25
status: active
owner: claude
---

# Monthly Model Catalogue Refresh — 2026-06-25

## Catalogue diff

Previous snapshot: 2026-06-04 · 136 models (112 OpenRouter + 24 Workers AI text-gen)  
New snapshot: 2026-06-25 · 137 models (111 OpenRouter + 26 Workers AI text-gen)

**Net: +1 model**

### Added (9 IDs)

| ID | Type | Notes |
|---|---|---|
| `anthropic/claude-fable-5` | OpenRouter | New Claude Fable 5 flagship — not yet in `models.ts` |
| `moonshotai/kimi-k2.7-code` | OpenRouter | Code-focused Kimi variant |
| `@cf/moonshotai/kimi-k2.7-code` | Workers AI (free) | Same, available free on Workers AI |
| `z-ai/glm-5.1` | OpenRouter | Updated GLM 5.x entry (see note below) |
| `z-ai/glm-5.2` | OpenRouter | New GLM version |
| `@cf/zai-org/glm-5.2` | Workers AI (free) | GLM 5.2 available free on Workers AI |
| `nvidia/nemotron-3-ultra-550b-a55b` | OpenRouter | Large Nvidia model |
| `google/gemini-3-pro-image` | OpenRouter | Gemini 3 Pro with image output |
| `google/gemini-3.1-flash-image` | OpenRouter | Gemini 3.1 Flash with image output |

> **Note on `z-ai/glm-5.1`**: appears in both added and removed because the entry's metadata changed between snapshots (pricing/capabilities fields updated). The model itself persists.

### Removed (8 IDs)

| ID | Notes |
|---|---|
| `openai/gpt-5.4-nano` | Dropped from OpenRouter catalogue |
| `arcee-ai/maestro-reasoning` | Removed |
| `bytedance-seed/seed-2.0-lite` | Removed |
| `minimax/minimax-m2.7` | Removed |
| `nvidia/nemotron-3-super-120b-a12b` | Superseded by nemotron-3-ultra-550b |
| `qwen/qwen3.5-9b` | Removed (smaller Qwen variant) |
| `z-ai/glm-5-turbo` | Superseded by glm-5.1/5.2 |
| `z-ai/glm-5.1` | Entry refreshed (see note above) |

---

## Build status

- **Type-check**: ✅ clean — `tsc --noEmit` passes with no errors
- **Build**: ❌ pre-existing failure — `Can't resolve '@tailwindcss/typography'` in `src/index.css`  
  Confirmed pre-existing: build failed identically on the previous commit before the snapshot update.  
  **This is unrelated to the model catalogue.** Requires `pnpm add @tailwindcss/typography` or removing the `@import` in `src/index.css`.

---

## Snapshot committed

Committed and pushed to `main`:  
`chore(models): refresh catalogue snapshot from flared.au`  
SHA: `d56b7b3`

---

## New direct-SDK provider candidates

Official `@ai-sdk/*` packages from [ai-sdk.dev/providers/ai-sdk-providers](https://ai-sdk.dev/providers/ai-sdk-providers) not yet wired in `providers.ts`:

| Package | Catalogue prefix | Verdict |
|---|---|---|
| `@ai-sdk/groq` | `groq/` | **Skip** — no Groq models in `ENABLED_MODEL_IDS` |
| `@ai-sdk/cohere` | `cohere/` | **Skip** — no Cohere models in catalogue |
| `@ai-sdk/amazon-bedrock` | `bedrock-*` | **Skip** — no Bedrock models in catalogue |
| `@ai-sdk/azure` | `azure/` | **Skip** — no Azure models in catalogue |
| `@ai-sdk/deepinfra` | `deepinfra/` | **Skip** — no DeepInfra models in catalogue |
| `@ai-sdk/fireworks` | `fireworks/` | **Skip** — no Fireworks models in catalogue |
| `@ai-sdk/together` | `together/` | **Skip** — no Together AI models in catalogue |
| `@ai-sdk/google-vertex` | `vertex/` | **Skip** — no Vertex models in catalogue |
| `@ai-sdk/huggingface` | `hf/` | **Skip** — Workers AI covers HuggingFace via `@hf/` prefix already |
| `@ai-sdk/baseten` | `baseten/` | **Skip** — no Baseten models in catalogue |
| `@ai-sdk/elevenlabs` | N/A | Audio/TTS only — out of scope for text routing |
| `@ai-sdk/assemblyai` | N/A | Audio/STT only — out of scope |
| `@ai-sdk/deepgram` | N/A | Audio/STT only — out of scope |
| `@ai-sdk/fal` | N/A | Image gen only — out of scope |
| `@ai-sdk/luma` | N/A | Image gen only — out of scope |

**Previously skipped (re-confirmed):**
- `@ai-sdk/alibaba` — Qwen models route via `qwen/` prefix on OpenRouter; Alibaba direct API requires separate `ALIBABA_API_KEY`. Skipped because Kimi K2.6 (free on Workers AI) covers the free Qwen use-case and qwen-plus routes cleanly via OpenRouter.

**Conclusion: No new direct-SDK providers to add this cycle.** All new packages target providers not represented in `ENABLED_MODEL_IDS`.

---

## Open questions for human

1. **Add `anthropic/claude-fable-5` to `models.ts`?**  
   It's now in the flared.au catalogue. CLAUDE.md already mentions "Fable 5" as the latest flagship. Suggested addition to `OPENROUTER_MODELS` under Anthropic section.

2. **Add `@cf/moonshotai/kimi-k2.7-code` to `WORKERS_AI_MODELS`?**  
   Free code-focused Kimi model on Workers AI — good complement to the existing `kimi-k2.6` general model.

3. **Add `@cf/zai-org/glm-5.2` to `WORKERS_AI_MODELS`?**  
   Free GLM 5.2 on Workers AI. Could replace or sit alongside `glm-4.7-flash`. Check if Z.AI changed the model capabilities significantly.

4. **`z-ai/glm-5` vs `z-ai/glm-5.1`/`z-ai/glm-5.2`?**  
   `models.ts` references `z-ai/glm-5` but the catalogue now shows `z-ai/glm-5.1` and `z-ai/glm-5.2`. Confirm the original `z-ai/glm-5` ID still resolves via OpenRouter or update to the versioned form.

5. **Fix the pre-existing build failure?**  
   `@tailwindcss/typography` is imported in `src/index.css` but not installed. `pnpm add -D @tailwindcss/typography` should fix it.
