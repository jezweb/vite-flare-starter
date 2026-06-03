/**
 * Shape renderers — generic tool-output viewers that match by output
 * shape rather than tool name.
 *
 * Why this file exists: with ~140 chat tools the long tail can't all
 * have bespoke renderers. Shape renderers detect common output shapes
 * (terminal output, image preview, markdown body, table of rows) and
 * render them nicely with zero per-tool work. ~30 of the 53
 * "default-meta only" tools light up rich UX from this single file.
 *
 * Brains-trust origin: 2026-05-07 panel (3-of-4 reviewers converged on
 * this design over per-tool bespoke renderers OR universal _ui markers).
 * See `.jez/audits/2026-05-07-tool-ui-and-connectors-brains-trust.md`.
 *
 * Order in `tool-renderers/index.ts`: AFTER all bespoke domain renderers
 * (gmail, drive, calendar, ...), BEFORE `defaultRenderers`. Bespoke wins
 * for tools with custom UX; shape renderers cover the long tail; the
 * defaults give icon+name to everything left over.
 */
import { useState } from 'react'
import { Copy, Check, Terminal, ImageIcon, FileText, Table } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ToolRenderer } from './_shared'

// ─── Output-shape detection ────────────────────────────────────────────

interface StdoutShape {
  stdout?: string
  stderr?: string
  exitCode?: number
  language?: string
  success?: boolean
}

function isStdoutShape(o: unknown): o is StdoutShape {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  // stdout/stderr both being strings is the strong signal; exitCode adds
  // confidence. Don't match on stdout alone — too easy to false-positive.
  return (
    (typeof r['stdout'] === 'string' || typeof r['stderr'] === 'string') &&
    typeof r['exitCode'] === 'number'
  )
}

interface ImageShape {
  imageUrl?: string
  dataUrl?: string
  url?: string
  width?: number
  height?: number
  format?: string
  size?: number
  contentType?: string
}

function isImageShape(o: unknown): o is ImageShape {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  const candidate =
    (typeof r['imageUrl'] === 'string' && r['imageUrl']) ||
    (typeof r['dataUrl'] === 'string' && r['dataUrl']) ||
    (typeof r['url'] === 'string' &&
      /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(r['url'] as string) &&
      r['url'])
  if (!candidate) return false
  // Hard rule: must look like an image source. data: URLs starting with
  // image/, http(s) with an image extension, or an explicit imageUrl/dataUrl.
  const s = candidate as string
  return (
    s.startsWith('data:image/') ||
    /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(s) ||
    'imageUrl' in r ||
    'dataUrl' in r
  )
}

interface MarkdownShape {
  content?: string
  body?: string
  markdown?: string
  title?: string
  frontmatter?: Record<string, unknown>
}

function isMarkdownShape(o: unknown): o is MarkdownShape {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  let text: string | null = null
  if (typeof r['content'] === 'string') text = r['content'] as string
  else if (typeof r['body'] === 'string') text = r['body'] as string
  else if (typeof r['markdown'] === 'string') text = r['markdown'] as string
  // Heuristic: must have a markdown-ish text field at least 80 chars long
  // (so we don't grab tiny status messages) AND ideally a title/frontmatter
  // signal so we don't intercept arbitrary strings.
  if (!text || text.length < 80) return false
  const hasTitle = typeof r['title'] === 'string' || typeof r['name'] === 'string'
  const hasFrontmatter = r['frontmatter'] && typeof r['frontmatter'] === 'object'
  // Look for markdown markers (#, ##, ```, etc.) so we don't intercept
  // logs / random prose. One of the three is enough.
  const looksMarkdown = /^#|\n#{1,6}\s|\n```|\n[-*+]\s|\n\d+\.\s/.test(text)
  return hasTitle || !!hasFrontmatter || looksMarkdown
}

interface TableShape {
  rows?: Array<Record<string, unknown>>
  columns?: Array<{ key?: string; name?: string; label?: string } | string>
  total?: number
  count?: number
}

function isTableShape(o: unknown): o is TableShape {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  if (!Array.isArray(r['rows'])) return false
  const rows = r['rows']
  if (rows.length === 0) return true // empty result is still a table shape
  // First row must be an object — not e.g. an array of strings.
  return typeof rows[0] === 'object' && rows[0] !== null && !Array.isArray(rows[0])
}

// ─── Stdout / terminal renderer ────────────────────────────────────────

function StdoutBlock({ output }: { output: unknown }) {
  const o = output as StdoutShape
  const stdout = (o.stdout ?? '').trim()
  const stderr = (o.stderr ?? '').trim()
  const exitCode = o.exitCode ?? 0
  const ok = exitCode === 0
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Terminal className="size-3.5" />
        <span>exit code {exitCode}</span>
        <Badge variant={ok ? 'secondary' : 'destructive'} className="text-[10px]">
          {ok ? 'success' : 'failed'}
        </Badge>
        {o.language && <span className="text-[11px]">· {o.language}</span>}
      </div>
      {stdout && <CopyableBlock label="stdout" content={stdout} variant="default" />}
      {stderr && <CopyableBlock label="stderr" content={stderr} variant="error" />}
      {!stdout && !stderr && <p className="text-xs text-muted-foreground italic">No output.</p>}
    </div>
  )
}

function CopyableBlock({
  label,
  content,
  variant = 'default',
}: {
  label: string
  content: string
  variant?: 'default' | 'error'
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-2.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[10px]"
          onClick={handleCopy}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre
        className={cn(
          'max-h-72 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[11px] leading-relaxed',
          variant === 'error' && 'bg-destructive/5 text-destructive'
        )}
      >
        {content}
      </pre>
    </div>
  )
}

// ─── Image renderer ────────────────────────────────────────────────────

