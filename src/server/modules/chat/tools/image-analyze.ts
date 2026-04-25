/**
 * Image Analysis Tool — Workers AI vision via the chat-shape API.
 *
 * Default model: Gemma 4 26B (sweet spot of quality + cost, free on
 * Workers AI). Premium: Kimi K2.6 for higher-quality structured
 * extraction, slower. Pattern lifted from
 * ~/Documents/imgeo/src/server/modules/jobs/extraction.ts. See
 * docs/VISION_AND_IMAGE_EDITING.md.
 *
 * Three modes:
 *   - 'caption' — 1-2 sentence free-text description
 *   - 'summary' — structured JSON: scene, subjects, visible_text,
 *      identified things, location_hint, notable
 *   - 'extract' — pass a free-form `instruction` and get matching JSON
 */
import { z } from 'zod'
import { Eye } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

type ImageAnalyzeEnv = {
  AI: Ai
  FILES?: R2Bucket
}

function getEnv(ctx: AgentContext): ImageAnalyzeEnv {
  return ctx.env as unknown as ImageAnalyzeEnv
}

// ─── PROMPTS ────────────────────────────────────────────────────────────

const CAPTION_PROMPT =
  'Describe what is in this photo in 1-2 sentences. Note any notable landmarks, activities, or subjects. Be specific — name species, brands, architectural styles, or landmarks where you recognise them.'

const SUMMARY_SYSTEM = `You are a careful visual-extraction assistant. You respond with accurate, specific, confidence-marked extraction. You never invent details, brands, species, or locations that aren't clearly visible. Where you aren't sure, you use "unknown" or mark confidence as "low".`

const SUMMARY_USER = `Describe this photo as completely and accurately as possible.

Respond ONLY as a JSON object with this exact structure:

{
  "summary": "One or two sentences capturing what the photo shows.",
  "scene": {
    "setting": "outdoor|indoor|mixed|unknown",
    "time_of_day": "morning|midday|afternoon|evening|night|unknown",
    "weather": "clear|cloudy|overcast|rainy|snowy|unknown|not_applicable",
    "lighting": "natural|artificial|mixed|low-light|unknown"
  },
  "subjects": ["Main subjects, focal points, or activities visible."],
  "visible_text": ["Transcribe any visible text exactly as shown (preserve case, punctuation, spelling)."],
  "identified": [
    {"name": "specific thing", "type": "brand|landmark|vehicle|product|plant|animal|architecture|logo|other", "confidence": "high|medium|low"}
  ],
  "location_hint": {
    "country_or_region": "Country or region inferrable from context — signage, architecture, flora, vehicles — else 'unknown'.",
    "evidence": "Brief note on what suggests that location."
  },
  "notable": ["Other worthwhile details — unusual features, condition, hazards, aesthetics, cultural context."]
}

Output JSON only — no markdown fences, no commentary.`

// ─── INPUT/OUTPUT SCHEMAS ───────────────────────────────────────────────

const ModelEnum = z
  .enum([
    '@cf/google/gemma-4-26b-a4b-it',
    '@cf/google/gemma-3-12b-it',
    '@cf/moonshotai/kimi-k2.6',
    '@cf/meta/llama-4-scout-17b-16e-instruct',
    '@cf/mistralai/mistral-small-3.1-24b-instruct',
  ])
  .default('@cf/google/gemma-4-26b-a4b-it')

const AnalyzeImageInput = z.object({
  imageUrl: z
    .string()
    .describe(
      "Source image. Accepts: an https URL, a `data:` URL, or an R2 key like `users/<userId>/foo.png` (relative to the FILES bucket).",
    ),
  mode: z
    .enum(['caption', 'summary', 'extract'])
    .default('summary')
    .describe(
      "'caption' = 1-2 sentence text. 'summary' = structured JSON. 'extract' = custom JSON shape per `instruction`.",
    ),
  instruction: z
    .string()
    .optional()
    .describe(
      "Required for mode='extract'. Plain-language instruction describing what JSON to return. Optional for 'caption' and 'summary' (acts as a focus hint).",
    ),
  model: ModelEnum.optional(),
})

