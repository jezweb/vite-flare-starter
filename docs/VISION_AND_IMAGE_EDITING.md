# Vision + Image Editing Patterns

Reference for the vision-and-image-edit tools shipped with this starter.
Lifted and condensed from the imgeo project (`~/Documents/imgeo`),
where the patterns are battle-tested against ~25 photos × 15 vision models.

## What ships in the starter

| Tool | What it does | Default model | Free? |
|---|---|---|---|
| `analyze_image` | Look at a photo, return caption / structured JSON | Gemma 4 26B (Workers AI) | ✓ |
| `edit_image` | Take a source image + prompt, return an edited image | Gemini 3.1 Flash Image (Nano Banana 2) | needs `OPENROUTER_API_KEY` |
| `generate_image` | Text-to-image | FLUX Schnell (Workers AI) | ✓ (or paid GPT Image 2 / Nano Banana 2) |
| `image_transform` | Resize / crop / format-convert via Cloudflare Images | n/a | ✓ |
| `image_info` | Width / height / mime / size | n/a | ✓ |

## Workers AI vision models — two API shapes

Workers AI serves vision models in two **incompatible** API shapes. Pick the
right one or you get silent format errors.

### Classic (older models)

```ts
await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
  prompt: '...',
  image: Array.from(imageBytes),
  max_tokens: 16_384,
})
// Returns { response: string } in most cases — but coerce defensively.
```

Models on classic shape:
- `@cf/meta/llama-3.2-11b-vision-instruct`
- `@cf/llava-hf/llava-1.5-7b-hf`
- `@cf/unum/uform-gen2-qwen-500m`

### Chat (newer models — recommended)

```ts
const dataUrl = `data:${mediaType};base64,${bytesToBase64(imageBytes)}`
await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: USER_PROMPT },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ],
  max_tokens: 16_384,
})
```

Models on chat shape (where most of the new capability lives):
- `@cf/google/gemma-4-26b-a4b-it` ← **default for analyze_image**
- `@cf/google/gemma-3-12b-it`
- `@cf/moonshotai/kimi-k2.6` (premium quality, slower)
- `@cf/moonshotai/kimi-k2.5`
- `@cf/mistralai/mistral-small-3.1-24b-instruct`
- `@cf/meta/llama-4-scout-17b-16e-instruct` (fastest, less reliable for structured JSON)

⚠️ The `capabilities.vision` flag in the Workers AI catalogue API is **stale**
for several of these — Kimi K2.6, Gemma 4, Mistral 3.1, Llama 4 Scout all
report `vision: false` while the docs page lists Vision: Yes. Trust the
docs, not the flag. See `~/.claude/rules/workers-ai-vision-catalog.md`.

## Model selection — which to use when

| Task | Best free model | Premium upgrade |
|---|---|---|
| Caption only (1-2 sentences) | Llama 4 Scout (~2s) | — |
| Structured JSON extraction | **Gemma 4 26B** (~5-10s) | Kimi K2.6 (~20s, higher quality) |
| Bounded boxes / detailed catalogue | Gemma 4 26B | Kimi K2.6 |
| Quick "what's in this?" | Gemma 4 26B | — |

**Rule of thumb**: Gemma 4 26B is the sweet spot for cost+quality. Llama 4
Scout is fast but emits loose JSON ("scene: 'A residential area'" when the
schema asks for an object) — fine for plain text, not for strict schemas.
Kimi K2.6 is the premium tier — slower but the highest quality on Workers AI.

See `~/.claude/rules/workers-ai-content-coercion.md` — newer chat-shape
models can return `content` as an array of parts instead of a string. Always
route through a `coerceToString` helper before calling `.trim()` or similar.

## Prompt patterns from imgeo

### Caption mode (1-2 sentences, free text)

```
Describe what is in this photo in 1-2 sentences. Note any notable
landmarks, activities, or subjects. Be specific — name species, brands,
architectural styles, or landmarks where you recognise them.
```

### Summary mode (structured JSON — default)

System: `You are a careful visual-extraction assistant. You respond with
accurate, specific, confidence-marked extraction. You never invent details,
brands, species, or locations that aren't clearly visible.`

User: ask for a JSON object with `summary`, `scene` (setting / time_of_day /
weather / lighting), `subjects`, `visible_text`, `identified` (with
confidence), `location_hint`, `notable`.

### Catalog mode (full taxonomy)

Same as summary plus per-object bounding boxes, camera metadata, colour
palette, AI-generation anomaly detection. Slow (~40-60s) but rich.

Full prompt templates lift from imgeo at `~/Documents/imgeo/src/server/modules/jobs/prompts.ts`.

## Robust JSON extraction

Models wrap JSON in markdown fences inconsistently. Always strip:

