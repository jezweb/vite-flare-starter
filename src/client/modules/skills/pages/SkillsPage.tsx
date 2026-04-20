/**
 * SkillsPage — browse, install, preview, enable/disable, and delete skills.
 *
 * Three sources are surfaced with a source badge:
 *   bundled  — shipped with the starter (read-only; toggle only)
 *   r2       — uploaded as SKILL.md or as a zip; live in the SKILLS R2 bucket
 *   github   — fetched from a GitHub URL (single file or directory tree)
 */
import { useState } from 'react'
import { Upload, Code2 as GithubIcon, RefreshCw, Trash2, Eye, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Skills</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Reusable agent procedures — compatible with the{' '}
            <a href="https://agentskills.io/specification" target="_blank" rel="noreferrer" className="underline">agentskills.io spec</a>.
            Use <code className="px-1 rounded bg-muted">/skill-name</code> in chat to activate one explicitly.
          </p>
        </div>
        <div className="flex gap-2">
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
                      onClick={() => {
                        if (confirm(`Delete skill "${s.name}"? This removes it from the registry and R2.`)) {
                          remove.mutate(s.name)
                        }
                      }}
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
              placeholder="https://github.com/anthropics/skills/tree/main/pdf"
              autoFocus
            />
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

      {/* Upload dialog — zip file OR inline SKILL.md paste */}
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
              {uploadContent.isPending ? 'Uploading…' : 'Upload SKILL.md'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <SkillPreviewDialog name={previewName} onClose={() => setPreviewName(null)} />
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
                <p className="text-xs font-medium text-muted-foreground mb-1">Resources</p>
                <ul className="text-xs font-mono space-y-0.5">
                  {data.resources.map((r) => (
                    <li key={r} className="flex items-center gap-1">
                      <ExternalLink className="size-3" />{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Body</p>
              <pre className="text-xs whitespace-pre-wrap bg-muted rounded p-3 font-mono leading-relaxed max-h-[40vh] overflow-y-auto">
                {data.body}
              </pre>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export default SkillsPage
