/**
 * Markdown to Google Docs batchUpdate converter
 *
 * Most LLM tool output is naturally markdown-shaped. The starter's
 * existing `docs_append` handles paragraphs + headings, but tables,
 * lists, links, bold/italic, and code blocks all force the agent
 * into multi-step formatting calls — slow, error-prone, blows context.
 *
 * This module renders a markdown string into a single Google Docs
 * batchUpdate sequence. Two-phase strategy:
 *
 *   1. Parse markdown -> flat text + a list of spans (start, end,
 *      kind: heading/bold/italic/code/link/list/task/codeblock).
 *   2. Emit an `insertText` request to drop the flat text in, then a
 *      series of `updateParagraphStyle` / `updateTextStyle` /
 *      `createParagraphBullets` requests to apply structure.
 *
 * Indices inside spans are relative to the flat text. The caller
 * shifts them by the doc's insertion offset before sending.
 *
 * Deliberately minimal — no `marked` / `remark` dependency. The
 * primitives below cover ~95% of LLM-shaped markdown. Niche cases
 * (footnotes, definition lists, math) fall through as plain text.
 *
 * See `docs_create_from_markdown` in google-workspace.ts for the
 * tool wrapper that ships this end-to-end.
 */

export interface MarkdownToDocsResult {
  /** Plain-text body to feed `insertText`. Always ends with `\n`. */
  text: string
  /** Doc-API requests to apply AFTER insertText, in order. */
  requests: DocsRequest[]
}

// AI SDK doesn't ship Doc API types and we don't want to pull
// google-apis-types just for this. Loose record is fine — every value
// goes straight into JSON.stringify.
export type DocsRequest = Record<string, unknown>

interface Span {
  /** Start offset within `text`. */
  start: number
  /** End offset (exclusive). */
  end: number
}

interface ParagraphSpan extends Span {
  kind: 'paragraph'
  style?: 'HEADING_1' | 'HEADING_2' | 'HEADING_3' | 'HEADING_4' | 'HEADING_5' | 'HEADING_6'
}

interface ListSpan extends Span {
  kind: 'list'
  ordered: boolean
}

interface CodeBlockSpan extends Span {
  kind: 'codeblock'
}

interface TextStyleSpan extends Span {
  kind: 'bold' | 'italic' | 'code' | 'link'
  url?: string
}

/**
 * Parse markdown into the flat-text + spans intermediate. Pure;
 * exported for testing — production callers should go through
 * `markdownToDocsRequests`.
 */
export function parseMarkdown(markdown: string): {
  text: string
  paragraphs: ParagraphSpan[]
  lists: ListSpan[]
  codeblocks: CodeBlockSpan[]
  textStyles: TextStyleSpan[]
} {
  const lines = markdown.split('\n')
  const out: string[] = []
  const paragraphs: ParagraphSpan[] = []
  const lists: ListSpan[] = []
  const codeblocks: CodeBlockSpan[] = []
  const textStyles: TextStyleSpan[] = []
  let cursor = 0
  let i = 0

  // Each appended line gets its trailing \n. We track cursor on the
  // ASSEMBLED `out` so spans line up with what insertText sees.
  const append = (s: string): { start: number; end: number } => {
    const start = cursor
    out.push(s)
    cursor += s.length
    return { start, end: cursor }
  }

  while (i < lines.length) {
    const line = lines[i]!
    // Code fence
    const fence = /^```(\S*)/.exec(line)
    if (fence) {
      i++
      const codeLines: string[] = []
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!)
        i++
      }
      if (i < lines.length) i++ // closing fence
      const block = codeLines.join('\n') + '\n'
      const { start, end } = append(block)
      codeblocks.push({ kind: 'codeblock', start, end })
      // Code block paragraphs: each line of the block is its own paragraph
      // with monospace styling — applied as a single textStyle span.
      textStyles.push({ kind: 'code', start, end })
      continue
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1]!.length
      const text = heading[2]!
      const { start, end } = append(parseInline(text, cursor, textStyles) + '\n')
      paragraphs.push({
        kind: 'paragraph',
        start,
        end,
        style:
          level === 1 ? 'HEADING_1'
          : level === 2 ? 'HEADING_2'
          : level === 3 ? 'HEADING_3'
          : level === 4 ? 'HEADING_4'
          : level === 5 ? 'HEADING_5'
          : 'HEADING_6',
      })
      i++
      continue
    }

    // List (bulleted or numbered, possibly task items)
    const bullet = /^(\s*)([-*+])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(line)
    const numbered = /^(\s*)\d+\.\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const ordered = !!numbered
      const listStart = cursor
      while (i < lines.length) {
        const l = lines[i]!
        const b = /^(\s*)([-*+])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(l)
        const n = /^(\s*)\d+\.\s+(.*)$/.exec(l)
        if (!b && !n) break
        if ((ordered && !n) || (!ordered && !b)) break
        const itemText = b ? b[4]! : n![2]!
        const taskBox = b?.[3]
        const taskPrefix = taskBox != null ? (taskBox.toLowerCase() === 'x' ? '☑ ' : '☐ ') : ''
        append(taskPrefix + parseInline(itemText, cursor + taskPrefix.length, textStyles) + '\n')
        i++
      }
      lists.push({ kind: 'list', start: listStart, end: cursor, ordered })
      continue
    }

    // Blank line — paragraph break
    if (line.trim() === '') {
      append('\n')
      i++
      continue
    }

    // Default — paragraph
    append(parseInline(line, cursor, textStyles) + '\n')
    i++
  }

  return {
    text: out.join(''),
    paragraphs,
    lists,
    codeblocks,
    textStyles,
  }
}

/**
 * Walk a paragraph's inline content, registering bold/italic/code/link
 * spans against the absolute cursor position. Returns the plain text
 * (with inline markers stripped) so the caller can pass it to insertText.
 */
function parseInline(s: string, baseCursor: number, styles: TextStyleSpan[]): string {
  const out: string[] = []
  let i = 0
  while (i < s.length) {
    // Bold — **text** or __text__
    const bold = /^(\*\*|__)([\s\S]+?)\1/.exec(s.slice(i))
    if (bold) {
      const start = baseCursor + out.join('').length
      out.push(bold[2]!)
      const end = baseCursor + out.join('').length
      styles.push({ kind: 'bold', start, end })
      i += bold[0].length
      continue
    }
    // Italic — *text* or _text_ (single)
    const italic = /^([*_])([^*_\s][\s\S]*?[^*_\s]|[^*_\s])\1/.exec(s.slice(i))
    if (italic) {
      const start = baseCursor + out.join('').length
      out.push(italic[2]!)
      const end = baseCursor + out.join('').length
      styles.push({ kind: 'italic', start, end })
      i += italic[0].length
      continue
    }
    // Inline code — `text`
    const code = /^`([^`\n]+)`/.exec(s.slice(i))
    if (code) {
      const start = baseCursor + out.join('').length
      out.push(code[1]!)
      const end = baseCursor + out.join('').length
      styles.push({ kind: 'code', start, end })
      i += code[0].length
      continue
    }
    // Link — [text](url)
    const link = /^\[([^\]]+)\]\(([^)]+)\)/.exec(s.slice(i))
    if (link) {
      const start = baseCursor + out.join('').length
      out.push(link[1]!)
      const end = baseCursor + out.join('').length
      styles.push({ kind: 'link', start, end, url: link[2]! })
      i += link[0].length
      continue
    }
    // Default — single character
    out.push(s[i]!)
    i++
  }
  return out.join('')
}

