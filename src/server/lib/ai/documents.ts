/**
 * Document Conversion
 *
 * Converts uploaded files (PDF, images, text) to markdown that can be
 * injected into AI context. Uses AI SDK so it works with any provider's
 * vision-capable model — Kimi K2.5 is the default (best quality on Workers AI).
 *
 * @example
 * import { convertToMarkdown } from '@/server/lib/ai/documents'
 *
 * const markdown = await convertToMarkdown(env, pdfBuffer, 'application/pdf')
 *
 * // Use in system prompt
 * const system = buildSystemPrompt({
 *   knowledge: [{ title: 'Uploaded Document', content: markdown }],
 * })
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

/**
 * Default model for document conversion.
 *
 * Kimi K2.5 leads Workers AI for vision tasks — 256k context, strong OCR,
 * structured output. Override via the `model` option if you prefer another.
 */
const DEFAULT_VISION_MODEL = '@cf/moonshotai/kimi-k2.5'

export interface ConvertOptions {
  /** Override the model (any vision-capable model ID) */
  model?: string
  /** Original filename for context */
  filename?: string
  /** Custom extraction prompt */
  prompt?: string
}

/**
 * Convert a document or image to markdown text.
 *
 * Supported formats:
 * - Images (JPEG, PNG, WebP, GIF) — OCR + scene description
 * - PDF — text extraction with structure preservation
 * - Plain text — returned as-is
 *
 * For Office docs (DOCX, XLSX), convert to PDF first.
 */
export async function convertToMarkdown(
  env: DocumentEnv,
  data: ArrayBuffer | Uint8Array,
  mimeType: string,
  options: ConvertOptions = {}
): Promise<string> {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data

  // Plain text — pass through
  if (mimeType.startsWith('text/')) {
    return new TextDecoder().decode(bytes)
  }

  // Images and PDFs — use vision model via AI SDK
  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    return extractWithVision(env, bytes, mimeType, options)
  }

  // Unsupported format — return a clear message
  const ext = options.filename?.split('.').pop() || mimeType
  return `[Document: ${ext} — conversion not supported. Upload as PDF, image, or plain text.]`
}

/**
 * Extract text from image or PDF using a vision-capable model via AI SDK.
 *
 * Works with any provider — Workers AI (Kimi K2.5), Anthropic (Claude),
 * OpenAI (GPT-4o), Google (Gemini). Model chosen via resolveModel().
 */
async function extractWithVision(
  env: DocumentEnv,
  bytes: Uint8Array,
  mimeType: string,
  options: ConvertOptions
): Promise<string> {
  try {
    const modelId = options.model || DEFAULT_VISION_MODEL
    const model = resolveModel(env, modelId)

    const defaultPrompt = mimeType === 'application/pdf'
      ? 'Extract all text from this PDF. Preserve structure: headings as markdown, lists as markdown, tables as markdown tables. Keep the original reading order.'
      : 'Extract all text visible in this image as markdown. If there is no text, describe the image in detail. For documents, preserve structure (headings, lists, tables).'

    const prompt = options.prompt || defaultPrompt

    // AI SDK handles file part conversion for any vision-capable provider
    const { text } = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'file',
              data: bytes,
              mediaType: mimeType,
            },
          ],
        },
      ],
      maxOutputTokens: 8192,
    })

    if (text && text.length > 10) return text

    return `[Extraction returned minimal content — ${(bytes.length / 1024).toFixed(0)}KB file. The document may be image-based, encrypted, or empty.]`
  } catch (error) {
    console.error(JSON.stringify({
      event: 'document_extraction_failed',
      mimeType,
      size: bytes.length,
      error: error instanceof Error ? error.message : String(error),
    }))
    return `[Document extraction failed — ${mimeType}, ${(bytes.length / 1024).toFixed(0)}KB]`
  }
}

/**
 * Check if a MIME type is supported for conversion.
 */
export function isConvertible(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf'
  )
}
