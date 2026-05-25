---
date: 2026-05-25
status: active
owner: claude
---

# Monthly Model Catalogue Refresh — 2026-05-25

## Summary

Ran `pnpm models:refresh` (via inline Node.js — `tsx` not installed in this container).
Snapshot updated from 174 models (2026-04-26) to 159 models (2026-05-25).

---

## Step 1 — Catalogue Diff

| Metric | Before (2026-04-26) | After (2026-05-25) |
|---|---|---|
| Total models | 174 | 159 |
| OpenRouter | unknown | 122 |
| Workers AI (text-gen) | unknown | 73 |
| Net change | — | **−15** |

### Added (13)

| Model ID | Notes |
|---|---|
| `anthropic/claude-opus-4.7-fast` | New Claude Opus 4.7 variant |
| `anthropic/claude-opus-4.7` | Replaced `claude-opus-4.6` |
| `google/gemini-3.1-flash-lite` | Smaller Gemini 3.1 flash |
| `google/gemini-3.5-flash` | New Gemini generation |
| `mistralai/mistral-medium-3-5` | New Mistral Medium |
| `openai/gpt-chat-latest` | OpenAI latest alias |
| `qwen/qwen3.5-plus-20260420` | Qwen dated variant |
| `qwen/qwen3.6-27b` | Qwen 3.6 27B variant |
| `qwen/qwen3.6-35b-a3b` | Qwen 3.6 MoE variant |
| `qwen/qwen3.6-flash` | Qwen 3.6 flash |
| `qwen/qwen3.6-max-preview` | Qwen 3.6 max preview |
| `qwen/qwen3.7-max` | Qwen 3.7 max |
| `x-ai/grok-4.3` | Grok 4.3 |
| `x-ai/grok-build-0.1` | xAI experimental |

### Removed (28)

Notable removals that **affect our ENABLED_MODEL_IDS** (see ⚠️ below):

| Model ID | Action needed? |
|---|---|
| `anthropic/claude-opus-4.6` | ⚠️ **In our config** — successor: `claude-opus-4.7` or `claude-opus-4.7-fast` |
| `x-ai/grok-4.1-fast` | ⚠️ **In our config** — successor: `x-ai/grok-4.3` or `x-ai/grok-4.20` |
| `moonshotai/kimi-k2.5` | Not in our config (Kimi runs free via Workers AI) |
| `qwen/qwen3-max-thinking` | Not in our config |
| `qwen/qwen3.5-397b-a17b` | Not in our config |
| `mistralai/mistral-medium-3.1` | Not in our config |
| `arcee-ai/trinity-large-preview` | Not in our config |
| `minimax/minimax-m2.5` | Not in our config |
| Various `@cf/` / `@hf/` legacy models (10+) | Old Workers AI models retired by Cloudflare |

---

## ⚠️ Action Required — 2 Stale Model IDs in ENABLED_MODEL_IDS

`src/shared/config/models.ts` references two IDs that are no longer in the catalogue:

```typescript
// REMOVED from catalogue — should be updated:
'anthropic/claude-opus-4.6',   // → suggest: 'anthropic/claude-opus-4.7' or 'anthropic/claude-opus-4.7-fast'
'x-ai/grok-4.1-fast',          // → suggest: 'x-ai/grok-4.3'
```

These will still route (direct API + OpenRouter may still accept the IDs) but they are no longer listed in the enriched metadata catalogue, so the model picker UI will show them without pricing/context metadata.

**Suggested replacements:**
- `anthropic/claude-opus-4.6` → `anthropic/claude-opus-4.7-fast` (new addition, fast variant aligns with the "fast" prior choice)
- `x-ai/grok-4.1-fast` → `x-ai/grok-4.3` (direct successor in catalogue)

---

## Step 2 — Build Status

- **Type-check (`pnpm type-check`):** ✅ Clean — no errors
- **Build (`pnpm build`):** ❌ Failed — `@tailwindcss/typography` not installed in this container

  ```
  Error: Can't resolve '@tailwindcss/typography' in '.../src'
  ```

  This is a **pre-existing environment issue** (missing devDependency in the remote container, not a new regression from the model refresh). The snapshot refresh did not cause the build failure.

---

## Step 3 — New Direct-Provider SDK Candidates

Checked https://ai-sdk.dev/providers/ai-sdk-providers against our `ENABLED_MODEL_IDS`.

**Current direct SDKs wired:** `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/deepseek`, `@ai-sdk/mistral`, `@ai-sdk/xai`

**Providers in new snapshot not currently wired as direct:**

| Prefix | @ai-sdk package | npm version | Verdict |
|---|---|---|---|
| `qwen/` | `@ai-sdk/alibaba` | 3.x | **Skip** — intentionally deferred (Kimi/Qwen run free on Workers AI; consolidation not worth adding Alibaba Cloud key) |
| `moonshotai/` | `@ai-sdk/moonshotai` | 3.x | **Skip** — Kimi K2.6 runs free via Workers AI (`@cf/moonshotai/kimi-k2.6`); direct API adds a key with no benefit |
| `z-ai/` | no `@ai-sdk/z-ai` | — | **Skip** — no official SDK; routes via OpenRouter |
| `bytedance/` | `@ai-sdk/bytedance` | available | **Skip** — no bytedance models in our ENABLED_MODEL_IDS |
| `arcee-ai/` | no SDK | — | **Skip** — no official SDK |

**Conclusion:** No new direct provider SDK worth adding. All providers with models in our `ENABLED_MODEL_IDS` already have direct SDK support (or are intentionally routed through OpenRouter/Workers AI).

---

## Notable New Models Worth Considering

These are in the new catalogue but NOT in our `ENABLED_MODEL_IDS` — worth considering for the next `models.ts` update:

| Model | Why interesting |
|---|---|
| `google/gemini-3.5-flash` | Next-gen Gemini flash — may outperform `gemini-3-flash-preview` |
| `anthropic/claude-opus-4.7` | Latest Opus if `claude-opus-4.6` is being retired |
| `mistralai/mistral-medium-3-5` | Updated medium tier |

---

## Open Questions

1. **Should `anthropic/claude-opus-4.6` be swapped for `claude-opus-4.7` or `claude-opus-4.7-fast`?** The `-fast` variant may be cheaper/faster if cost is a factor. Human decision.
2. **Should `x-ai/grok-4.1-fast` be swapped for `x-ai/grok-4.3`?** Grok 4.20 and 4.3 are both in catalogue — which is the intended production successor?
3. **Workers AI legacy removals:** 10+ old `@cf/` and `@hf/` models (TinyLlama, Falcon, Qwen 1.5, etc.) are gone. None were in our config. `pnpm doctor:models` should be run in the deployment environment to confirm no stale IDs remain in other parts of `src/`.
