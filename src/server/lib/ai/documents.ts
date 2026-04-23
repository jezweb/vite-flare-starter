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

const DEFAULT_VISION_MODEL = '@cf/moonshotai/kimi-k2.6'

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

/**
 * MIME types that env.AI.toMarkdown handles natively.
 *
 * Cloudflare's toMarkdown accepts a broad set: PDFs, OOXML office formats
 * (docx/xlsx/pptx), legacy office (doc/xls/ppt), HTML, CSV/TSV, eBook formats,
 * images via OCR, and more. See the Workers AI docs for the authoritative list.
 */
const TOMARKDOWN_TYPES = new Set([
  'application/pdf',
  // Microsoft Office — OOXML (ZIP-based)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  // Legacy Office (best-effort)
  'application/msword', // .doc
  'application/vnd.ms-excel', // .xls
  'application/vnd.ms-powerpoint', // .ppt
  // OpenDocument
  'application/vnd.oasis.opendocument.text', // .odt
  'application/vnd.oasis.opendocument.spreadsheet', // .ods
  'application/vnd.oasis.opendocument.presentation', // .odp
  // Spreadsheets / data
  'text/csv',
  'text/tab-separated-values',
  // Web / markup
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  // Rich text
  'application/rtf',
  'text/rtf',
  // eBooks
  'application/epub+zip',
  // Images (OCR)
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/tiff',
  'image/bmp',
])

/** Image MIME types — used to decide whether vision fallback is viable. */
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/tiff',
  'image/bmp',
])

/** MIME types we can handle (toMarkdown + vision + plain text). */
const ALL_CONVERTIBLE = new Set([
  ...TOMARKDOWN_TYPES,
  'text/plain',
  'text/markdown',
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

  // Try Cloudflare's built-in converter (free, handles PDF + office + images)
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
      console.warn(JSON.stringify({
        event: 'toMarkdown_failed',
        mimeType,
        filename: options?.filename,
        error: err instanceof Error ? err.message : String(err),
      }))
      // For non-image binaries (docx, xlsx, pdf) vision fallback can't read the
      // actual content — it'll hallucinate from ZIP/PDF headers. Return a clear
      // error instead of producing plausible-but-wrong output.
      if (!IMAGE_TYPES.has(mimeType)) {
        return `[Failed to extract content from ${options?.filename || mimeType}. The file may be corrupt or in an unsupported format.]`
      }
    }
  }

  // Vision model fallback — only safe for image types (sending binary office
  // files to a vision model produces confident-sounding hallucinations).
  if (IMAGE_TYPES.has(mimeType) || mimeType.startsWith('image/')) {
    return extractWithVision(env, data, mimeType, options)
  }

  // Unknown binary format — don't send to an LLM, don't try UTF-8 decode
  // (that's what produced the "PK..." docx confusion we're fixing).
  return `[Unsupported file type: ${mimeType}. The model cannot read this format.]`
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
