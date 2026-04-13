/**
 * Document Generation Tools — DOCX + CSV
 *
 * Generates downloadable documents entirely in JavaScript on Workers.
 * No Python, no containers.
 *
 * - docx: Word documents via the 'docx' package (pure JS)
 * - csv: native string generation
 *
 * For XLSX: use the run_python tool with openpyxl in Cloudflare Sandbox,
 * or generate CSV (which Excel opens natively).
 */
import { tool } from 'ai'
import { z } from 'zod'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType,
} from 'docx'

interface DocContext {
  bucket?: R2Bucket
  userId: string
}

function generateFilename(title: string, ext: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').slice(0, 50)
  return `${slug}-${Date.now()}.${ext}`
}

async function storeAndReturn(
  ctx: DocContext,
  buffer: ArrayBuffer | Uint8Array,
  filename: string,
  mimeType: string
): Promise<{ filename: string; sizeBytes: number; downloadUrl?: string; base64?: string }> {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer

  if (ctx.bucket) {
    const key = `users/${ctx.userId}/documents/${filename}`
    await ctx.bucket.put(key, bytes, { httpMetadata: { contentType: mimeType } })
    return { filename, sizeBytes: bytes.length, downloadUrl: `/api/files/${encodeURIComponent(key)}` }
  }

  // No R2 — return base64 for client-side download
  const base64 = btoa(String.fromCharCode(...bytes))
  return { filename, sizeBytes: bytes.length, base64 }
}

export function buildDocumentTools(ctx: DocContext) {
  return {
    generate_docx: tool({
      description: `Generate a Word document (.docx) from structured content. Returns a download link/button. Use for reports, proposals, letters, or any formatted document.

Content is an array of blocks:
- heading: { type: "heading", text: "Title", level: 1-4 }
- paragraph: { type: "paragraph", text: "Content", bold?: true, italic?: true }
- bullet_list: { type: "bullet_list", items: ["Item 1", "Item 2"] }
- table: { type: "table", headers: ["Col A", "Col B"], rows: [["val", "val"]] }`,
      inputSchema: z.object({
        title: z.string().describe('Document title (also used as filename)'),
        content: z.array(z.object({
          type: z.enum(['heading', 'paragraph', 'bullet_list', 'table']),
          text: z.string().optional(),
          level: z.number().optional(),
          bold: z.boolean().optional(),
          italic: z.boolean().optional(),
          items: z.array(z.string()).optional(),
          headers: z.array(z.string()).optional(),
          rows: z.array(z.array(z.string())).optional(),
        })).describe('Array of content blocks'),
      }),
      execute: async ({ title, content }) => {
        try {
          const children: (Paragraph | Table)[] = []

          for (const block of content) {
            switch (block.type) {
              case 'heading':
                children.push(new Paragraph({
                  children: [new TextRun({ text: block.text || '', bold: true })],
                  heading: block.level === 1 ? HeadingLevel.HEADING_1
                    : block.level === 2 ? HeadingLevel.HEADING_2
                    : block.level === 3 ? HeadingLevel.HEADING_3
                    : HeadingLevel.HEADING_4,
                }))
                break
              case 'paragraph':
                children.push(new Paragraph({
                  children: [new TextRun({ text: block.text || '', bold: block.bold, italics: block.italic })],
                }))
                break
              case 'bullet_list':
                for (const item of block.items || []) {
                  children.push(new Paragraph({ children: [new TextRun(item)], bullet: { level: 0 } }))
                }
                break
              case 'table':
                if (block.headers && block.rows) {
                  const headerRow = new TableRow({
                    children: block.headers.map((h) => new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                      width: { size: Math.floor(100 / block.headers!.length), type: WidthType.PERCENTAGE },
                    })),
                  })
                  const dataRows = block.rows.map((row) => new TableRow({
                    children: row.map((cell) => new TableCell({ children: [new Paragraph(cell)] })),
                  }))
                  children.push(new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } }))
                }
                break
            }
          }

          const doc = new Document({ sections: [{ children }] })
          const buffer = await Packer.toBuffer(doc)
          const filename = generateFilename(title, 'docx')
          const result = await storeAndReturn(ctx, buffer, filename,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
          return { _document: true, format: 'docx', title, ...result }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    generate_csv: tool({
      description: 'Generate a CSV file from tabular data. Returns a download link. Universal format — opens in Excel, Google Sheets, Numbers, and any data tool.',
      inputSchema: z.object({
        title: z.string().describe('File title (used as filename)'),
        headers: z.array(z.string()).describe('Column headers'),
        rows: z.array(z.array(z.union([z.string(), z.number()]))).describe('Data rows'),
      }),
      execute: async ({ title, headers, rows }) => {
        try {
          const escapeCell = (val: string | number) => {
            const str = String(val)
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"` : str
          }
          const lines = [
            headers.map(escapeCell).join(','),
            ...rows.map((row) => row.map(escapeCell).join(',')),
          ]
          const csv = lines.join('\n')
          const bytes = new TextEncoder().encode(csv)
          const filename = generateFilename(title, 'csv')
          const result = await storeAndReturn(ctx, bytes, filename, 'text/csv')
          return { _document: true, format: 'csv', title, rowCount: rows.length, ...result }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
