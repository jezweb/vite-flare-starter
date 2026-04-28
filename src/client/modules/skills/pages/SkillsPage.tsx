/**
 * SkillsPage — browse, install, preview, edit, enable/disable, delete skills.
 *
 * Layout:
 *   Desktop  — list on the left (320px), editor on the right (fluid).
 *   Mobile   — list full-width; selecting a skill replaces it with the editor.
 *
 * Edit flow uses the shared ConfigDiffProposal primitive (/api/config-diff).
 * Bundled skills that the user edits are transparently overridden by an R2
 * copy — the skills table flips `source: 'r2'`, and the R2 version wins.
 */
import { useState } from 'react'
import {
  Upload,
  Code2 as GithubIcon,
  RefreshCw,
  Trash2,
  Plus,
  ArrowLeft,
  MoreHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/client/components/EmptyState'
import { Zap } from 'lucide-react'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { cn } from '@/lib/utils'
import {
  useSkillsList,
  useInstallGitHubSkill,
  useUploadSkillZip,
  useUploadSkillContent,
  useToggleSkill,
  useDeleteSkill,
  useSyncBundled,
} from '../hooks/useSkills'
import { SkillEditor } from '../components/SkillEditor'

export function SkillsPage() {
  const { data, isLoading } = useSkillsList()
  const sync = useSyncBundled()
  const install = useInstallGitHubSkill()
  const uploadZip = useUploadSkillZip()
  const uploadContent = useUploadSkillContent()
  const toggle = useToggleSkill()
  const remove = useDeleteSkill()

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [installOpen, setInstallOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [githubUrl, setGithubUrl] = useState('')
  const [inlineContent, setInlineContent] = useState('')

  const skills = data?.skills ?? []

  // Auto-select first skill once the list loads, only on desktop widths.
  // We don't force it on mobile because that hides the list behind the
  // detail pane and the user hasn't asked for an editor yet.
  const effectiveSelected =
    selectedName ?? (typeof window !== 'undefined' && window.innerWidth >= 1024
      ? skills[0]?.name ?? null
      : null)

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
    <PageContainer type="catalog">
      <PageHeader
        title="Skills"
        subtitle="Teach your AI to do specific jobs — write a morning brief, review a contract, draft an email. Type /skill-name in chat to use one."
        trailing={
          <>
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 size-4" /> Add skill
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More skill actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setInstallOpen(true)}>
                  <GithubIcon className="mr-2 size-4" /> Install from GitHub
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => sync.mutate()}
                  disabled={sync.isPending}
                >
                  <RefreshCw
                    className={`mr-2 size-4 ${sync.isPending ? 'animate-spin' : ''}`}
                  />
                  Refresh starter skills
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-md bg-muted"
            />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No skills yet"
          description="Skills are reusable agent procedures the AI can invoke during chat."
          tips={[
            'Type /skill-name in any chat to activate a skill',
            'Install bundled examples from GitHub, or paste your own SKILL.md',
          ]}
          action={{ label: 'Add skill', onClick: () => setUploadOpen(true) }}
          secondaryAction={{
            label: 'Install from GitHub',
            onClick: () => setInstallOpen(true),
          }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* List column — hidden on mobile when a skill is selected so
              the editor has room. */}
          <div
            className={cn(
              'space-y-1 rounded-lg border bg-card p-2',
              effectiveSelected && 'hidden lg:block',
            )}
          >
            <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground">
              <span>{skills.length} skills</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setUploadOpen(true)}
                className="h-6 w-6 p-0"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ul className="max-h-[70vh] space-y-0.5 overflow-y-auto">
              {skills.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedName(s.name)}
                    className={cn(
                      'group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-primary/40',
                      effectiveSelected === s.name && 'bg-muted',
                      !s.enabled && 'opacity-60',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-sm font-mono">
                          /{s.name}
                        </span>
                      </div>
                      <p className="line-clamp-1 text-[11px] text-muted-foreground">
                        {s.description}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge
                        variant={s.source === 'bundled' ? 'secondary' : 'outline'}
                        className="text-[9px] leading-none"
                      >
                        {s.source}
                      </Badge>
                      <Switch
                        checked={s.enabled}
                        onCheckedChange={(checked) => {
                          toggle.mutate({ name: s.name, enabled: checked })
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="scale-75"
                        aria-label={
                          s.enabled ? 'Disable skill' : 'Enable skill'
                        }
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Detail / editor column */}
          <div className="min-w-0">
            {effectiveSelected ? (
              <>
                {/* Mobile back button */}
                <div className="mb-2 flex items-center justify-between lg:hidden">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedName(null)}
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back to list
                  </Button>
                  {skills.find((s) => s.name === effectiveSelected)?.isPersonal && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(effectiveSelected)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <SkillEditor key={effectiveSelected} name={effectiveSelected} />
                {/* Desktop "Revert to bundled" button — only shown when the
                    caller owns a personal override. Deleting the override
                    restores the bundled version. Bundled rows are shared,
                    so the delete action isn't offered for them. */}
                {skills.find((s) => s.name === effectiveSelected)?.isPersonal && (
                  <div className="mt-3 hidden justify-end lg:flex">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTarget(effectiveSelected)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5 text-destructive" />
                      Revert to bundled
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full min-h-[300px] items-center justify-center rounded-lg border bg-muted/20 p-6 text-sm text-muted-foreground">
                Select a skill to view or edit.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Install-from-GitHub dialog */}
      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install skill from GitHub</DialogTitle>
            <DialogDescription>
              Paste a directory URL or raw SKILL.md URL. Directory imports
              copy scripts/references/assets into R2.
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
            {(() => {
              const guessedName = githubUrl
                .trim()
                .replace(/\/+$/, '')
                .split('/')
                .pop()
                ?.toLowerCase()
              const existing =
                guessedName && skills.find((s) => s.name === guessedName)
              if (!existing) return null
              return (
                <p className="text-xs text-amber-500">
                  ⚠ A skill named{' '}
                  <code className="whitespace-nowrap">/{guessedName}</code>{' '}
                  already exists ({existing.source}). Installing may overwrite
                  or collide.
                </p>
              )
            })()}
            {install.isError && (
              <p className="text-sm text-destructive">
                {(install.error as Error).message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInstall}
              disabled={install.isPending || !githubUrl.trim()}
            >
              {install.isPending ? 'Installing…' : 'Install'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a skill</DialogTitle>
            <DialogDescription>
              Upload a zip archive (must contain <code>SKILL.md</code> at the
              root) or paste a SKILL.md inline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="zip-file">Zip archive</Label>
              <Input
                id="zip-file"
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleZip(f)
                }}
                disabled={uploadZip.isPending}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {uploadZip.isPending
                  ? 'Uploading zip…'
                  : 'Uploads automatically when you pick a file.'}
              </p>
              {uploadZip.isError && (
                <p className="mt-1 text-sm text-destructive">
                  {(uploadZip.error as Error).message}
                </p>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground">
                  OR
                </span>
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
                className="font-mono text-xs md:text-xs"
              />
              {uploadContent.isError && (
                <p className="mt-1 text-sm text-destructive">
                  {(uploadContent.error as Error).message}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInline}
              disabled={uploadContent.isPending || !inlineContent.trim()}
            >
              {uploadContent.isPending
                ? 'Uploading…'
                : 'Upload pasted SKILL.md'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete skill "{deleteTarget}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the skill from the registry and R2. Existing
              conversations that used it won't be affected, but you won't be
              able to activate it in new chats. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) remove.mutate(deleteTarget)
                if (selectedName === deleteTarget) setSelectedName(null)
                setDeleteTarget(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}

export default SkillsPage
