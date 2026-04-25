/**
 * Image Editing Tool — Gemini 3.1 Flash Image (Nano Banana 2) via OpenRouter.
 *
 * Image-to-image edits: take a source image + a text instruction
 * ("change the sky to sunset", "remove the car", "make it watercolor")
 * and return the edited image saved to R2.
 *
 * Why Gemini 3.1 Flash Image:
 *   - Pro-level edit quality at Flash speed + cost
 *   - Native multi-turn editing via thoughtSignature (this tool ships
 *     with single-turn — multi-turn is a follow-up)
 *   - Default image gen engine in the Gemini app + Search AI Mode
 *   - Released 2026-02-26
 *
 * Why OpenRouter (not direct Google API):
 *   - One key (OPENROUTER_API_KEY) unlocks every non-Workers-AI model
 *     in the starter — keeps env clean
 *   - Standard auth + rate-limit envelope
 *
 * See docs/VISION_AND_IMAGE_EDITING.md.
 */
import { z } from 'zod'
import { Wand2 } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

type ImageEditEnv = {
  AI: Ai
  FILES?: R2Bucket
  OPENROUTER_API_KEY?: string
}

function getEnv(ctx: AgentContext): ImageEditEnv {
  return ctx.env as unknown as ImageEditEnv
}

const EditImageInput = z.object({
  sourceImageUrl: z
    .string()
    .describe(
      "The image to edit. Accepts: an https URL, a `data:` URL, or an R2 key like `users/<userId>/foo.png`.",
    ),
  prompt: z
    .string()
    .describe(
      "Edit instruction. Be specific about what to keep, what to change, and what to NOT change. e.g. 'Keep the house, yard, and ute. Change only the sky to a sunset with warm orange and pink clouds.'",
    ),
  aspectRatio: z
    .enum(['1:1', '4:3', '3:4', '16:9', '9:16', '4:5', '21:9'])
    .optional()
    .describe('Optional output aspect ratio. Default: matches source.'),
})

const EditImageOutput = z.union([
  z.object({
    url: z.string(),
    key: z.string(),
    prompt: z.string(),
    sizeBytes: z.number(),
    model: z.string(),
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

function guessMimeType(url: string): string {
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;,]+)/)
    return m?.[1] ?? 'image/jpeg'
  }
  const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

async function resolveImage(
  env: ImageEditEnv,
  imageUrl: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (imageUrl.startsWith('data:')) {
    const m = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!m?.[1] || !m?.[2]) throw new Error('Malformed data URL')
    const bin = atob(m[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, mimeType: m[1] }
  }
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    const resp = await fetch(imageUrl)
    if (!resp.ok) throw new Error(`Image fetch failed: ${resp.status}`)
    const mimeType = resp.headers.get('content-type') ?? guessMimeType(imageUrl)
    return { bytes: new Uint8Array(await resp.arrayBuffer()), mimeType }
  }
  if (!env.FILES) throw new Error('FILES R2 bucket not bound — cannot resolve R2 keys.')
  const obj = await env.FILES.get(imageUrl)
  if (!obj) throw new Error(`Image not found in R2: ${imageUrl}`)
  const mimeType = obj.httpMetadata?.contentType ?? guessMimeType(imageUrl)
  return { bytes: new Uint8Array(await obj.arrayBuffer()), mimeType }
}

const NANO_BANANA_2_ID = 'google/gemini-3.1-flash-image-preview'

export const editImageDefinition: ToolDefinition<
  z.infer<typeof EditImageInput>,
  z.infer<typeof EditImageOutput>
