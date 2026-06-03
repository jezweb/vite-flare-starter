/**
 * ArtifactSidebar — claude.ai-style right-panel listing artifacts and file
 * attachments from the current conversation.
 *
 * Pure derivation over `messages` — no schema change. Scans each message's
 * tool-result parts for `_artifact: true` (via isArtifact) and each user
 * message's `file` parts for attachments. Click a card to scroll the inline
 * artifact/file into view; click the download icon to save the code as a
 * file with the right extension (.html / .svg / .mmd / original filename).
 */
import { useMemo, useCallback, useState } from 'react'
import {
  FileText,
  FileCode,
  FileImage,
  FileAudio,
  FileVideo,
  FileSpreadsheet,
  FileArchive,
  File as FileIcon,
  Download,
  X,
  Maximize2,
  FolderPlus,
  Check,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ArtifactViewer, isArtifact } from './chat-ui/ArtifactViewer'
import type { Message as UIMessageType } from '../hooks/useChat'

interface CollectedArtifact {
  id: string
  title: string
  type: 'html' | 'svg' | 'mermaid'
  code: string
}

interface CollectedFile {
  id: string
  name: string
  mediaType?: string
  url?: string
}

const ARTIFACT_EXT: Record<CollectedArtifact['type'], string> = {
  html: 'html',
  svg: 'svg',
  mermaid: 'mmd',
}

const ARTIFACT_MIME: Record<CollectedArtifact['type'], string> = {
  html: 'text/html',
  svg: 'image/svg+xml',
  mermaid: 'text/plain',
}

/**
 * Walk the message tree and return every artifact + file part we can surface.
 * Keep the identity stable across re-renders so React keys don't thrash.
 */
function collect(messages: UIMessageType[]): {
  artifacts: CollectedArtifact[]
  files: CollectedFile[]
} {
  const artifacts: CollectedArtifact[] = []
  const files: CollectedFile[] = []
  for (const message of messages) {
    const parts = Array.isArray(message.parts) ? message.parts : []
    parts.forEach((part, idx) => {
      if (part.type === 'file' && message.role === 'user') {
        const p = part as { url?: string; mediaType?: string; filename?: string }
        files.push({
          id: `${message.id}-${idx}`,
          name: p.filename || `file-${idx}`,
          mediaType: p.mediaType,
          url: p.url,
        })
        return
      }
      if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
        const p = part as Record<string, unknown>
        const output = p['output']
        if (isArtifact(output)) {
          artifacts.push({
            id: `${message.id}-${idx}`,
            title: output.title,
            type: output.type,
            code: output.code,
          })
        }
      }
    })
  }
  return { artifacts, files }
}

