/**
 * SkillsPage — browse, install, preview, enable/disable, and delete skills.
 *
 * Three sources are surfaced with a source badge:
 *   bundled  — shipped with the starter (read-only; toggle only)
 *   r2       — uploaded as SKILL.md or as a zip; live in the SKILLS R2 bucket
 *   github   — fetched from a GitHub URL (single file or directory tree)
 */
import { useState } from 'react'
import { Upload, Code2 as GithubIcon, RefreshCw, Trash2, Eye, FileText, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  useSkillsList,
  useSkill,
  useInstallGitHubSkill,
  useUploadSkillZip,
  useUploadSkillContent,
  useToggleSkill,
  useDeleteSkill,
  useSyncBundled,
} from '../hooks/useSkills'

export function SkillsPage() {
  const { data, isLoading } = useSkillsList()
  const sync = useSyncBundled()
  const install = useInstallGitHubSkill()
  const uploadZip = useUploadSkillZip()
  const uploadContent = useUploadSkillContent()
  const toggle = useToggleSkill()
  const remove = useDeleteSkill()

  const [installOpen, setInstallOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState<string | null>(null)
  const [githubUrl, setGithubUrl] = useState('')
  const [inlineContent, setInlineContent] = useState('')

  const skills = data?.skills ?? []

  const handleInstall = async () => {
    if (!githubUrl.trim()) return
    await install.mutateAsync(githubUrl.trim())
    setGithubUrl('')
    setInstallOpen(false)
  }

  const handleZip = async (file: File) => {
    await uploadZip.mutateAsync(file)
    setUploadOpen(false)
  }

  const handleInline = async () => {
    if (!inlineContent.trim()) return
    await uploadContent.mutateAsync({ content: inlineContent, overwrite: true })
    setInlineContent('')
    setUploadOpen(false)
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Top row: title + action buttons on one line; description below so
          it can't collide with the buttons at narrower widths. Fix for
          UX audit findings M2 + L5 (orphaned period after the anchor). */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">Skills</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={`size-4 mr-2 ${sync.isPending ? 'animate-spin' : ''}`} />
            Sync bundled
          </Button>
          <Button variant="outline" onClick={() => setInstallOpen(true)}>
            <GithubIcon className="size-4 mr-2" /> Install from GitHub
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="size-4 mr-2" /> Upload
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-sm max-w-prose">
        Reusable agent procedures — compatible with the{' '}
        <a href="https://agentskills.io/specification" target="_blank" rel="noreferrer" className="underline">
          agentskills.io spec
        </a>
        . Use <code className="px-1 rounded bg-muted whitespace-nowrap">/skill-name</code> in chat to activate one explicitly.
      </p>

      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Loading…</CardContent></Card>
      ) : skills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No skills yet.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Install one from GitHub or upload a SKILL.md / zip to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map((s) => (
            <Card key={s.id} className={s.enabled ? '' : 'opacity-60'}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">/{s.name}</CardTitle>
                  <Badge variant={s.source === 'bundled' ? 'secondary' : 'outline'} className="text-[10px]">
                    {s.source}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-3">{s.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between pt-0">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(checked) => toggle.mutate({ name: s.name, enabled: checked })}
                    aria-label={s.enabled ? 'Disable skill' : 'Enable skill'}
                  />
                  <span className="text-xs text-muted-foreground">{s.enabled ? 'Enabled' : 'Disabled'}</span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setPreviewName(s.name)} aria-label="Preview">
                    <Eye className="size-4" />
                  </Button>
                  {s.source !== 'bundled' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(s.name)}
                      aria-label="Delete"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Install-from-GitHub dialog */}
      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install skill from GitHub</DialogTitle>
            <DialogDescription>
              Paste a directory URL (<code>https://github.com/owner/repo/tree/main/skill-name</code>) or a raw SKILL.md URL. Directory
              imports copy scripts/references/assets into R2.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="github-url">GitHub URL</Label>
            <Input
              id="github-url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/anthropics/skills/tree/main/skills/pdf"
              autoFocus
            />
            {/* Best-effort collision check — compare the last path segment
                against existing skill names. Not authoritative (the SKILL.md
                frontmatter may declare a different name) but catches the
                common case where the directory name matches the skill name. */}
            {(() => {
              const guessedName = githubUrl.trim().replace(/\/+$/, '').split('/').pop()?.toLowerCase()
              const existing = guessedName && skills.find((s) => s.name === guessedName)
              if (!existing) return null
              return (
                <p className="text-xs text-amber-500">
                  ⚠ A skill named <code className="whitespace-nowrap">/{guessedName}</code> already exists ({existing.source}). Installing may overwrite or collide.
                </p>
              )
            })()}
            {install.isError && (
              <p className="text-sm text-destructive">{(install.error as Error).message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallOpen(false)}>Cancel</Button>
            <Button onClick={handleInstall} disabled={install.isPending || !githubUrl.trim()}>
              {install.isPending ? 'Installing…' : 'Install'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload dialog — zip file OR inline SKILL.md paste. The zip mode
          uploads as soon as the user picks a file (no separate submit button);
          the inline mode has a submit at the bottom. Labels make this clear
          per UX audit M3. */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a skill</DialogTitle>
            <DialogDescription>
              Upload a zip archive (must contain <code>SKILL.md</code> at the root) or paste a SKILL.md inline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="zip-file">Zip archive</Label>
              <Input
                id="zip-file"
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleZip(f) }}
                disabled={uploadZip.isPending}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {uploadZip.isPending ? 'Uploading zip…' : 'Uploads automatically when you pick a file.'}
              </p>
              {uploadZip.isError && (
                <p className="text-sm text-destructive mt-1">{(uploadZip.error as Error).message}</p>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground">OR</span>
              </div>
            </div>

            <div>
              <Label htmlFor="inline-content">Paste SKILL.md</Label>
              <Textarea
                id="inline-content"
                value={inlineContent}
                onChange={(e) => setInlineContent(e.target.value)}
                placeholder="---&#10;name: my-skill&#10;description: ...&#10;---&#10;&#10;# My Skill&#10;..."
                rows={8}
                className="font-mono text-xs"
              />
              {uploadContent.isError && (
                <p className="text-sm text-destructive mt-1">{(uploadContent.error as Error).message}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleInline} disabled={uploadContent.isPending || !inlineContent.trim()}>
              {uploadContent.isPending ? 'Uploading…' : 'Upload pasted SKILL.md'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <SkillPreviewDialog name={previewName} onClose={() => setPreviewName(null)} />

      {/* Delete confirmation — replaces a native confirm() dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete skill "{deleteTarget}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the skill from the registry and R2. Existing conversations
              that used it won't be affected, but you won't be able to activate it
              in new chats. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) remove.mutate(deleteTarget)
                setDeleteTarget(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SkillPreviewDialog({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { data, isLoading } = useSkill(name)
  return (
    <Dialog open={!!name} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>/{data?.name}</span>
            {data && (
              <Badge variant="outline" className="text-[10px]">{data.source}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>{data?.description}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : data ? (
          <div className="space-y-3">
            {data.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <p className="font-medium mb-1">Warnings</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            {data.resources.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Resources — click to view file contents
                </p>
                <ul className="text-xs font-mono space-y-0.5">
                  {data.resources.map((r) => (
                    <ResourceRow key={r} skillName={data.name} path={r} />
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Body</p>
              <pre className="text-xs whitespace-pre-wrap bg-muted rounded p-3 font-mono leading-relaxed">
                {data.body}
              </pre>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/**
 * ResourceRow — one row in the Resources list inside SkillPreviewDialog.
 * Click the filename to expand and fetch its content via read_skill_resource
 * (through the /api/skills/:name/resources/:path endpoint — wired indirectly
 * via a fetch for simplicity). Content caches per-expand so re-opening the
 * same row doesn't re-fetch.
 */
function ResourceRow({ skillName, path }: { skillName: string; path: string }) {
  const [expanded, setExpanded] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (content !== null) return
    setLoading(true)
    setError(null)
    try {
      // Re-fetch the skill full body — cheapest path since the skill detail
      // endpoint already returns resources metadata; but we need actual
      // content, which we load via the loader tool directly on the server.
      // Use a small fetch helper that pokes loadSkill via /api/skills/:name
      // then reads the resource from the skill's registry (bundled skills
      // ship in the bundle; r2/github read from R2). For now, fetch via
      // a thin endpoint.
      const resp = await fetch(
        `/api/skills/${encodeURIComponent(skillName)}/resources/${encodeURIComponent(path)}`,
        { credentials: 'include' },
      )
      if (!resp.ok) throw new Error(`Failed to load (${resp.status})`)
      const data = await resp.json() as { content?: string; error?: string }
      if (data.error) throw new Error(data.error)
      setContent(data.content ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <FileText className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{path}</span>
      </button>
      {expanded && (
        <div className="ml-5 mt-1 mb-2">
          {loading && <p className="text-muted-foreground italic">Loading…</p>}
          {error && <p className="text-destructive">{error}</p>}
          {content !== null && !loading && !error && (
            <pre className="whitespace-pre-wrap bg-muted/50 rounded p-2 text-[11px] leading-relaxed">
              {content || '(empty file)'}
            </pre>
          )}
        </div>
      )}
    </li>
  )
}

export default SkillsPage