const SummaryShape = z.object({
  summary: z.string().optional(),
  scene: z
    .object({
      setting: z.string().optional(),
      time_of_day: z.string().optional(),
      weather: z.string().optional(),
      lighting: z.string().optional(),
    })
    .optional(),
  subjects: z.array(z.string()).optional(),
  visible_text: z.array(z.string()).optional(),
  identified: z
    .array(
      z.object({
        name: z.string(),
        type: z.string().optional(),
        confidence: z.string().optional(),
      }),
    )
    .optional(),
  location_hint: z
    .object({
      country_or_region: z.string().optional(),
      evidence: z.string().optional(),
    })
    .optional(),
  notable: z.array(z.string()).optional(),
})

const AnalyzeImageOutput = z.union([
  z.object({
    mode: z.literal('caption'),
    model: z.string(),
    caption: z.string(),
    latencyMs: z.number(),
  }),
  z.object({
    mode: z.literal('summary'),
    model: z.string(),
    summary: SummaryShape,
    latencyMs: z.number(),
  }),
  z.object({
    mode: z.literal('extract'),
    model: z.string(),
    data: z.unknown(),
    latencyMs: z.number(),
  }),
  z.object({ error: z.string() }),
])

// ─── HELPERS ────────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  // Avoid stack-blow on >64k spread args.
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function guessMimeType(url: string): string {
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;,]+)/)
    return m?.[1] ?? 'image/jpeg'
  }
  const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

/**
 * Resolve an `imageUrl` input to raw bytes + mime type. Supports:
 *   - https URL (fetched)
 *   - data: URL (decoded)
 *   - R2 key (looked up in FILES bucket)
 */
async function resolveImage(
  env: ImageAnalyzeEnv,
  imageUrl: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (imageUrl.startsWith('data:')) {
    const m = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!m?.[1] || !m?.[2]) throw new Error('Malformed data URL')
    const mimeType = m[1]
    const bin = atob(m[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, mimeType }
  }
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    const resp = await fetch(imageUrl)
    if (!resp.ok) throw new Error(`Image fetch failed: ${resp.status}`)
    const mimeType = resp.headers.get('content-type') ?? guessMimeType(imageUrl)
    const buf = await resp.arrayBuffer()
    return { bytes: new Uint8Array(buf), mimeType }
  }
  // Treat as R2 key
  if (!env.FILES) throw new Error('FILES R2 bucket not bound — cannot resolve R2 keys.')
  const obj = await env.FILES.get(imageUrl)
  if (!obj) throw new Error(`Image not found in R2: ${imageUrl}`)
  const buf = await obj.arrayBuffer()
  const mimeType = obj.httpMetadata?.contentType ?? guessMimeType(imageUrl)
  return { bytes: new Uint8Array(buf), mimeType }
}

/**
 * Coerce Workers AI chat-shape responses to a plain string. Newer
 * multimodal models can return `content` as an array of parts; some
 * models (Kimi thinking) put the answer in `reasoning_content`. See
 * ~/.claude/rules/workers-ai-content-coercion.md.
 */
function coerceToString(result: unknown): string {
  if (typeof result === 'string') return result
  if (result == null) return ''
  if (typeof result !== 'object') return String(result)
  const r = result as Record<string, unknown>
  if (typeof r['response'] === 'string') return r['response'] as string
  const choices = r['choices']
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = (choices[0] as Record<string, unknown>)?.['message']
    if (msg && typeof msg === 'object') {
      const m = msg as Record<string, unknown>
      const content = m['content']
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .map((p) => {
            if (!p || typeof p !== 'object') return ''
            const pp = p as Record<string, unknown>
            return typeof pp['text'] === 'string' ? (pp['text'] as string) : ''
          })
          .filter(Boolean)
          .join('\n')
      }
      if (typeof m['reasoning_content'] === 'string') return m['reasoning_content'] as string
    }
  }
  return JSON.stringify(result)
}

function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  if (fence?.[1]) return fence[1].trim()
  if (trimmed.startsWith('{')) {
    const lastBrace = trimmed.lastIndexOf('}')
    if (lastBrace > 0) return trimmed.slice(0, lastBrace + 1)
  }
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}

interface ChatMessages {
  messages: Array<{
    role: string
    content:
      | string
      | Array<{ type: string; text?: string; image_url?: { url: string } }>
  }>
}

async function runVisionModel(
  env: ImageAnalyzeEnv,
  modelId: string,
  systemPrompt: string | undefined,
  userPrompt: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ text: string; latencyMs: number }> {
  const start = Date.now()
  const dataUrl = `data:${mimeType};base64,${bytesToBase64(bytes)}`
  const messages: ChatMessages['messages'] = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: userPrompt },
      { type: 'image_url', image_url: { url: dataUrl } },
    ],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await env.AI.run(modelId as any, {
    messages,
    max_tokens: 16_384,
  } as any)) as unknown
  return { text: coerceToString(result), latencyMs: Date.now() - start }
}

