/**
 * Google Drive tool renderers — drive_search.
 */
import {
  FolderOpen,
  FolderPlus,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileCode,
  FileDown,
  Presentation,
  File as FileIcon,
  ExternalLink,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ToolRenderer } from './_shared'
import { formatToolDate, truncate } from './_shared'
import type {
  DriveSearchOutput,
  DriveGetFileOutput,
  DriveCreateFolderOutput,
} from '@/server/modules/chat/tools/google-workspace'

function iconForDriveMime(mime: string): LucideIcon {
  if (mime.includes('folder')) return FolderOpen
  if (mime.includes('spreadsheet') || mime.includes('excel')) return FileSpreadsheet
  if (mime.includes('presentation') || mime.includes('powerpoint')) return Presentation
  if (mime.startsWith('image/')) return FileImage
  if (mime.startsWith('video/')) return FileVideo
  if (mime.includes('document') || mime.includes('word') || mime === 'application/pdf') return FileText
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) return FileCode
  return FileIcon
}

function shortMimeType(mime: string): string {
  if (mime === 'application/vnd.google-apps.document') return 'Doc'
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'Sheet'
  if (mime === 'application/vnd.google-apps.presentation') return 'Slides'
  if (mime === 'application/vnd.google-apps.folder') return 'Folder'
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('image/')) return 'Image'
  if (mime.startsWith('video/')) return 'Video'
  const slash = mime.lastIndexOf('/')
  return slash >= 0 ? mime.slice(slash + 1).toUpperCase() : mime
}

export const driveGetFileRenderer: ToolRenderer = {
  match: 'drive_get_file',
  icon: FileDown,
  displayName: 'Drive — Get File',
  summary: (output) => {
    const o = output as DriveGetFileOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.notSupported) return 'not readable'
    return truncate(o.name, 40)
  },
  expanded: ({ output }) => {
    const o = output as DriveGetFileOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    const Icon = iconForDriveMime(o.mimeType)
    return (
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="font-medium">{o.name}</span>
          <span className="text-[11px] text-muted-foreground">
            · {shortMimeType(o.mimeType)}
            {o.modifiedTime && <> · {formatToolDate(o.modifiedTime)}</>}
          </span>
        </div>
        {o.notSupported ? (
          <div className="rounded-md bg-muted/50 p-3 text-muted-foreground">
            {o.notSupportedReason}
          </div>
        ) : o.content ? (
          <pre className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/90 max-h-80 overflow-y-auto">
            {o.content.length > 2000 ? o.content.slice(0, 2000) + '…' : o.content}
          </pre>
        ) : null}
        {o.url && (
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-foreground hover:underline"
          >
            Open in Drive
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    )
  },
}

export const driveCreateFolderRenderer: ToolRenderer = {
  match: 'drive_create_folder',
  icon: FolderPlus,
  displayName: 'Drive — New Folder',
  summary: (output) => {
    const o = output as DriveCreateFolderOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return truncate(o.name, 30)
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as DriveCreateFolderOutput | undefined
    const i = input as { parentId?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <FolderPlus className="size-4 text-muted-foreground" />
          <span className="font-medium">{o.name}</span>
        </div>
        {i?.parentId && (
          <div className="text-muted-foreground">
            Parent: <span className="font-mono">{i.parentId}</span>
          </div>
        )}
        {o.url && (
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-foreground hover:underline"
          >
            Open in Drive
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    )
  },
}

export const driveSearchRenderer: ToolRenderer = {
  match: 'drive_search',
  icon: FolderOpen,
  displayName: 'Drive Search',
  summary: (output) => {
    const o = output as DriveSearchOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    const n = o.count
    if (n === 0) return 'no files'
    return `${n} ${n === 1 ? 'file' : 'files'}`
  },
  expanded: ({ output, input }) => {
    const o = output as DriveSearchOutput | undefined
    const i = input as { query?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    const files = o.files ?? []
    return (
      <div className="space-y-2">
        {i?.query && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Query:</span>{' '}
            <span className="font-mono">{i.query}</span>
          </div>
        )}
        {files.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            No files matched.
          </div>
        ) : (
          <ul className="divide-y divide-border/60 -mx-2">
            {files.map((f) => {
              const Icon = iconForDriveMime(f.mimeType)
              const Row = (
                <>
                  <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted/70">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">
                      {truncate(f.name, 100)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {shortMimeType(f.mimeType)} · {formatToolDate(f.modifiedTime)}
                      {f.owner && ` · ${f.owner}`}
                    </span>
                  </div>
                  {f.url && <ExternalLink className="size-3.5 text-muted-foreground shrink-0" />}
                </>
              )
              return (
                <li key={f.id}>
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2 py-2 hover:bg-muted/30 transition-colors"
                    >
                      {Row}
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-2">{Row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  },
}
