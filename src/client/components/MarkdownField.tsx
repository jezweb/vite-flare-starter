/**
 * MarkdownField — preview/edit + rich copy + export for user markdown.
 *
 * The same UI recurs anywhere the app holds user-editable markdown
 * (drafts, notes, descriptions, AI outputs): show it RENDERED by default,
 * an Edit toggle to raw, rich copy (formatted paste into Outlook / Docs),
 * and `.md` / `.txt` export. This primitive bundles all four so forks
 * stop hand-rolling it. (#82, builds on #81's rich copy.)
 *
 *   // Read-only (omit onChange) — preview + copy + export, no edit toggle:
 *   <MarkdownField value={note.body} exportName="note" />
 *
 *   // Editable — adds the Edit/Preview toggle:
 *   <MarkdownField value={draft} onChange={setDraft} exportName="draft" />
 *
 * Rich copy reads the rendered preview's innerHTML for `text/html` and the
 * raw markdown for `text/plain` — so a paste lands formatted in rich targets
 * and as clean markdown in a textarea. The preview node stays mounted (just
 * hidden) in edit mode so copy works from either view.
 */
import { useRef, useState } from 'react'
import { Pencil, Eye, Download, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CopyButton } from '@/components/ui/copy-button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MessageResponse } from '@/components/ai-elements/message'
import { cn } from '@/lib/utils'

interface MarkdownFieldProps {
  /** The markdown source. */
  value: string
  /** Provide to make the field editable (adds the Edit/Preview toggle). */
  onChange?: (next: string) => void
  /** Placeholder shown in edit mode when value is empty. */
  placeholder?: string
  /** Empty-state text shown in preview when value is blank. */
  emptyText?: string
  /** Filename base for export (no extension). Default 'document'. */
  exportName?: string
  /** Rows for the edit textarea. Default 10. */
  rows?: number
  /** Hide the toolbar entirely (preview-only render). Default false. */
  hideToolbar?: boolean
  className?: string
}

/** Trigger a client-side file download of `content`. User-initiated only. */
function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function MarkdownField({
  value,
  onChange,
  placeholder = 'Write markdown…',
  emptyText = 'Nothing here yet.',
  exportName = 'document',
  rows = 10,
  hideToolbar = false,
  className,
}: MarkdownFieldProps) {
  const editable = typeof onChange === 'function'
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const previewRef = useRef<HTMLDivElement>(null)

  const showEdit = editable && mode === 'edit'

  const richHtml = () => previewRef.current?.innerHTML ?? ''

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {!hideToolbar && (
        <div className="flex items-center justify-end gap-1">
          {editable && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMode((m) => (m === 'edit' ? 'preview' : 'edit'))}
            >
              {mode === 'edit' ? <Eye /> : <Pencil />}
              <span>{mode === 'edit' ? 'Preview' : 'Edit'}</span>
            </Button>
          )}
          {/* Rich copy: text/html from the rendered preview, text/plain = raw markdown. */}
          <CopyButton
            value={value}
            html={richHtml()}
            label="Copy"
            size="sm"
            successMessage="Copied (formatted)"
            disabled={!value}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" disabled={!value}>
                <Download />
                <span>Export</span>
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => downloadFile(`${exportName}.md`, value, 'text/markdown')}
              >
                Download .md
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => downloadFile(`${exportName}.txt`, value, 'text/plain')}
              >
                Download .txt
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {showEdit && (
        <Textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="font-mono text-xs md:text-xs"
        />
      )}

      {/* Preview stays mounted even in edit mode (hidden) so rich copy can
          always read its innerHTML. Streamdown (MessageResponse) carries its
          own styling — no `prose` wrapper, matching how chat renders it. */}
      <div ref={previewRef} className={cn('text-sm', showEdit && 'hidden')}>
        {value ? (
          <MessageResponse>{value}</MessageResponse>
        ) : (
          <p className="text-muted-foreground italic">{emptyText}</p>
        )}
      </div>
    </div>
  )
}

MarkdownField.displayName = 'MarkdownField'