function iconForMime(mediaType?: string) {
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

function iconForArtifact(type: CollectedArtifact['type']) {
  if (type === 'svg') return FileImage
  if (type === 'mermaid') return FileCode
  return FileText
}

function safeFilename(title: string, ext: string): string {
  const slug =
    title
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'artifact'
  return `${slug}.${ext}`
}

/**
 * Trigger a download of a text/blob by creating a transient <a href="blob:"> and
 * clicking it. We revoke the object URL on the next tick so the download starts
 * before the blob is GC'd.
 */
function downloadBlob(filename: string, content: string | Blob, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface Props {
  messages: UIMessageType[]
  onClose?: () => void
  /** Scroll target parent — defaults to the document if omitted. */
  scrollRoot?: HTMLElement | null
}

export function ArtifactSidebar({ messages, onClose, scrollRoot: _scrollRoot }: Props) {
  const { artifacts, files } = useMemo(() => collect(messages), [messages])
  const hasAny = artifacts.length > 0 || files.length > 0
  /** Artifact currently open in the full-screen lightbox, if any. */
  const [lightbox, setLightbox] = useState<CollectedArtifact | null>(null)
  /** Per-file save state: idle | saving | saved. Keyed by file id. */
  const [saveState, setSaveState] = useState<Record<string, 'saving' | 'saved'>>({})

  const saveToFiles = useCallback(
    async (file: CollectedFile) => {
      if (!file.url || saveState[file.id]) return
      setSaveState((s) => ({ ...s, [file.id]: 'saving' }))
      try {
        const resp = await fetch(file.url)
        const blob = await resp.blob()
        const fallbackExt = (file.mediaType?.split('/')[1] || 'bin').split('+')[0]
        const filename = file.name || `attachment-${Date.now()}.${fallbackExt}`
        const form = new FormData()
        form.append(
          'file',
          new File([blob], filename, {
            type: file.mediaType || blob.type || 'application/octet-stream',
          })
        )
        form.append('folder', '/chat-attachments')
        const upload = await fetch('/api/files', { method: 'POST', body: form })
        if (!upload.ok) {
          const err = (await upload.json().catch(() => ({ error: upload.statusText }))) as {
            error?: string
          }
          throw new Error(err.error || `Upload failed (${upload.status})`)
        }
        setSaveState((s) => ({ ...s, [file.id]: 'saved' }))
        toast.success('Saved to Files', { description: filename })
      } catch (err) {
        setSaveState((s) => {
          const next = { ...s }
          delete next[file.id]
          return next
        })
        toast.error('Could not save to Files', {
          description: err instanceof Error ? err.message : String(err),
        })
      }
    },
    [saveState]
  )

  const scrollTo = useCallback((id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-artifact-id="${CSS.escape(id)}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Brief highlight flash so users can see which one they clicked.
    el.classList.add('ring-2', 'ring-primary/50', 'ring-offset-2', 'ring-offset-background')
    setTimeout(
      () =>
        el.classList.remove('ring-2', 'ring-primary/50', 'ring-offset-2', 'ring-offset-background'),
      1200
    )
  }, [])

  /**
   * Artifact cards support two click modes:
   * - plain click → scroll the inline ArtifactViewer into view
   * - cmd/ctrl/shift click or middle click → open full-screen lightbox
   * This matches claude.ai's "open in panel" gesture while keeping the
   * default click light-weight.
   */
  const handleArtifactCardClick = useCallback(
    (artifact: CollectedArtifact, e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        e.preventDefault()
        setLightbox(artifact)
        return
      }
      scrollTo(artifact.id)
    },
    [scrollTo]
  )

  const downloadAll = useCallback(() => {
    for (const a of artifacts) {
      downloadBlob(safeFilename(a.title, ARTIFACT_EXT[a.type]), a.code, ARTIFACT_MIME[a.type])
    }
  }, [artifacts])

  return (
    <aside
      aria-label="Artifacts and attachments"
      className="w-72 shrink-0 border-l bg-muted/30 flex flex-col h-full overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h2 className="text-sm font-medium">Artifacts</h2>
        <div className="flex items-center gap-0.5">
          {artifacts.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={downloadAll}
              title="Download all artifacts"
            >
              <Download className="size-3" />
              Download all
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="Close artifact panel"
              title="Close"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-4">
        {!hasAny && (
          <div className="px-2 py-8 text-xs text-muted-foreground text-center space-y-2">
            <p className="font-medium text-foreground/80">Nothing here yet</p>
            <p>
              Ask the AI for a chart, dashboard, or diagram — or drop a file into the chat. Both
              show up in this panel.
            </p>
          </div>
        )}

        {artifacts.length > 0 && (
          <section className="space-y-1.5">
            {artifacts.map((a) => {
              const Icon = iconForArtifact(a.type)
              return (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleArtifactCardClick(a, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (e.metaKey || e.ctrlKey) setLightbox(a)
                      else scrollTo(a.id)
                    }
                  }}
                  className={cn(
                    'w-full group flex items-center gap-2 rounded-lg border border-border bg-background cursor-pointer',
                    'px-2 py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none',
                    'focus-visible:ring-2 focus-visible:ring-primary/40'
                  )}
                  title="Click to scroll to · cmd/ctrl-click or use the expand icon to open in a lightbox"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded bg-muted/70">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{a.title}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {a.type === 'mermaid' ? 'Diagram' : a.type.toUpperCase()}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setLightbox(a)
                      }}
                      className={cn(
                        'rounded p-1 text-muted-foreground opacity-0 transition-opacity',
                        'group-hover:opacity-100 hover:bg-muted hover:text-foreground'
                      )}
                      title="Open in lightbox"
                      aria-label={`Open ${a.title} in lightbox`}
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        downloadBlob(
                          safeFilename(a.title, ARTIFACT_EXT[a.type]),
                          a.code,
                          ARTIFACT_MIME[a.type]
                        )
                      }}
                      className={cn(
                        'rounded p-1 text-muted-foreground opacity-0 transition-opacity',
                        'group-hover:opacity-100 hover:bg-muted hover:text-foreground'
                      )}
                      title={`Download .${ARTIFACT_EXT[a.type]}`}
                      aria-label={`Download ${a.title}`}
                    >
                      <Download className="size-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {files.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Content
            </h3>
            {files.map((f) => {
              const Icon = iconForMime(f.mediaType)
              const isImage = f.mediaType?.startsWith('image/')
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => scrollTo(f.id)}
                  className={cn(
                    'w-full group flex items-center gap-2 rounded-lg border border-border bg-background',
                    'px-2 py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none',
                    'focus-visible:ring-2 focus-visible:ring-primary/40'
                  )}
                  title={f.name}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/70">
                    {isImage && f.url ? (
                      // eslint-disable-next-line jsx-a11y/alt-text
                      <img src={f.url} alt="" className="size-full object-cover" />
                    ) : (
                      <Icon className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{f.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {f.mediaType?.split('/')[1]?.slice(0, 20) || 'FILE'}
                    </div>
                  </div>
                  {f.url && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        disabled={!!saveState[f.id]}
                        onClick={(e) => {
                          e.stopPropagation()
                          saveToFiles(f)
                        }}
                        className={cn(
                          'rounded p-1 text-muted-foreground transition-opacity',
                          saveState[f.id] === 'saved'
                            ? 'text-primary opacity-100'
                            : 'opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground',
                          saveState[f.id] === 'saving' && 'opacity-100'
                        )}
                        title={
                          saveState[f.id] === 'saved'
                            ? 'Saved to Files'
                            : saveState[f.id] === 'saving'
                              ? 'Saving…'
                              : 'Save to Files'
                        }
                        aria-label={`Save ${f.name} to Files`}
                      >
                        {saveState[f.id] === 'saved' ? (
                          <Check className="size-3.5" />
                        ) : saveState[f.id] === 'saving' ? (
                          <Spinner size="sm" />
                        ) : (
                          <FolderPlus className="size-3.5" />
                        )}
                      </button>
                      <a
                        href={f.url}
                        download={f.name}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'rounded p-1 text-muted-foreground opacity-0 transition-opacity',
                          'group-hover:opacity-100 hover:bg-muted hover:text-foreground'
                        )}
                        title={`Download ${f.name}`}
                        aria-label={`Download ${f.name}`}
                      >
                        <Download className="size-3.5" />
                      </a>
                    </div>
                  )}
                </button>
              )
            })}
          </section>
        )}
      </div>

      {/* Full-screen lightbox — opened via cmd+click on a card or the expand
          icon. Reuses ArtifactViewer so behaviour stays identical (code toggle,
          copy, open in new tab for HTML). Wide viewport (80vw) with a generous
          height so dashboards/mermaids have room to breathe. */}
      <Dialog
        open={!!lightbox}
        onOpenChange={(open) => {
          if (!open) setLightbox(null)
        }}
      >
        <DialogContent
          // sm: prefix is REQUIRED to override shadcn Dialog's default
          // `sm:max-w-lg`. See rules/css-patterns.md — breakpoint overrides
          // need same breakpoint specificity or the default wins.
          className="w-[95vw] sm:w-[80vw] sm:max-w-[min(80vw,1200px)] h-[85vh] p-0 gap-0 overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">
            {lightbox ? `Artifact: ${lightbox.title}` : 'Artifact'}
          </DialogTitle>
          {lightbox && (
            <div className="h-full flex flex-col overflow-auto p-3">
              {/*
               * ArtifactViewer caps its own iframe at 800px via the auto-resize
               * handler. For the lightbox we pass `height` = 70vh so the initial
               * paint uses the big space; the ResizeObserver inside the iframe
               * will still clamp to its content height if that's smaller.
               */}
              <ArtifactViewer
                artifact={{
                  ...lightbox,
                  _artifact: true,
                  height: Math.floor(window.innerHeight * 0.7),
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  )
}

/** Expose the collector so the chat page can decide whether to show the toggle. */
export function countArtifactsAndFiles(messages: UIMessageType[]): {
  artifactCount: number
  fileCount: number
} {
  const { artifacts, files } = collect(messages)
  return { artifactCount: artifacts.length, fileCount: files.length }
}
