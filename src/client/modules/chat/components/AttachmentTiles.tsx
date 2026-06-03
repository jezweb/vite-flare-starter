/**
 * AttachmentTiles — visible preview strip for attached files before submit.
 *
 * Reads from usePromptInputAttachments() so it drops in anywhere inside a
 * PromptInput. Each tile shows a thumbnail (image) or type-icon (pdf/docx/
 * audio/text), filename, size, and a remove X. Click opens a full preview
 * dialog so users can verify file content before sending.
 */
import { useState } from 'react'
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileAudio,
  FileVideo,
  FileCode,
  FileArchive,
  File as FileIcon,
  X,
  Eye,
} from 'lucide-react'
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type AttachmentFile = {
  id: string
  filename?: string
  mediaType?: string
  url?: string
  type: 'file'
}

function iconFor(mediaType?: string) {
  if (!mediaType) return FileIcon
  if (mediaType.startsWith('image/')) return FileImage
  if (mediaType.startsWith('audio/')) return FileAudio
  if (mediaType.startsWith('video/')) return FileVideo
  if (mediaType === 'application/pdf') return FileText
  if (mediaType.includes('spreadsheet') || mediaType.includes('excel') || mediaType === 'text/csv')
    return FileSpreadsheet
  if (mediaType.includes('wordprocessingml') || mediaType === 'application/msword') return FileText
  if (
    mediaType.startsWith('text/') ||
    mediaType === 'application/json' ||
    mediaType === 'application/xml'
  )
    return FileCode
  if (mediaType === 'application/zip' || mediaType === 'application/epub+zip') return FileArchive
  return FileIcon
}

function extensionFrom(filename?: string, mediaType?: string): string {
  if (filename) {
    const dot = filename.lastIndexOf('.')
    if (dot >= 0 && dot < filename.length - 1) return filename.slice(dot + 1).toUpperCase()
  }
  if (mediaType) {
    const slash = mediaType.indexOf('/')
    if (slash >= 0) return mediaType.slice(slash + 1).toUpperCase()
  }
  return 'FILE'
}

function truncate(name: string, max = 20) {
  if (name.length <= max) return name
  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot < max - 8) return name.slice(0, max - 1) + '…'
  const ext = name.slice(dot)
  return name.slice(0, max - ext.length - 1) + '…' + ext
}

export function AttachmentTiles() {
  const { files, remove } = usePromptInputAttachments()
  const [preview, setPreview] = useState<AttachmentFile | null>(null)

  if (files.length === 0) return null

  return (
    <>
      <div
        // self-start + w-full: override InputGroup's default items-center so the
        // tile row stays left-aligned inside the compose card.
        className="flex w-full flex-wrap gap-2 px-3 pt-3 self-start"
      >
        {files.map((f) => (
          <AttachmentTile
            key={f.id}
            file={f as AttachmentFile}
            onRemove={() => remove(f.id)}
            onPreview={() => setPreview(f as AttachmentFile)}
          />
        ))}
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.filename || 'File preview'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {preview && <AttachmentPreview file={preview} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AttachmentTile({
  file,
  onRemove,
  onPreview,
}: {
  file: AttachmentFile
  onRemove: () => void
  onPreview: () => void
}) {
  const isImage = file.mediaType?.startsWith('image/')
  const Icon = iconFor(file.mediaType)
  const ext = extensionFrom(file.filename, file.mediaType)
  const name = file.filename || `file.${ext.toLowerCase()}`

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-lg border border-border bg-muted/40 pr-1.5',
        'hover:border-primary/50 transition-colors'
      )}
      title={name}
    >
      {/* Thumbnail or icon */}
      <button
        type="button"
        onClick={onPreview}
        className={cn(
          'relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-l-lg bg-background',
          'hover:ring-1 hover:ring-primary/50 transition-all'
        )}
      >
        {isImage && file.url ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={file.url} alt={name} className="size-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center">
            <Icon className="size-4 text-muted-foreground" />
            <span className="text-[8px] font-semibold text-muted-foreground leading-none mt-0.5">
              {ext.slice(0, 4)}
            </span>
          </div>
        )}
        {/* Hover eye icon */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <Eye className="size-4 text-white" />
        </div>
      </button>

      {/* Name */}
      <span className="text-xs text-foreground max-w-[140px] truncate py-2">
        {truncate(name, 22)}
      </span>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className={cn(
          'ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
          'text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors'
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

function AttachmentPreview({ file }: { file: AttachmentFile }) {
  const mt = file.mediaType || ''

  if (mt.startsWith('image/') && file.url) {
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
    return (
      <img src={file.url} alt={file.filename || 'image'} className="max-w-full h-auto mx-auto" />
    )
  }

  if (mt.startsWith('video/') && file.url) {
    return (
      <video controls className="max-w-full h-auto mx-auto">
        <source src={file.url} type={mt} />
      </video>
    )
  }

  if (mt.startsWith('audio/') && file.url) {
    return (
      <div className="p-8 flex items-center justify-center">
        <audio controls src={file.url} className="w-full max-w-md" />
      </div>
    )
  }

  if (mt === 'application/pdf' && file.url) {
    return (
      <iframe src={file.url} title={file.filename || 'PDF'} className="w-full h-[60vh] border-0" />
    )
  }

  // Fallback for binary/unknown: show metadata
  const Icon = iconFor(mt)
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="size-16 text-muted-foreground mb-4" />
      <p className="text-sm font-medium">{file.filename || 'File'}</p>
      <p className="text-xs text-muted-foreground mt-1">{mt || 'unknown type'}</p>
      <p className="text-xs text-muted-foreground mt-4 max-w-md">
        Preview not available for this file type. It will be sent to the AI and converted to text
        for processing.
      </p>
    </div>
  )
}
