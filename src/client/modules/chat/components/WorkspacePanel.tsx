/**
 * WorkspacePanel — the chat page's right-hand workspace (#40 "workspace
 * pane"). Evolution of the old ArtifactSidebar list into the pattern
 * claude.ai / Canvas / Kimi converge on: conversation on the left, a
 * summonable workspace on the right that is the PRIMARY surface for
 * what the agent produces.
 *
 * Three tabs, all derived live from `messages` (no fetch, updates as
 * the stream arrives):
 *   Artifacts — created/edited artifacts grouped into VERSION CHAINS by
 *     artifactId. Click one → in-panel viewer (panel widens), with a
 *     v1…vN stepper, download, publish (share token → public link),
 *     and a full-screen lightbox.
 *   Files — user attachments; save-to-Files or download.
 *   Activity — chronological tool-call feed (name + status), the
 *     "watch the agent work" view for long transcripts.
 *
 * Persistence note: the artifacts themselves are indexed server-side by
 * the create/edit tools (server/modules/artifacts) — this panel stays a
 * pure derivation so it can never drift from the transcript.
 */
import { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import {
  FileText,
  FileCode,
  FileImage,
  FileAudio,
  FileVideo,
  FileXls,
  FileArchive,
  File as FileIcon,
  Download,
  X,
  ArrowsOutSimple,
  ArrowLeft,
  FolderPlus,
  Check,
  CaretLeft,
  CaretRight,
  CircleNotch,
  WarningCircle,
  Wrench,
  Globe as GlobeIcon,
  ArrowSquareOut,
} from '@phosphor-icons/react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ShareButton } from '@/client/components/ShareButton'
import { ArtifactViewer, isArtifact } from './chat-ui/ArtifactViewer'
import type { Message as UIMessageType } from '../hooks/useChat'

// ─── Derivation ───────────────────────────────────────────────────

type ArtifactKind = 'html' | 'svg' | 'mermaid' | 'markdown'

interface CollectedVersion {
  /** part-level id — also the data-artifact-id scroll anchor */
  partId: string
  title: string
  type: ArtifactKind
  code: string
  /** server-assigned version number when persisted */
  version?: number
}

interface ArtifactGroup {
  /** persistent artifactId when available, else the part id */
  groupId: string
  /** true when backed by a server row (publishable) */
  persisted: boolean
  versions: CollectedVersion[]
}

interface CollectedFile {
  id: string
  name: string
  mediaType?: string
  url?: string
}

/** A live site preview served from the conversation sandbox (site_serve). */
interface SiteItem {
  id: string
  url: string
  port: number
  command: string
  /** false once a later site_stop for the same port appears */
  active: boolean
}

function isSite(output: unknown): output is { url: string; port: number; command?: string } {
  return (
    !!output &&
    typeof output === 'object' &&
    (output as Record<string, unknown>)['_site'] === true &&
    typeof (output as Record<string, unknown>)['url'] === 'string'
  )
}

interface ActivityItem {
  id: string
  name: string
  state: string
}

const ARTIFACT_EXT: Record<ArtifactKind, string> = {
  html: 'html',
  svg: 'svg',
  mermaid: 'mmd',
  markdown: 'md',
}

const ARTIFACT_MIME: Record<ArtifactKind, string> = {
  html: 'text/html',
  svg: 'image/svg+xml',
  mermaid: 'text/plain',
  markdown: 'text/markdown',
}

const TYPE_LABEL: Record<ArtifactKind, string> = {
  html: 'HTML',
  svg: 'SVG',
  mermaid: 'Diagram',
  markdown: 'Document',
}

function collect(messages: UIMessageType[]): {
  groups: ArtifactGroup[]
  files: CollectedFile[]
  activity: ActivityItem[]
  sites: SiteItem[]
} {
  const groupMap = new Map<string, ArtifactGroup>()
  const files: CollectedFile[] = []
  const activity: ActivityItem[] = []
  // Keyed by port: a later site_serve upserts (URL can change per revive),
  // a later site_stop marks inactive. Message order = chronology.
  const siteMap = new Map<number, SiteItem>()

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
        const name =
          part.type === 'dynamic-tool'
            ? String(p['toolName'] ?? 'tool')
            : part.type.slice('tool-'.length)
        activity.push({
          id: `${message.id}-${idx}`,
          name,
          state: String(p['state'] ?? 'done'),
        })
        const output = p['output']
        if (isSite(output)) {
          const o = output as { url: string; port: number; command?: string }
          siteMap.set(o.port, {
            id: `${message.id}-${idx}`,
            url: o.url,
            port: o.port,
            command: o.command ?? '',
            active: true,
          })
          return
        }
        if (name === 'site_stop') {
          const o = output as { stopped?: boolean; port?: number } | undefined
          if (o?.stopped && typeof o.port === 'number') {
            const site = siteMap.get(o.port)
            if (site) site.active = false
          }
          return
        }
        if (isArtifact(output)) {
          const partId = `${message.id}-${idx}`
          const persistedId =
            typeof output.artifactId === 'string' && output.artifactId ? output.artifactId : null
          const groupId = persistedId ?? partId
          const version: CollectedVersion = {
            partId,
            title: output.title,
            type: output.type,
            code: output.code,
            ...(typeof output.version === 'number' ? { version: output.version } : {}),
          }
          const existing = groupMap.get(groupId)
          if (existing) existing.versions.push(version)
          else groupMap.set(groupId, { groupId, persisted: !!persistedId, versions: [version] })
        }
      }
    })
  }
  return { groups: [...groupMap.values()], files, activity, sites: [...siteMap.values()] }
}

