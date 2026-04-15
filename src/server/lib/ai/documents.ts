/**
 * Document Conversion — converts files to markdown for AI context.
 *
 * Two strategies:
 * 1. `env.AI.toMarkdown()` — Cloudflare's built-in converter (free, fast,
 *    handles PDFs natively + images via Workers AI vision models). Preferred.
 * 2. Vision model fallback — sends the file as an image to a vision-capable
 *    LLM (Kimi K2.5 default). Used when toMarkdown isn't available or for
 *    formats it doesn't support.
 *
 * @example
 * const markdown = await convertToMarkdown(env, pdfBuffer, 'application/pdf', { filename: 'report.pdf' })
 */
import { generateText } from 'ai'
import { resolveModel } from './providers'

interface DocumentEnv {
  AI: Ai
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  OPENROUTER_API_KEY?: string
}

const DEFAULT_VISION_MODEL = '@cf/moonshotai/kimi-k2.5'

export interface ConvertOptions {
  /** Override the model for vision fallback */
  model?: string
  /** Original filename for context */
  filename?: string
  /** Custom extraction prompt */
  prompt?: string
  /** Force vision model instead of toMarkdown */
  forceVision?: boolean
}

/** MIME types that env.AI.toMarkdown handles natively. */
const TOMARKDOWN_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

/** MIME types we can handle (toMarkdown + vision + plain text). */
const ALL_CONVERTIBLE = new Set([
  ...TOMARKDOWN_TYPES,
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
])

export function isConvertible(mimeType: string): boolean {
  return ALL_CONVERTIBLE.has(mimeType) || mimeType.startsWith('image/') || mimeType.startsWith('text/')
}

/**
 * Convert a document or image to markdown.
 *
 * Tries `env.AI.toMarkdown()` first (free, fast, native PDF parsing).
 * Falls back to vision model for unsupported formats or errors.
 */
export async function convertToMarkdown(
  env: DocumentEnv,
  data: ArrayBuffer | Uint8Array,
  mimeType: string,
  options?: ConvertOptions,
): Promise<string> {
  // Plain text — pass through
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return new TextDecoder().decode(data)
  }

  // Try Cloudflare's built-in converter (free, handles PDF + images)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ai = env.AI as any
  if (!options?.forceVision && TOMARKDOWN_TYPES.has(mimeType) && typeof ai?.toMarkdown === 'function') {
    try {
      const result = await ai.toMarkdown([
        {
          name: options?.filename || `file.${mimeType.split('/')[1]}`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          blob: new Blob([data as any], { type: mimeType }),
        },
      ]) as { name: string; data: string }[]
      if (result?.[0]?.data) {
        return result[0].data
      }
    } catch (err) {
      console.warn('toMarkdown failed, falling back to vision model:', err)
    }
  }

  // Vision model fallback — send as image/file to an LLM
  return extractWithVision(env, data, mimeType, options)
}

async function extractWithVision(
  env: DocumentEnv,
  data: ArrayBuffer | Uint8Array,
  mimeType: string,
  options?: ConvertOptions,
): Promise<string> {
  const modelId = options?.model || DEFAULT_VISION_MODEL
  const model = resolveModel(env as Parameters<typeof resolveModel>[0], modelId)

  const prompt = options?.prompt ||
    `Extract all text content from this ${options?.filename || 'document'} and convert it to well-formatted markdown. ` +
    'Preserve headings, lists, tables, and structure. If there are images, describe them briefly.'

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const base64 = btoa(String.fromCharCode(...bytes))
  const dataUrl = `data:${mimeType};base64,${base64}`

  try {
    const { text } = await generateText({
      model,
      messages: [
        {
          role: 'user',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [
            { type: 'file', data: dataUrl, mimeType },
            { type: 'text', text: prompt },
          ] as any,
        },
      ],
    })
    return text
  } catch (err) {
    return `[Document conversion failed: ${err instanceof Error ? err.message : 'unknown error'}]`
  }
}