/**
 * Build the full Doc-API request sequence to render `markdown` into
 * an existing document, starting at `startIndex` (1 for an empty doc).
 */
export function markdownToDocsRequests(
  markdown: string,
  startIndex: number,
): MarkdownToDocsResult {
  const parsed = parseMarkdown(markdown)
  const requests: DocsRequest[] = []

  // 1. Bulk insert the flat text.
  if (parsed.text.length > 0) {
    requests.push({
      insertText: {
        location: { index: startIndex },
        text: parsed.text,
      },
    })
  }

  // 2. Apply paragraph (heading) styles. Indices are RELATIVE to the
  //    flat text — shift by startIndex.
  for (const p of parsed.paragraphs) {
    if (!p.style) continue
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: startIndex + p.start, endIndex: startIndex + p.end },
        paragraphStyle: { namedStyleType: p.style },
        fields: 'namedStyleType',
      },
    })
  }

  // 3. Bullets for lists.
  for (const l of parsed.lists) {
    requests.push({
      createParagraphBullets: {
        range: { startIndex: startIndex + l.start, endIndex: startIndex + l.end },
        bulletPreset: l.ordered ? 'NUMBERED_DECIMAL_ALPHA_ROMAN' : 'BULLET_DISC_CIRCLE_SQUARE',
      },
    })
  }

  // 4. Code-block paragraph style — monospace via Courier New.
  for (const c of parsed.codeblocks) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: startIndex + c.start, endIndex: startIndex + c.end },
        textStyle: {
          weightedFontFamily: { fontFamily: 'Courier New', weight: 400 },
          backgroundColor: { color: { rgbColor: { red: 0.96, green: 0.96, blue: 0.96 } } },
        },
        fields: 'weightedFontFamily,backgroundColor',
      },
    })
  }

  // 5. Inline text styles. Apply LAST so they layer on top of any
  //    paragraph-level monospace from code blocks.
  for (const s of parsed.textStyles) {
    if (s.kind === 'bold') {
      requests.push({
        updateTextStyle: {
          range: { startIndex: startIndex + s.start, endIndex: startIndex + s.end },
          textStyle: { bold: true },
          fields: 'bold',
        },
      })
    } else if (s.kind === 'italic') {
      requests.push({
        updateTextStyle: {
          range: { startIndex: startIndex + s.start, endIndex: startIndex + s.end },
          textStyle: { italic: true },
          fields: 'italic',
        },
      })
    } else if (s.kind === 'code') {
      requests.push({
        updateTextStyle: {
          range: { startIndex: startIndex + s.start, endIndex: startIndex + s.end },
          textStyle: {
            weightedFontFamily: { fontFamily: 'Courier New', weight: 400 },
            backgroundColor: { color: { rgbColor: { red: 0.96, green: 0.96, blue: 0.96 } } },
          },
          fields: 'weightedFontFamily,backgroundColor',
        },
      })
    } else if (s.kind === 'link' && s.url) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: startIndex + s.start, endIndex: startIndex + s.end },
          textStyle: { link: { url: s.url } },
          fields: 'link',
        },
      })
    }
  }

  return { text: parsed.text, requests }
}
