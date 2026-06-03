/**
 * AttachedFileBlock — collapsible card replacing the raw extracted text from
 * a file attachment in a user message.
 *
 * Server preprocessor converts uploaded files to markdown and wraps them as:
 *
 *   [Attached file: invoice.pdf (42 KB)]
 *
 *   <markdown body>
 *
 * We detect that prefix here and render a compact card instead of dumping
 * the whole body into the transcript. Default collapsed — click to expand.
 * Backward-compat: older messages use `[Attached file content]:` with no
 * filename; we render those as "Attached file" with no label.
 */
import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FileImage,
  FileAudio,
  FileVideo,
  FileSpreadsheet,
  FileCode,
  File as FileIcon,
} from 'lucide-react'
import { MessageResponse } from '@/components/ai-elements/message'
import { cn } from '@/lib/utils'

// Matches both the new and old prefixes on the first line of the text part.
// New: "[Attached file: invoice.pdf (42 KB)]"
// Old: "[Attached file content]:" (no filename/size)
const NEW_PREFIX = /^\[Attached file: ([^\]]+?)\]\s*\n\n?/
const OLD_PREFIX = /^\[Attached file content\]:\s*\n\n?/

export interface ParsedAttachment {
  /** Label from the prefix — e.g. "invoice.pdf (42 KB)" */
  label?: string
  /** Filename extracted from label if present */
  filename?: string
  /** Size string extracted from label if present */
  size?: string
  /** The markdown body without the prefix */
  body: string
  /** Original raw text for fallback (copy etc) */
  raw: string
}

export function parseAttachedFile(text: string): ParsedAttachment | null {
  const m1 = text.match(NEW_PREFIX)
  if (m1) {
    const label = m1[1]!
    // Pull filename + size from "name (42 KB)" if that pattern is present.
    const parts = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
    return {
      label,
      filename: parts?.[1]?.trim() || label,
      size: parts?.[2]?.trim(),
      body: text.slice(m1[0].length),
      raw: text,
    }
  }
  const m2 = text.match(OLD_PREFIX)
  if (m2) {
    return {
      label: undefined,
      body: text.slice(m2[0].length),
      raw: text,
    }
  }
  return null
}

function iconForFilename(filename?: string) {
  if (!filename) return FileIcon
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(ext)) return FileImage
  if (['mp3', 'wav', 'webm', 'ogg', 'm4a', 'flac'].includes(ext)) return FileAudio
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return FileVideo
  if (['xls', 'xlsx', 'csv', 'tsv'].includes(ext)) return FileSpreadsheet
  if (['json', 'xml', 'yaml', 'yml', 'html', 'css', 'js', 'ts', 'tsx', 'md'].includes(ext))
    return FileCode
  return FileText
}

interface Props {
  parsed: ParsedAttachment
  className?: string
}

export function AttachedFileBlock({ parsed, className }: Props) {
  const [expanded, setExpanded] = useState(false)
  const Icon = useMemo(() => iconForFilename(parsed.filename), [parsed.filename])

  // First ~90 chars of body as preview when collapsed. If the body looks like
  // binary (lots of control chars / replacement glyphs, e.g. an old DOCX that
  // was dumped raw before the toMarkdown fix) skip the preview entirely —
  // showing gibberish is worse than nothing.
  const preview = useMemo(() => {
    const flat = parsed.body.replace(/\s+/g, ' ').trim()
    // Count control / replacement characters in the first 200 chars
    const sample = flat.slice(0, 200)
    // eslint-disable-next-line no-control-regex
    const junkyChars = (sample.match(/[\u0000-\u0008\u000b-\u001f\ufffd]/g) || []).length
    if (sample.length > 20 && junkyChars / sample.length > 0.15) return ''
    return flat.length > 90 ? flat.slice(0, 87) + '…' : flat
  }, [parsed.body])

  const headerLabel = parsed.filename || 'Attached file'

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-background/60',
        'transition-colors hover:border-border/80',
        className
      )}
    >
      {/* Header row — always visible, click to toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium truncate">{headerLabel}</span>
            {parsed.size && (
              <span className="text-[10px] text-muted-foreground shrink-0">{parsed.size}</span>
            )}
          </div>
          {!expanded && preview && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{preview}</p>
          )}
        </div>
      </button>

      {/* Expanded body — full extracted markdown */}
      {expanded && (
        <div className="border-t border-border/60 px-3 py-2 max-h-96 overflow-y-auto">
          <MessageResponse>{parsed.body}</MessageResponse>
        </div>
      )}
    </div>
  )
}
