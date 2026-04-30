/**
 * SkillsPage — browse, install, preview, edit, enable/disable, delete skills.
 *
 * Layout (post 2026-04-30 retrofit, gh #59):
 *   - Card-grid by default (Item primitive). 5–30 visual entries with
 *     icon + name + slash form + description + source badge + on/off.
 *   - Toggle to list view via shadcn ToggleGroup. Persisted per-user
 *     via `useViewPreference('skills', 'cards')`.
 *   - Selected skill's editor renders BELOW the grid/list (claude.ai
 *     pattern) and the page scrolls it into view. No separate route,
 *     no split-pane that squeezes both halves.
 *
 * Edit flow uses the shared ConfigDiffProposal primitive (/api/config-diff).
 * Bundled skills that the user edits are transparently overridden by an R2
 * copy — the skills table flips `source: 'r2'`, and the R2 version wins.
 */
import { useEffect, useRef, useState } from 'react'
import {
  Upload,
  Code2 as GithubIcon,
  RefreshCw,
  Trash2,
  ArrowLeft,
  MoreHorizontal,
  LayoutGrid,
  List as ListIcon,
  Sparkles,
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { useViewPreference } from '@/client/lib/use-view-preference'
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
import { formatSkillName, formatSkillSlash } from '@/shared/format/skill'

type Skill = NonNullable<ReturnType<typeof useSkillsList>['data']>['skills'][number]

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

  const [view, setView] = useViewPreference<'cards' | 'list'>('skills', 'cards')

  const detailRef = useRef<HTMLDivElement | null>(null)

  const skills = data?.skills ?? []

  // Auto-select the first skill once the list loads on desktop only —
  // on narrower widths users haven't asked for an editor yet.
  const effectiveSelected =
    selectedName ?? (typeof window !== 'undefined' && window.innerWidth >= 1024
      ? skills[0]?.name ?? null
      : null)

  // Scroll the detail pane into view when a skill is picked from
  // the grid/list. Skip on the auto-select fallback so the page
  // doesn't jump on initial load.
  useEffect(() => {
    if (!selectedName) return
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedName])

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
              className="h-20 animate-pulse rounded-md bg-muted"
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
        <>
          {/* Toolbar — count + view toggle */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {skills.length} {skills.length === 1 ? 'skill' : 'skills'}
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={view}
              onValueChange={(v) => v && setView(v as 'cards' | 'list')}
              aria-label="Layout view"
            >
              <ToggleGroupItem value="cards" aria-label="Card view">
                <LayoutGrid className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view">
                <ListIcon className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {view === 'cards' ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {skills.map((s) => (
                <SkillCard
                  key={s.id}
                  skill={s}
                  selected={effectiveSelected === s.name}
                  onSelect={() => setSelectedName(s.name)}
                  onToggle={(checked) =>
                    toggle.mutate({ name: s.name, enabled: checked })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <ul className="divide-y divide-border">
                {skills.map((s) => (
                  <SkillListRow
                    key={s.id}
                    skill={s}
                    selected={effectiveSelected === s.name}
                    onSelect={() => setSelectedName(s.name)}
                    onToggle={(checked) =>
                      toggle.mutate({ name: s.name, enabled: checked })
                    }
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Detail / editor — renders below the grid/list */}
          {effectiveSelected && (
            <div ref={detailRef} className="mt-2 scroll-mt-6">
              <div className="mb-3 flex items-center justify-between border-t pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedName(null)}
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back to {view === 'cards' ? 'cards' : 'list'}
                </Button>
                {skills.find((s) => s.name === effectiveSelected)?.isPersonal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteTarget(effectiveSelected)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5 text-destructive" />
                    Revert to bundled
                  </Button>
                )}
              </div>
              <SkillEditor key={effectiveSelected} name={effectiveSelected} />
            </div>
          )}
        </>
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

interface SkillRowProps {
  skill: Skill
  selected: boolean
  onSelect: () => void
  onToggle: (checked: boolean) => void
}

/**
 * Card variant of a skill row — sits in a 1-3 column grid.
 *
 * Two focus stops: the title button (selects + scrolls to editor) and
 * the Switch (toggles enabled). No nested-interactive — Switch sits
 * outside the button via the Item primitive's flex layout.
 */
function SkillCard({ skill: s, selected, onSelect, onToggle }: SkillRowProps) {
  return (
    <Item
      variant={selected ? 'outline' : 'default'}
      className={cn(
        'border bg-card transition-colors hover:bg-muted/30',
        selected && 'border-primary bg-primary/5 hover:bg-primary/5',
        !s.enabled && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      >
        <ItemMedia variant="icon">
          <Sparkles className="size-4" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="flex-wrap">
            <span className="truncate">{formatSkillName(s.name)}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {formatSkillSlash(s.name)}
            </span>
          </ItemTitle>
          <ItemDescription className="line-clamp-2">
            {s.description}
          </ItemDescription>
        </ItemContent>
      </button>
      <ItemActions className="shrink-0 flex-col items-end gap-2 self-start">
        <Badge
          variant={s.source === 'bundled' ? 'secondary' : 'outline'}
          className="text-[10px]"
        >
          {s.source}
        </Badge>
        <Switch
          checked={s.enabled}
          onCheckedChange={onToggle}
          className="scale-90"
          aria-label={s.enabled ? 'Disable skill' : 'Enable skill'}
        />
      </ItemActions>
    </Item>
  )
}

/**
 * List variant of a skill row — denser, text-dominant. Same two
 * focus stops as the card variant.
 */
function SkillListRow({ skill: s, selected, onSelect, onToggle }: SkillRowProps) {
  return (
    <li
      className={cn(
        'group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40',
        selected && 'bg-primary/5',
        !s.enabled && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      >
        <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-medium">
              {formatSkillName(s.name)}
            </span>
            <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground">
              {formatSkillSlash(s.name)}
            </span>
          </div>
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {s.description}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <Badge
          variant={s.source === 'bundled' ? 'secondary' : 'outline'}
          className="text-[10px]"
        >
          {s.source}
        </Badge>
        <Switch
          checked={s.enabled}
          onCheckedChange={onToggle}
          className="scale-90"
          aria-label={s.enabled ? 'Disable skill' : 'Enable skill'}
        />
      </div>
    </li>
  )
}

export default SkillsPage