// ─── TOOL ───────────────────────────────────────────────────────────────

export const analyzeImageDefinition: ToolDefinition<
  z.infer<typeof AnalyzeImageInput>,
  z.infer<typeof AnalyzeImageOutput>
> = {
  name: 'analyze_image',
  description:
    "Analyze an image with a vision model. Use when the user pastes a photo or asks 'what's in this image?'. Three modes: caption (1-2 sentence text), summary (structured JSON: scene/subjects/visible text/landmarks/location hint), extract (custom JSON per your instruction). Default model is Gemma 4 26B on Workers AI — free + good quality. Pass an https URL, data: URL, or R2 key.",
  inputSchema: AnalyzeImageInput,
  outputSchema: AnalyzeImageOutput,
  execute: async (input, ctx) => {
    const env = getEnv(ctx)
    const mode = input.mode ?? 'summary'
    const model = input.model ?? '@cf/google/gemma-4-26b-a4b-it'

    if (mode === 'extract' && !input.instruction) {
      return {
        error:
          "mode='extract' requires `instruction` describing what JSON to return.",
      }
    }

    let resolved: { bytes: Uint8Array; mimeType: string }
    try {
      resolved = await resolveImage(env, input.imageUrl)
    } catch (err) {
      return {
        error: `Could not resolve image: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    try {
      if (mode === 'caption') {
        const userPrompt = input.instruction
          ? `${CAPTION_PROMPT}\n\nFocus on: ${input.instruction}`
          : CAPTION_PROMPT
        const { text, latencyMs } = await runVisionModel(
          env,
          model,
          undefined,
          userPrompt,
          resolved.bytes,
          resolved.mimeType,
        )
        const caption = text.trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim()
        return { mode: 'caption' as const, model, caption, latencyMs }
      }

      if (mode === 'summary') {
        const userPrompt = input.instruction
          ? `${SUMMARY_USER}\n\nFocus particularly on: ${input.instruction}`
          : SUMMARY_USER
        const { text, latencyMs } = await runVisionModel(
          env,
          model,
          SUMMARY_SYSTEM,
          userPrompt,
          resolved.bytes,
          resolved.mimeType,
        )
        const json = extractJsonBlock(text)
        let parsed: unknown
        try {
          parsed = JSON.parse(json)
        } catch {
          // One retry with stricter instruction
          const retry = await runVisionModel(
            env,
            model,
            SUMMARY_SYSTEM + '\n\nReturn JSON only. No markdown fences. No commentary.',
            userPrompt,
            resolved.bytes,
            resolved.mimeType,
          )
          try {
            parsed = JSON.parse(extractJsonBlock(retry.text))
          } catch {
            return {
              error: `Model returned non-JSON for summary mode. Raw: ${text.slice(0, 200)}`,
            }
          }
        }
        const validated = SummaryShape.safeParse(parsed)
        return {
          mode: 'summary' as const,
          model,
          summary: validated.success
            ? validated.data
            : (parsed as z.infer<typeof SummaryShape>),
          latencyMs,
        }
      }

      // extract mode
      const systemPrompt = `You are a visual-extraction assistant. Return ONLY valid JSON matching the user's described shape. Never invent details that aren't visible. No markdown fences, no commentary.`
      const userPrompt = `Look at this image and extract the following as JSON:\n\n${input.instruction}\n\nReturn JSON only.`
      const { text, latencyMs } = await runVisionModel(
        env,
        model,
        systemPrompt,
        userPrompt,
        resolved.bytes,
        resolved.mimeType,
      )
      const json = extractJsonBlock(text)
      let parsed: unknown
      try {
        parsed = JSON.parse(json)
      } catch {
        return {
          error: `Model returned non-JSON for extract mode. Raw: ${text.slice(0, 300)}`,
        }
      }
      return { mode: 'extract' as const, model, data: parsed, latencyMs }
    } catch (err) {
      return {
        error: `Vision model failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
  render: { icon: Eye, displayName: 'Analyze Image' },
}

export const imageAnalyzeDefinitions = [
  analyzeImageDefinition,
] as ToolDefinition<unknown, unknown>[]

export type AnalyzeImageOutput = z.infer<typeof AnalyzeImageOutput>
