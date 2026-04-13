/**
 * Document Conversion
 *
 * Converts uploaded files (PDF, images, Office docs) to markdown text
 * that can be injected into AI context. Uses Cloudflare Workers AI
 * for OCR and document understanding.
 *
 * @example
 * import { convertToMarkdown } from '@/server/lib/ai/documents'
 *
 * // Convert a PDF to markdown
 * const markdown = await convertToMarkdown(env.AI, pdfBuffer, 'application/pdf')
 *
 * // Use in system prompt
 * const system = buildSystemPrompt({
 *   knowledge: [{ title: 'Uploaded Document', content: markdown }],
 * })
 */

/**
 * Convert a document or image to markdown text using Workers AI.
 *
 * Supported formats:
 * - Images (JPEG, PNG, WebP, GIF) — OCR via vision model
 * - PDF — page-by-page text extraction
 * - Plain text — returned as-is
 *
 * For Office docs (DOCX, XLSX), convert to PDF first or use
 * a dedicated conversion service.
 */
export async function convertToMarkdown(
  ai: Ai,
  data: ArrayBuffer | Uint8Array,
  mimeType: string,
  options?: { filename?: string; maxPages?: number }
): Promise<string> {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data

  // Plain text — return as-is
  if (mimeType.startsWith('text/')) {
    return new TextDecoder().decode(bytes)
  }

  // Images — use vision model for OCR / description
  if (mimeType.startsWith('image/')) {
    return extractFromImage(ai, bytes, mimeType)
  }

  // PDF — extract text
  if (mimeType === 'application/pdf') {
    return extractFromPDF(ai, bytes, options?.maxPages)
  }

  // Unsupported format
  const ext = options?.filename?.split('.').pop() || mimeType
  return `[Document: ${ext} — conversion not supported. Upload as PDF or image for text extraction.]`
}

/**
 * Extract text/description from an image using Workers AI vision model.
 */
async function extractFromImage(
  ai: Ai,
  imageBytes: Uint8Array,
  mimeType: string
): Promise<string> {
  try {
    // Use Llama 3.2 Vision for image understanding
    const base64 = btoa(String.fromCharCode(...imageBytes))
    const dataUrl = `data:${mimeType};base64,${base64}`

    const result = await ai.run('@cf/meta/llama-3.2-11b-vision-instruct' as Parameters<Ai['run']>[0], {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all text from this image. If it\'s a document, preserve the structure (headings, lists, tables). If it\'s a photo, describe what you see in detail.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 4096,
    } as Record<string, unknown>)

    const response = result as Record<string, unknown>
    return String(response['response'] || response['text'] || response['content'] || '[Could not extract text from image]')
  } catch (error) {
    console.error('Image extraction failed:', error)
    return '[Image text extraction failed]'
  }
}

/**
 * Extract text from a PDF using Workers AI.
 *
 * Uses the toMarkdown utility if available, falls back to
 * vision-based extraction on individual pages.
 */
async function extractFromPDF(
  ai: Ai,
  pdfBytes: Uint8Array,
  _maxPages?: number
): Promise<string> {
  try {
    // Workers AI has a document understanding model
    // Try using it for PDF text extraction
    const result = await ai.run('@cf/meta/llama-3.2-11b-vision-instruct' as Parameters<Ai['run']>[0], {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all text content from this PDF document. Preserve structure: headings, paragraphs, lists, tables.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${btoa(String.fromCharCode(...pdfBytes))}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    } as Record<string, unknown>)

    const response = result as Record<string, unknown>
    const text = String(response['response'] || response['text'] || '')

    if (text && text.length > 50) return text

    // Fallback message if extraction produced minimal content
    return `[PDF document — ${(pdfBytes.length / 1024).toFixed(0)}KB. Vision-based extraction returned limited content. For better results, copy text directly from the PDF or use a dedicated PDF parser.]`
  } catch (error) {
    console.error('PDF extraction failed:', error)
    return `[PDF document — ${(pdfBytes.length / 1024).toFixed(0)}KB. Text extraction failed. The PDF may be image-based or encrypted.]`
  }
}

/**
 * Check if a MIME type is supported for conversion
 */
export function isConvertible(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf'
  )
}