> = {
  name: 'edit_image',
  description:
    "Edit an existing image with a text instruction. Use when the user wants to modify a photo (change colors, swap subjects, change time-of-day, apply a style). Powered by Gemini 3.1 Flash Image (Nano Banana 2). Be specific about what to keep vs change. Returns a URL of the edited image saved to R2.",
  inputSchema: EditImageInput,
  outputSchema: EditImageOutput,
  isAvailable: (ctx) => {
    const env = getEnv(ctx)
    return !!(env.OPENROUTER_API_KEY && env.FILES)
  },
  execute: async (input, ctx) => {
    const env = getEnv(ctx)
    if (!env.OPENROUTER_API_KEY) {
      return { error: 'OPENROUTER_API_KEY not set — image editing requires Nano Banana 2 via OpenRouter.' }
    }
    if (!env.FILES) {
      return { error: 'FILES R2 bucket not bound — cannot persist edited image.' }
    }

    let resolved: { bytes: Uint8Array; mimeType: string }
    try {
      resolved = await resolveImage(env, input.sourceImageUrl)
    } catch (err) {
      return {
        error: `Could not resolve source image: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    try {
      // OpenRouter chat-completions API supports image inputs as
      // image_url content parts. Gemini 3.1 Flash Image returns the
      // edited image as an image_url part on the assistant message.
      const dataUrl = `data:${resolved.mimeType};base64,${bytesToBase64(resolved.bytes)}`
      const userText = input.aspectRatio
        ? `${input.prompt}\n\nOutput aspect ratio: ${input.aspectRatio}.`
        : input.prompt

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://vite-flare-starter.workers.dev',
          'X-Title': 'vite-flare-starter',
        },
        body: JSON.stringify({
          model: NANO_BANANA_2_ID,
          modalities: ['image', 'text'],
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: userText },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      })
      if (!resp.ok) {
        const text = await resp.text()
        return {
          error: `Nano Banana 2 edit failed: ${resp.status} ${text.slice(0, 300)}`,
        }
      }
      const json = (await resp.json()) as {
        choices?: Array<{
          message?: {
            images?: Array<{
              type?: string
              image_url?: { url?: string }
            }>
            content?: unknown
          }
        }>
      }
      const msg = json.choices?.[0]?.message
      // OpenRouter for Gemini image returns generated images on
      // `message.images[]` as data URLs. Some providers may instead
      // embed them in `content` as image_url parts — handle both.
      let imageDataUrl: string | undefined
      const imgs = msg?.images
      if (Array.isArray(imgs) && imgs.length > 0) {
        imageDataUrl = imgs[0]?.image_url?.url
      }
      if (!imageDataUrl && Array.isArray(msg?.content)) {
        for (const part of msg.content as Array<{ type?: string; image_url?: { url?: string } }>) {
          if (part.type === 'image_url' && part.image_url?.url) {
            imageDataUrl = part.image_url.url
            break
          }
        }
      }
      if (!imageDataUrl) {
        return {
          error: 'Nano Banana 2 returned no image — possibly refused or the model misinterpreted the prompt.',
        }
      }
      const m = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!m?.[1] || !m?.[2]) {
        return { error: 'Edited image was not in the expected data URL format.' }
      }
      const outMime = m[1]
      const bin = atob(m[2])
      const outBytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) outBytes[i] = bin.charCodeAt(i)

      // Key MUST start with `users/${userId}/` so /api/files/download/* ownership check passes.
      const ext = outMime === 'image/png' ? 'png' : outMime === 'image/webp' ? 'webp' : 'jpg'
      const key = `users/${ctx.userId}/edited/${crypto.randomUUID()}.${ext}`
      await env.FILES.put(key, outBytes, {
        httpMetadata: { contentType: outMime },
        customMetadata: {
          prompt: input.prompt,
          model: NANO_BANANA_2_ID,
          userId: ctx.userId,
        },
      })

      return {
        url: `/api/files/download/${encodeURIComponent(key)}`,
        key,
        prompt: input.prompt,
        sizeBytes: outBytes.length,
        model: NANO_BANANA_2_ID,
      }
    } catch (err) {
      return {
        error: `Image edit failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
  render: { icon: Wand2, displayName: 'Edit Image' },
}

export const imageEditDefinitions = [
  editImageDefinition,
] as ToolDefinition<unknown, unknown>[]

export type EditImageOutput = z.infer<typeof EditImageOutput>