function ImagePreview({ output }: { output: unknown }) {
  const o = output as ImageShape
  const src = o.dataUrl ?? o.imageUrl ?? o.url ?? null
  if (!src) return <p className="text-xs text-muted-foreground italic">No image.</p>

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-md border bg-muted/20">
        {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
        <img
          src={src}
          alt="Tool output preview"
          className="block max-h-[480px] w-full object-contain"
          loading="lazy"
        />
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {o.width && o.height && (
          <span>
            {o.width}×{o.height}px
          </span>
        )}
        {(o.format || o.contentType) && <span>· {o.format ?? o.contentType}</span>}
        {o.size && <span>· {Math.round(o.size / 1024).toLocaleString()} KB</span>}
      </div>
    </div>
  )
}

// ─── Markdown body renderer ────────────────────────────────────────────

function MarkdownBody({ output }: { output: unknown }) {
  const o = output as MarkdownShape
  const body = o.content ?? o.body ?? o.markdown ?? ''
  const title = (o as Record<string, unknown>)['title'] as string | undefined
  return (
    <div className="space-y-2">
      {title && (
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <FileText className="size-3.5 text-muted-foreground" />
          {title}
        </h4>
      )}
      {o.frontmatter && Object.keys(o.frontmatter).length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Frontmatter</summary>
          <pre className="mt-1 rounded bg-muted/30 p-2 font-mono text-[10px] leading-snug whitespace-pre-wrap break-all max-h-24 overflow-auto">
            {JSON.stringify(o.frontmatter, null, 2)}
          </pre>
        </details>
      )}
      <div className="overflow-auto rounded-md border bg-muted/10 p-3 max-h-[480px]">
        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-mono">
          {body}
        </pre>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {body.length.toLocaleString()} characters · ~{Math.ceil(body.length / 4).toLocaleString()}{' '}
        tokens
      </p>
    </div>
  )
}

// ─── Table renderer ────────────────────────────────────────────────────

function TableView({ output }: { output: unknown }) {
  const o = output as TableShape
  const rows = o.rows ?? []
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No rows returned.</p>
  }
  // Derive columns from explicit `columns` if present, else union of keys
  // from the first ~5 rows so we don't iterate the whole result for huge
  // datasets.
  const explicit = o.columns
  const columnKeys: string[] = explicit
    ? explicit.map((c) => (typeof c === 'string' ? c : (c.key ?? c.name ?? ''))).filter(Boolean)
    : Array.from(new Set(rows.slice(0, 5).flatMap((r) => Object.keys(r))))
  const columnLabels: string[] = explicit
    ? explicit.map((c, i) =>
        typeof c === 'string' ? c : (c.label ?? c.name ?? c.key ?? columnKeys[i] ?? '')
      )
    : columnKeys
  const displayedRows = rows.slice(0, 50)
  const truncated = rows.length > 50
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Table className="size-3.5" />
        <span>
          {rows.length.toLocaleString()} row{rows.length === 1 ? '' : 's'}
          {truncated && ` (showing first 50)`}
          {o.total != null && o.total !== rows.length && ` of ${o.total.toLocaleString()} total`}
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              {columnLabels.map((label, i) => (
                <th key={i} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayedRows.map((row, i) => (
              <tr key={i} className="hover:bg-muted/20">
                {columnKeys.map((key, j) => (
                  <td
                    key={j}
                    className="px-2 py-1.5 align-top max-w-[260px] truncate"
                    title={cellText(row[key])}
                  >
                    {cellText(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// ─── Renderer exports ──────────────────────────────────────────────────

export const stdoutShapeRenderer: ToolRenderer = {
  match: (_, output) => isStdoutShape(output),
  icon: Terminal,
  // Don't override displayName — let the per-tool default ("Run Python")
  // win so the pill still names the tool, not the shape.
  summary: (output) => {
    const o = output as StdoutShape
    if (o == null || typeof o !== 'object') return null
    if (o.exitCode !== 0) return `exit ${o.exitCode}`
    const stdoutLen = (o.stdout ?? '').length
    return stdoutLen > 0 ? `${stdoutLen.toLocaleString()} bytes stdout` : 'no output'
  },
  expanded: ({ output }) => <StdoutBlock output={output} />,
}

export const imageShapeRenderer: ToolRenderer = {
  match: (_, output) => isImageShape(output),
  icon: ImageIcon,
  summary: (output) => {
    const o = output as ImageShape
    if (o.width && o.height) return `${o.width}×${o.height}`
    if (o.format) return o.format
    return 'image'
  },
  expanded: ({ output }) => <ImagePreview output={output} />,
}

export const markdownShapeRenderer: ToolRenderer = {
  match: (_, output) => isMarkdownShape(output),
  icon: FileText,
  summary: (output) => {
    const o = output as MarkdownShape
    const body = o.content ?? o.body ?? o.markdown ?? ''
    const tokens = Math.ceil(body.length / 4)
    return `~${tokens.toLocaleString()} tokens`
  },
  expanded: ({ output }) => <MarkdownBody output={output} />,
}

export const tableShapeRenderer: ToolRenderer = {
  match: (_, output) => isTableShape(output),
  icon: Table,
  summary: (output) => {
    const o = output as TableShape
    const len = o.rows?.length ?? 0
    return `${len.toLocaleString()} row${len === 1 ? '' : 's'}`
  },
  expanded: ({ output }) => <TableView output={output} />,
}

export const shapeRenderers: ToolRenderer[] = [
  // Order: most-specific shapes first. Stdout has the strictest signature
  // (stdout|stderr + exitCode), images are next, then markdown (which
  // overlaps with anything text-y), then table (rows of objects).
  stdoutShapeRenderer,
  imageShapeRenderer,
  markdownShapeRenderer,
  tableShapeRenderer,
]
