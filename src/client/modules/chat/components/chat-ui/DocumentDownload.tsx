/**
 * Document Download Card — renders when a tool generates a downloadable file.
 *
 * Detects { _document: true, format, title, filename, base64|downloadUrl }
 * and shows a styled download card with file type icon.
 */
import { FileText, FileSpreadsheet, Table2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DocumentData {
  _document: true
  format: 'docx' | 'xlsx' | 'csv'
  title: string
  filename: string
  sizeBytes: number
  downloadUrl?: string
  base64?: string
}

export function isDocument(output: unknown): output is DocumentData {
  return (
    !!output &&
    typeof output === 'object' &&
    (output as Record<string, unknown>)['_document'] === true
  )
}

const FORMAT_META: Record<
  string,
  { icon: typeof FileText; label: string; color: string; mime: string }
> = {
  docx: {
    icon: FileText,
    label: 'Word Document',
    color: 'text-blue-600 dark:text-blue-400',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xlsx: {
    icon: FileSpreadsheet,
    label: 'Excel Spreadsheet',
    color: 'text-green-600 dark:text-green-400',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  csv: {
    icon: Table2,
    label: 'CSV File',
    color: 'text-amber-600 dark:text-amber-400',
    mime: 'text/csv',
  },
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentDownload({ doc }: { doc: DocumentData }) {
  const meta = FORMAT_META[doc.format] || FORMAT_META['csv']!
  const Icon = meta.icon

  const handleDownload = () => {
    if (doc.downloadUrl) {
      // Server-side file — download via URL
      const a = document.createElement('a')
      a.href = doc.downloadUrl
      a.download = doc.filename
      a.click()
    } else if (doc.base64) {
      // Client-side download from base64
      const binary = atob(doc.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: meta.mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.filename
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="my-2 rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className={`rounded-lg bg-muted p-2.5 ${meta.color}`}>
          <Icon className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{doc.title}</div>
          <div className="text-xs text-muted-foreground">
            {meta.label} · {doc.filename} · {formatSize(doc.sizeBytes)}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={handleDownload} className="shrink-0">
          <Download className="size-3.5 mr-1.5" />
          Download
        </Button>
      </div>
    </div>
  )
}