```ts
function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim()
  // ```json ... ``` or ``` ... ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  if (fence?.[1]) return fence[1].trim()
  // Bare JSON, possibly with chatter
  if (trimmed.startsWith('{')) {
    const lastBrace = trimmed.lastIndexOf('}')
    if (lastBrace > 0) return trimmed.slice(0, lastBrace + 1)
  }
  // First { to last } as a fallback
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}
```

Always validate with Zod and **retry once** with a stricter "JSON only"
nudge if parse fails. Don't loop — if it fails twice, return the error.

## Image editing — Gemini 3.1 Flash Image (Nano Banana 2)

OpenRouter id: `google/gemini-3.1-flash-image-preview`. Released 2026-02-26;
delivers Pro-level edit quality at Flash speed. Default image generation
engine in the Gemini app, Google Search AI Mode, Google Lens, Google Ads.

**Capabilities**: image-to-image edits via reference image, multi-turn
editing, search grounding, up to 4K output, transparent PNG support, custom
aspect ratios (1:1 → 21:9 plus extreme 1:8 / 8:1).

**Multi-turn editing requires preserving `thoughtSignature`** on every
returned part. The signature is encrypted state that lets the model continue
the conversation from a previous edit. Strip it and the model errors with
"Image part is missing a thought_signature" on turn 2+. See
`~/.claude/rules/gemini-image.md` for the full pattern.

### OpenRouter vs direct Google AI Studio

The starter ships two paths for Gemini image work:

| Path | Use when | Key |
|---|---|---|
| `provider: 'nano-banana-2'` (OpenRouter) | Single-turn edit, OpenRouter already configured for other models | `OPENROUTER_API_KEY` |
| `provider: 'gemini-direct'` (Google AI Studio) | Multi-turn editing chains, want lowest latency, no markup | `GEMINI_API_KEY` |

The `edit_image` tool prefers `gemini-direct` automatically when
`GEMINI_API_KEY` is set and `provider` isn't passed explicitly. The direct
path also preserves Gemini's encrypted `thoughtSignature` parts — OpenRouter
sometimes drops them, which kills iterative edits. Get a key at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey).

Implementation lives at `src/server/lib/gemini-image.ts` — a thin
`callGeminiImage(apiKey, prompt, sourceImage?)` helper that handles both
generation (no source) and edit (with source). Add multi-turn support by
extending it to take a prior `contents[]` history including the
`thoughtSignature` parts from the previous response.

### When to prefer Nano Banana 2 vs alternatives

| Need | Use |
|---|---|
| Photorealistic scenes / regional landmarks | Nano Banana 2 |
| Transparent PNG / icons | GPT Image 2 (native alpha) |
| Image-to-image edits (subject change, style transfer) | Nano Banana 2 |
| Iterative refinement ("now show the same scene but at sunset") | Nano Banana 2 (multi-turn) |
| Text-heavy infographics | GPT Image 2 |
| Bulk / high-volume cheap | FLUX Schnell (Workers AI, free) |

## Image generation — GPT Image 2

OpenAI model id: `gpt-image-2` (snapshot `gpt-image-2-2026-04-21`).
Released 2026-04-21 and GA on the developer API now — rate limit tiers
already in place (5 img/min on Tier 1 → 250 img/min on Tier 5).

**Capabilities**: integrates O-series reasoning so the model "thinks" before
drawing — researches, plans, and reasons about structure before pixel
generation. Multilingual text rendering, slides, infographics, maps, manga,
flexible image sizes, high-fidelity image inputs.

The starter's `generate_image` tool maps `provider: 'openai'` → `gpt-image-2`
(default for OpenAI). Use `provider: 'openai-1'` for the legacy `gpt-image-1`
model if you need it for compatibility.

Source: [developers.openai.com/api/docs/models/gpt-image-2](https://developers.openai.com/api/docs/models/gpt-image-2).

## Adding a new vision tool

1. Read this doc + the `~/.claude/rules/workers-ai-*.md` rules.
2. Pick chat shape unless using a classic-only model.
3. Always set `max_tokens: 16384` (don't cap output unless proven necessary).
4. Coerce response with the helper from
   `~/.claude/rules/workers-ai-content-coercion.md`.
5. For structured outputs: extract JSON block, validate with Zod, retry once.
6. Return `{ ... } | { error: string }` discriminated union for the agent.
7. Define a client renderer in `src/client/modules/chat/components/tool-renderers/`.
8. Register in `src/server/modules/chat/tools/index.ts` + the renderer index.

## Reference projects

- **imgeo** (`~/Documents/imgeo`) — production photo-to-structured-data
  with full benchmark results in `.jez/artifacts/benchmark-vision-2026-04-23.md`.
  All three modes (caption / summary / catalog) live there.
- **Workers AI rules** — `~/.claude/rules/workers-ai-vision-catalog.md`,
  `~/.claude/rules/workers-ai-content-coercion.md`,
  `~/.claude/rules/workers-ai-structured-output.md`.
- **Gemini image rules** — `~/.claude/rules/gemini-image.md`.

**Last Updated**: 2026-04-25
