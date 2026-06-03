/**
 * Image Generation Tool — multi-provider text-to-image.
 *
 * Providers (pass via `provider`):
 *   - 'workers-ai' (default, free) — FLUX Schnell on Cloudflare Workers AI
 *   - 'openai' — GPT Image 2 (gpt-image-2) — OpenAI's current default,
 *      paid, needs OPENAI_API_KEY. Released 2026-04-21, GA on the
 *      developer API now. Multilingual text, slides, infographics.
 *   - 'openai-1' — GPT Image 1 (gpt-image-1) — legacy fallback, kept
 *      for forks that need the older model.
 *   - 'nano-banana-2' — Gemini 3.1 Flash Image Preview via OpenRouter.
 *      Paid, needs OPENROUTER_API_KEY. Pro-quality at Flash speed.
 *   - 'gemini-direct' — same Gemini model, direct via Google AI Studio.
 *      Better for multi-turn editing chains (preserves thoughtSignature).
 *      Paid, needs GEMINI_API_KEY.
 *
 * Generated images are stored in R2 under `users/${userId}/generated/`
 * and a download URL is returned. Requires the FILES bucket binding.
 *
 * See docs/VISION_AND_IMAGE_EDITING.md.
 */
import { generateImage, type ImageModel } from 'ai'
import { z } from 'zod'
import { createWorkersAI } from 'workers-ai-provider'
import { ImageIcon } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'
import { callGeminiImage, NANO_BANANA_2_DIRECT_LABEL } from '@/server/lib/gemini-image'

type ImageEnv = {
  AI: Ai
  FILES?: R2Bucket
  OPENAI_API_KEY?: string
  OPENROUTER_API_KEY?: string
  GEMINI_API_KEY?: string
}

function getImageEnv(ctx: AgentContext): ImageEnv {
  return ctx.env as unknown as ImageEnv
}

const ProviderEnum = z.enum(['workers-ai', 'openai', 'openai-1', 'nano-banana-2', 'gemini-direct'])

const GenerateImageInput = z.object({
  prompt: z
    .string()
    .describe(
      'Detailed image description — be specific about subject, style, lighting, composition'
    ),
  size: z
    .string()
    .optional()
    .describe(
      'Image size: 1024x1024 (default), 1536x1024, 1024x1536. Some providers (Workers AI FLUX) ignore non-square sizes.'
    ),
  provider: ProviderEnum.optional().describe(
    "Image provider. 'workers-ai' (default, free FLUX), 'openai' (GPT Image 2 — paid, multilingual text + infographics), 'openai-1' (legacy GPT Image 1), 'nano-banana-2' (Gemini via OpenRouter), 'gemini-direct' (Gemini direct — best for multi-turn)."
  ),
})

const GenerateImageOutput = z.union([
  z.object({
    url: z.string(),
    key: z.string(),
    prompt: z.string(),
    provider: z.string(),
    model: z.string(),
    sizeBytes: z.number(),
  }),
  z.object({ error: z.string() }),
])

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Generate via Nano Banana 2 (Gemini 3.1 Flash Image) on OpenRouter.
 * Returns raw bytes + mime type.
 */
async function generateNanoBanana2(
  apiKey: string,
  prompt: string,
  size: string | undefined
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const text = size ? `${prompt}\n\nOutput size: ${size}.` : prompt
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://vite-flare-starter.workers.dev',
      'X-Title': 'vite-flare-starter',
    },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-image-preview',
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
    }),
  })
  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`OpenRouter Nano Banana 2: ${resp.status} ${errText.slice(0, 300)}`)
  }
  const json = (await resp.json()) as {
    choices?: Array<{
      message?: {
        images?: Array<{ image_url?: { url?: string } }>
        content?: unknown
      }
    }>
  }
  const msg = json.choices?.[0]?.message
  let dataUrl: string | undefined = msg?.images?.[0]?.image_url?.url
  if (!dataUrl && Array.isArray(msg?.content)) {
    for (const part of msg.content as Array<{ type?: string; image_url?: { url?: string } }>) {
      if (part.type === 'image_url' && part.image_url?.url) {
        dataUrl = part.image_url.url
        break
      }
    }
  }
  if (!dataUrl) throw new Error('Nano Banana 2 returned no image — model may have refused.')
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!m?.[1] || !m?.[2])
    throw new Error('Generated image was not in the expected data URL format.')
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, mimeType: m[1] }
}