// ─── Small helpers (shared with the old sidebar behaviour) ────────

function iconForMime(mediaType?: string) {
  if (!mediaType) return FileIcon
  if (mediaType.startsWith('image/')) return FileImage
  if (mediaType.startsWith('audio/')) return FileAudio
  if (mediaType.startsWith('video/')) return FileVideo
  if (mediaType === 'application/pdf') return FileText
  if (mediaType.includes('spreadsheet') || mediaType.includes('excel') || mediaType === 'text/csv')
    return FileXls
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

function iconForArtifact(type: ArtifactKind) {
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

// ─── Panel ────────────────────────────────────────────────────────

type Tab = 'artifacts' | 'sites' | 'files' | 'activity'

interface Props {
  messages: UIMessageType[]
  onClose?: () => void
}

export function WorkspacePanel({ messages, onClose }: Props) {
  const { groups, files, activity, sites } = useMemo(() => collect(messages), [messages])
  const [tab, setTab] = useState<Tab>('artifacts')
  /** Selected artifact group + which version is shown (index into versions). */
  const [selected, setSelected] = useState<{ groupId: string; versionIndex: number } | null>(null)
  /** Site whose live preview is open in the wide viewer (by port). */
  const [openSitePort, setOpenSitePort] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<CollectedVersion | null>(null)
  const [saveState, setSaveState] = useState<Record<string, 'saving' | 'saved'>>({})

  // Land in viewer mode: on mount with artifacts present (the panel is
  // usually summoned BY an artifact), and again whenever a new artifact
  // version arrives while open. Back button returns to the list.
  const versionCount = groups.reduce((n, g) => n + g.versions.length, 0)
  const prevCount = useRef<number | null>(null)
  useEffect(() => {
    const isMount = prevCount.current === null
    if ((isMount || versionCount > (prevCount.current ?? 0)) && groups.length > 0) {
      const last = groups[groups.length - 1]!
      setTab('artifacts')
      setSelected({ groupId: last.groupId, versionIndex: last.versions.length - 1 })
    }
    prevCount.current = versionCount
  }, [versionCount, groups])

  // Same behaviour for sites: when a serve lands (new port or revived
  // URL), jump to its live preview. On mount, artifacts win the landing
  // view when both exist (the effect above); a panel opened BY a site
  // (no artifacts) lands on the site.
  const siteKey = sites.map((s) => `${s.port}:${s.url}:${s.active}`).join('|')
  const prevSiteKey = useRef<string | null>(null)
  useEffect(() => {
    const isMount = prevSiteKey.current === null
    const changed = siteKey !== prevSiteKey.current
    if ((isMount && groups.length === 0) || (!isMount && changed)) {
      const newest = [...sites].reverse().find((s) => s.active)
      if (newest) {
        setTab('sites')
        setSelected(null)
        setOpenSitePort(newest.port)
      }
    }
    prevSiteKey.current = siteKey
  }, [siteKey, sites, groups.length])

  const selectedGroup = selected ? groups.find((g) => g.groupId === selected.groupId) : null
  const selectedVersion =
    selectedGroup && selected
      ? (selectedGroup.versions[
          Math.min(selected.versionIndex, selectedGroup.versions.length - 1)
        ] ?? null)
      : null

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

  const viewerOpen = tab === 'artifacts' && !!selectedVersion
  const openSite = tab === 'sites' ? (sites.find((s) => s.port === openSitePort) ?? null) : null

  return (
    <aside
      aria-label="Workspace"
      className={cn(
        'shrink-0 border-l bg-muted/30 flex flex-col h-full overflow-hidden transition-[width] duration-200',
        viewerOpen || openSite ? 'w-[min(44rem,50vw)]' : 'w-72'
      )}
    >
      {openSite ? (
        <div className="flex items-center gap-1 border-b px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpenSitePort(null)}
            aria-label="Back to sites list"
          >
            <CaretLeft className="size-3.5" />
          </Button>
          <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {new URL(openSite.url).hostname}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open site in new tab"
            onClick={() => window.open(openSite.url, '_blank', 'noopener')}
          >
            <ArrowSquareOut className="size-3.5" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="Close workspace panel"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      ) : viewerOpen && selectedGroup && selectedVersion ? (
        <ArtifactViewerHeader
          group={selectedGroup}
          version={selectedVersion}
          versionIndex={Math.min(selected!.versionIndex, selectedGroup.versions.length - 1)}
          onBack={() => setSelected(null)}
          onStep={(nextIndex) =>
            setSelected({ groupId: selectedGroup.groupId, versionIndex: nextIndex })
          }
          onLightbox={() => setLightbox(selectedVersion)}
          onClose={onClose}
        />
      ) : (
        <div className="flex items-center justify-between border-b px-2 py-1.5">
          <div role="tablist" aria-label="Workspace sections" className="flex items-center gap-0.5">
            {(
              [
                ['artifacts', `Artifacts${groups.length ? ` ${groups.length}` : ''}`],
                ...(sites.length
                  ? ([['sites', `Sites ${sites.filter((s) => s.active).length || sites.length}`]] as [
                      Tab,
                      string,
                    ][])
                  : []),
                ['files', `Files${files.length ? ` ${files.length}` : ''}`],
                ['activity', 'Activity'],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  tab === key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="Close workspace panel"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {openSite ? (
          <div className="h-full flex flex-col">
            <iframe
              key={openSite.url}
              src={openSite.url}
              title={`Site preview — ${openSite.url}`}
              className="w-full flex-1 min-h-0 border-0 bg-white"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            />
            <p className="border-t px-3 py-1.5 text-[10px] text-muted-foreground truncate">
              Live from the conversation sandbox — temporary URL, sleeps after ~10 min idle.
            </p>
          </div>
        ) : viewerOpen && selectedVersion ? (
          <div className="p-2">
            <ArtifactViewer
              artifact={{
                ...selectedVersion,
                _artifact: true,
                height: Math.max(420, Math.floor(window.innerHeight * 0.55)),
              }}
            />
          </div>
        ) : tab === 'artifacts' ? (
          <ArtifactList
            groups={groups}
            onOpen={(groupId, versionIndex) => setSelected({ groupId, versionIndex })}
          />
        ) : tab === 'sites' ? (
          <SiteList sites={sites} onOpen={(port) => setOpenSitePort(port)} />
        ) : tab === 'files' ? (
          <FileList files={files} saveState={saveState} onSave={saveToFiles} />
        ) : (
          <ActivityList items={activity} />
        )}
      </div>

      <Dialog
        open={!!lightbox}
        onOpenChange={(open) => {
          if (!open) setLightbox(null)
        }}
      >
        <DialogContent
          className="w-[95vw] sm:w-[80vw] sm:max-w-[min(80vw,1200px)] h-[85vh] p-0 gap-0 overflow-hidden"
          initialFocus={false}
        >
          <DialogTitle className="sr-only">
            {lightbox ? `Artifact: ${lightbox.title}` : 'Artifact'}
          </DialogTitle>
          {lightbox && (
            <div className="h-full flex flex-col overflow-auto p-3">
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

// ─── Viewer header (back · title · version stepper · actions) ─────

function ArtifactViewerHeader({
  group,
  version,
  versionIndex,
  onBack,
  onStep,
  onLightbox,
  onClose,
}: {
  group: ArtifactGroup
  version: CollectedVersion
  versionIndex: number
  onBack: () => void
  onStep: (index: number) => void
  onLightbox: () => void
  onClose?: (() => void) | undefined
}) {
  const total = group.versions.length
  return (
    <div className="flex items-center gap-1 border-b px-2 py-1.5">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onBack}
        aria-label="Back to artifact list"
        className="text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{version.title}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {TYPE_LABEL[version.type]}
        </div>
      </div>
      {total > 1 && (
        <div className="flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={versionIndex === 0}
            onClick={() => onStep(versionIndex - 1)}
            aria-label="Previous version"
          >
            <CaretLeft className="size-3" />
          </Button>
          v{version.version ?? versionIndex + 1}/{group.versions[total - 1]?.version ?? total}
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={versionIndex === total - 1}
            onClick={() => onStep(versionIndex + 1)}
            aria-label="Next version"
          >
            <CaretRight className="size-3" />
          </Button>
        </div>
      )}
      {group.persisted && <ShareButton entityType="artifact" entityId={group.groupId} size="sm" variant="ghost" />}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() =>
          downloadBlob(
            safeFilename(version.title, ARTIFACT_EXT[version.type]),
            version.code,
            ARTIFACT_MIME[version.type]
          )
        }
        aria-label="Download artifact"
        className="text-muted-foreground hover:text-foreground"
      >
        <Download className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onLightbox}
        aria-label="Open full screen"
        className="text-muted-foreground hover:text-foreground"
      >
        <ArrowsOutSimple className="size-3.5" />
      </Button>
      {onClose && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close workspace panel"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

// ─── Tab bodies ───────────────────────────────────────────────────

function ArtifactList({
  groups,
  onOpen,
}: {
  groups: ArtifactGroup[]
  onOpen: (groupId: string, versionIndex: number) => void
}) {
  if (groups.length === 0) {
    return (
      <EmptyHint
        title="No artifacts yet"
        body="Ask the AI for a report, chart, dashboard, or diagram — it opens here, with versions as you iterate."
      />
    )
  }
  return (
    <div className="space-y-1.5 px-2 py-2">
      {groups.map((group) => {
        const latest = group.versions[group.versions.length - 1]!
        const Icon = iconForArtifact(latest.type)
        return (
          <button
            key={group.groupId}
            type="button"
            onClick={() => onOpen(group.groupId, group.versions.length - 1)}
            className={cn(
              'w-full group flex items-center gap-2 rounded-lg border border-border bg-background',
              'px-2 py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-primary/40'
            )}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded bg-muted/70">
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{latest.title}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {TYPE_LABEL[latest.type]}
                {group.versions.length > 1 && ` · ${group.versions.length} versions`}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function FileList({
  files,
  saveState,
  onSave,
}: {
  files: CollectedFile[]
  saveState: Record<string, 'saving' | 'saved'>
  onSave: (file: CollectedFile) => void
}) {
  if (files.length === 0) {
    return (
      <EmptyHint title="No files yet" body="Drop a file into the chat and it shows up here." />
    )
  }
  return (
    <div className="space-y-1.5 px-2 py-2">
      {files.map((f) => {
        const Icon = iconForMime(f.mediaType)
        const isImage = f.mediaType?.startsWith('image/')
        return (
          <div
            key={f.id}
            className={cn(
              'w-full group flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-2'
            )}
            title={f.name}
          >
            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/70">
              {isImage && f.url ? (
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
                  onClick={() => onSave(f)}
                  className={cn(
                    'rounded p-1 text-muted-foreground transition-opacity',
                    saveState[f.id] === 'saved'
                      ? 'text-primary opacity-100'
                      : 'opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground',
                    saveState[f.id] === 'saving' && 'opacity-100'
                  )}
                  title={saveState[f.id] === 'saved' ? 'Saved to Files' : 'Save to Files'}
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
          </div>
        )
      })}
    </div>
  )
}

function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyHint
        title="No activity yet"
        body="Every tool the agent runs in this conversation is listed here as it happens."
      />
    )
  }
  return (
    <ol className="px-2 py-2">
      {items.map((item) => {
        const running = item.state === 'input-streaming' || item.state === 'input-available'
        const failed = item.state === 'output-error'
        return (
          <li key={item.id} className="flex items-center gap-2 py-1 text-xs">
            {failed ? (
              <WarningCircle className="size-3.5 shrink-0 text-destructive" />
            ) : running ? (
              <CircleNotch className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate font-mono">{item.name}</span>
            <span
              className={cn(
                'shrink-0 text-[10px] uppercase tracking-wider',
                failed ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {failed ? 'error' : running ? 'running' : 'done'}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function SiteList({ sites, onOpen }: { sites: SiteItem[]; onOpen: (port: number) => void }) {
  if (sites.length === 0) {
    return (
      <EmptyHint
        title="No sites yet"
        body="Ask the AI to build and serve a site — multi-file projects run in the sandbox with a live preview URL."
      />
    )
  }
  return (
    <ul className="p-2 space-y-1">
      {sites.map((site) => (
        <li key={site.port}>
          <button
            onClick={() => site.active && onOpen(site.port)}
            disabled={!site.active}
            className={cn(
              'w-full rounded-md border bg-background px-2.5 py-2 text-left transition-colors',
              site.active ? 'hover:bg-accent' : 'opacity-60'
            )}
          >
            <span className="flex items-center gap-2">
              <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {new URL(site.url).hostname}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {site.active ? `port ${site.port}` : `port ${site.port} — stopped`}
                </span>
              </span>
              {site.active && (
                <ArrowSquareOut
                  className="size-3.5 shrink-0 text-muted-foreground"
                  role="presentation"
                  onClick={(e) => {
                    e.stopPropagation()
                    window.open(site.url, '_blank', 'noopener')
                  }}
                />
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function EmptyHint({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-8 text-center text-xs text-muted-foreground space-y-2">
      <p className="font-medium text-foreground/80">{title}</p>
      <p>{body}</p>
    </div>
  )
}

/** Counts used by the chat page for the toggle badge + auto-open. */
export function countWorkspaceItems(messages: UIMessageType[]): {
  artifactCount: number
  fileCount: number
  siteCount: number
} {
  const { groups, files, sites } = collect(messages)
  return {
    artifactCount: groups.reduce((n, g) => n + g.versions.length, 0),
    fileCount: files.length,
    siteCount: sites.length,
  }
}
