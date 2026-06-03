/**
 * Gemini 3.1 Flash Image (Nano Banana 2) — direct Google AI Studio API.
 *
 * Why direct rather than via OpenRouter:
 *   - OpenRouter sometimes loses or rewrites the encrypted `thoughtSignature`
 *     parts that Gemini 3 models attach to assistant turns. Multi-turn image
 *     editing chains break without them.
 *   - One less network hop, no markup.
 *
 * The starter exposes this as `provider: 'gemini-direct'` on `edit_image`
 * and `generate_image`. Requires `GEMINI_API_KEY` (Google AI Studio key from
 * https://aistudio.google.com/apikey).
 *
 * See ~/.claude/rules/gemini-image.md for prompt patterns + thoughtSignature
 * handling for future multi-turn support.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const NANO_BANANA_2_MODEL = 'gemini-3.1-flash-image-preview'

interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
  thoughtSignature?: string
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

/**
 * Convert raw bytes → base64 without stack-blowing on large images.
 * String.fromCharCode(...spread) breaks at ~64k args on V8.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export interface GeminiImageOptions {
  /** Optional Google AI Studio aspect ratio (1:1, 16:9, etc.). */
  aspectRatio?: string
  /** "1K" | "2K" | "4K" — uppercase K required by the API. */
  imageSize?: string
}

/**
 * Generate or edit an image via Gemini 3.1 Flash Image directly.
 *
 * @param apiKey GEMINI_API_KEY
 * @param prompt Edit instruction or generation prompt
 * @param sourceImage Optional source image for image-to-image edits.
 *                    Omit for text-to-image generation.
 * @returns Decoded image bytes + mime type
 */
export async function callGeminiImage(
  apiKey: string,
  prompt: string,
  sourceImage?: { bytes: Uint8Array; mimeType: string },
  options: GeminiImageOptions = {}
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const parts: GeminiPart[] = [{ text: prompt }]
  if (sourceImage) {
    parts.push({
      inlineData: {
        mimeType: sourceImage.mimeType,
        data: bytesToBase64(sourceImage.bytes),
      },
    })
  }

  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(options.aspectRatio || options.imageSize
        ? {
            imageConfig: {
              ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
              ...(options.imageSize ? { imageSize: options.imageSize } : {}),
            },
          }
        : {}),
    },
  }

  const url = `${GEMINI_API_BASE}/models/${NANO_BANANA_2_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Gemini image API ${resp.status}: ${text.slice(0, 300)}`)
  }
  const json = (await resp.json()) as GeminiResponse
  if (json.error?.message) {
    throw new Error(`Gemini image: ${json.error.message}`)
  }
  if (json.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request: ${json.promptFeedback.blockReason}`)
  }
  const candidate = json.candidates?.[0]
  if (!candidate) {
    throw new Error('Gemini returned no candidates — model may have refused.')
  }

  // Find the first inline image part on the candidate. Gemini may also
  // emit text parts (description of what was generated) alongside.
  const imagePart = candidate.content?.parts?.find((p) => p.inlineData?.data)
  if (!imagePart?.inlineData?.data) {
    throw new Error('Gemini candidate had no inline image data.')
  }

  const bin = atob(imagePart.inlineData.data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, mimeType: imagePart.inlineData.mimeType || 'image/png' }
}

export const NANO_BANANA_2_DIRECT_LABEL = `gemini-direct:${NANO_BANANA_2_MODEL}`