export const generateImageDefinition: ToolDefinition<
  z.infer<typeof GenerateImageInput>,
  z.infer<typeof GenerateImageOutput>
> = {
  name: 'generate_image',
  description:
    "Generate an image from a text description. Saved to R2, returns a URL. Use when the user asks to create / draw / generate an image. Default provider is free Workers AI FLUX. Use 'nano-banana-2' for photorealistic scenes or 'openai-2' for text-heavy infographics (when GA).",
  inputSchema: GenerateImageInput,
  outputSchema: GenerateImageOutput,
  isAvailable: (ctx) => !!getImageEnv(ctx).FILES,
  execute: async ({ prompt, size, provider = 'workers-ai' }, ctx) => {
    const env = getImageEnv(ctx)
    if (!env.FILES) return { error: 'FILES R2 bucket not bound.' }

    try {
      let bytes: Uint8Array
      let mimeType = 'image/png'
      let modelLabel = ''

      if (provider === 'gemini-direct') {
        if (!env.GEMINI_API_KEY) {
          return {
            error: "provider='gemini-direct' requires GEMINI_API_KEY (Google AI Studio key).",
          }
        }
        const out = await callGeminiImage(env.GEMINI_API_KEY, prompt)
        bytes = out.bytes
        mimeType = out.mimeType
        modelLabel = NANO_BANANA_2_DIRECT_LABEL
      } else if (provider === 'nano-banana-2') {
        if (!env.OPENROUTER_API_KEY) {
          return { error: "provider='nano-banana-2' requires OPENROUTER_API_KEY." }
        }
        const out = await generateNanoBanana2(env.OPENROUTER_API_KEY, prompt, size)
        bytes = out.bytes
        mimeType = out.mimeType
        modelLabel = 'google/gemini-3.1-flash-image-preview'
      } else if (provider === 'openai' || provider === 'openai-1') {
        if (!env.OPENAI_API_KEY) {
          return { error: `provider='${provider}' requires OPENAI_API_KEY.` }
        }
        const { createOpenAI } = await import('@ai-sdk/openai')
        const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
        // 'openai' → GPT Image 2 (current default, GA as of 2026-04-21).
        // 'openai-1' → legacy gpt-image-1 fallback.
        const modelId = provider === 'openai-1' ? 'gpt-image-1' : 'gpt-image-2'
        const imageModel: ImageModel = openai.image(modelId)
        const { image } = await generateImage({
          model: imageModel,
          prompt,
          size: (size || '1024x1024') as `${number}x${number}`,
        })
        bytes = image.uint8Array
        modelLabel = modelId
      } else {
        // workers-ai (default, free)
        const workersai = createWorkersAI({ binding: env.AI })
        const imageModel: ImageModel = workersai.image('@cf/black-forest-labs/flux-1-schnell')
        const { image } = await generateImage({
          model: imageModel,
          prompt,
          size: (size || '1024x1024') as `${number}x${number}`,
        })
        bytes = image.uint8Array
        modelLabel = '@cf/black-forest-labs/flux-1-schnell'
      }

      const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
      // Key MUST start with `users/${userId}/` so /api/files/download/* ownership check passes.
      const key = `users/${ctx.userId}/generated/${crypto.randomUUID()}.${ext}`
      await env.FILES.put(key, bytes, {
        httpMetadata: { contentType: mimeType },
        customMetadata: { prompt, provider, model: modelLabel, userId: ctx.userId },
      })

      return {
        url: `/api/files/download/${encodeURIComponent(key)}`,
        key,
        prompt,
        provider,
        model: modelLabel,
        sizeBytes: bytes.length,
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: ImageIcon, displayName: 'Generate Image' },
}

export const imageDefinitions = [generateImageDefinition] as ToolDefinition<unknown, unknown>[]

// Re-exported so the bytesToBase64 helper has a "used" reference and tests can import it later.
export { bytesToBase64 }
