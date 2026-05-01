/**
 * CreateSpaceModal — three options: Templates (default), Custom, Solo.
 *
 * Templates-first: most users want a curated agent bundle, not a blank
 * form. Templates lead. "Custom" lets you pick agents + reply modes by
 * hand. "Solo" is the one-click shortcut (you + every default agent in
 * @-mention mode).
 *
 * Templates are config-driven — see `src/shared/config/space-templates.ts`.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hash, Sparkles, FolderKanban } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useCreateSpace } from '../hooks/useSpaces'
import {
  AGENT_CATALOGUE,
  SPACE_TEMPLATES,
  type SpaceTemplate,
  type ReplyMode,
} from '@/shared/config/space-templates'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

interface AgentSelection {
  enabled: boolean
  replyMode: ReplyMode
}

export function CreateSpaceModal({ open, onClose }: Props) {
  const navigate = useNavigate()
  const create = useCreateSpace()
  const [tab, setTab] = useState<'blank' | 'template' | 'solo'>('template')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [defaultReplyMode, setDefaultReplyMode] = useState<ReplyMode>('mention')
  // One row per catalogue entry — tracks enabled + replyMode for each.
  const [agentSel, setAgentSel] = useState<Record<string, AgentSelection>>(() =>
    Object.fromEntries(
      AGENT_CATALOGUE.map((a) => [a.agentName, { enabled: true, replyMode: 'mention' as ReplyMode }]),
    ),
  )

  useEffect(() => {
    if (!open) {
      setTitle('')
      setDescription('')
      setDefaultReplyMode('mention')
      setTab('template')
      setAgentSel(
        Object.fromEntries(
          AGENT_CATALOGUE.map((a) => [a.agentName, { enabled: true, replyMode: 'mention' }]),
        ),
      )
    }
  }, [open])

  const enabledAgents = AGENT_CATALOGUE.filter((a) => agentSel[a.agentName]?.enabled).map((a) => ({
    agentClass: a.agentClass,
    agentName: a.agentName,
    replyMode: agentSel[a.agentName]?.replyMode ?? 'mention',
  }))

  const submitBlank = async () => {
    if (!title.trim()) return
    try {
      const result = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        spaceMode: 'invite',
        defaultReplyMode,
        agents: enabledAgents,
      })
      onClose()
      navigate(`/dashboard/spaces/${result.id}`)
    } catch (err) {
      console.error(err)
    }
  }

  const submitTemplate = async (tpl: SpaceTemplate) => {
    const finalTitle = title.trim() || tpl.suggestedTitle.trim() || tpl.name
    try {
      const result = await create.mutateAsync({
        title: finalTitle,
        description: tpl.description || undefined,
        spaceMode: 'invite',
        defaultReplyMode: 'mention',
        agents: tpl.agents.map((a) => ({ ...a })),
      })
      onClose()
      navigate(`/dashboard/spaces/${result.id}`)
    } catch (err) {
      console.error(err)
    }
  }

  const submitSolo = async () => {
    if (!title.trim()) return
    try {
      const result = await create.mutateAsync({
        title: title.trim(),
        description: 'Solo workshop — me + every default agent in @-mention mode.',
        spaceMode: 'invite',
        defaultReplyMode: 'mention',
        agents: AGENT_CATALOGUE.map((a) => ({
          agentClass: a.agentClass,
          agentName: a.agentName,
          replyMode: 'mention' as ReplyMode,
        })),
      })
      onClose()
      navigate(`/dashboard/spaces/${result.id}`)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New space</DialogTitle>
          <DialogDescription>
            A space is a multi-participant room — you, teammates, and AI agents.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="template">
              <FolderKanban className="mr-1.5 size-3.5" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="blank">
              <Hash className="mr-1.5 size-3.5" />
              Custom
            </TabsTrigger>
            <TabsTrigger value="solo">
              <Sparkles className="mr-1.5 size-3.5" />
              Solo
            </TabsTrigger>
          </TabsList>

          {/* Custom — pick agents + reply modes */}
          <TabsContent value="blank" className="space-y-4 pt-3">
            <Field>
              <FieldLabel htmlFor="space-title">Name</FieldLabel>
              <Input
                id="space-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. marketing-pod"
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="space-desc">Description (optional)</FieldLabel>
              <Textarea
                id="space-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this space for?"
                rows={2}
              />
            </Field>
            <div className="space-y-2">
              <Label>Agents</Label>
              <p className="text-xs text-muted-foreground">
                Tick the agents to invite, then choose how each one responds. You can change this later.
              </p>
              <div className="space-y-2 rounded-md border border-border p-2">
                {AGENT_CATALOGUE.map((a) => {
                  const sel = agentSel[a.agentName] ?? { enabled: false, replyMode: 'mention' }
                  return (
                    <div key={a.agentName} className="flex items-start gap-3 rounded-md p-2 hover:bg-accent/40">
                      <Checkbox
                        id={`agent-${a.agentName}`}
                        checked={sel.enabled}
                        onCheckedChange={(checked) =>
                          setAgentSel((prev) => ({
                            ...prev,
                            [a.agentName]: { ...sel, enabled: !!checked },
                          }))
                        }
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`agent-${a.agentName}`} className="cursor-pointer text-sm font-medium">
                          @{a.agentName}
                        </label>
                        <p className="text-xs text-muted-foreground">{a.description}</p>
                      </div>
                      <select
                        value={sel.replyMode}
                        onChange={(e) =>
                          setAgentSel((prev) => ({
                            ...prev,
                            [a.agentName]: { ...sel, replyMode: e.target.value as ReplyMode },
                          }))
                        }
                        disabled={!sel.enabled}
                        className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 disabled:opacity-40"
                      >
                        <option value="mention">@-mention only</option>
                        <option value="proactive">Proactive (jumps in if relevant)</option>
                        <option value="ambient">Ambient (reacts only)</option>
                        <option value="always">Replies always</option>
                        <option value="off">Paused</option>
                      </select>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Default reply mode for new members:{' '}
                <select
                  value={defaultReplyMode}
                  onChange={(e) => setDefaultReplyMode(e.target.value as ReplyMode)}
                  className="ml-1 h-6 rounded border border-input bg-background px-1 text-[11px]"
                >
                  <option value="mention">@-mention only</option>
                  <option value="always">always</option>
                  <option value="off">paused</option>
                </select>
              </p>
            </div>
            {create.error ? (
              <div className="text-xs text-destructive">{(create.error as Error).message}</div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
                Cancel
              </Button>
              <Button onClick={submitBlank} disabled={!title.trim() || create.isPending}>
                {create.isPending ? <Spinner size="md" /> : 'Create'}
              </Button>
            </div>
          </TabsContent>

          {/* Templates */}
          <TabsContent value="template" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              Pick a template to start with a curated agent set + suggested name. Edit anything after.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SPACE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className={cn(
                    'group relative flex flex-col items-start gap-1 rounded-md border border-border bg-background p-3 text-left transition-all',
                    'hover:border-foreground/30 hover:bg-accent/40 hover:shadow-sm',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                  onClick={() => submitTemplate(tpl)}
                  disabled={create.isPending}
                >
                  <span className="absolute right-2 top-2 text-[10px] font-medium text-muted-foreground opacity-40 group-hover:opacity-100 transition-opacity">
                    Use this →
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none">{tpl.emoji}</span>
                    <span className="text-sm font-medium">{tpl.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{tpl.tagline}</p>
                  {tpl.agents.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tpl.agents.map((a) => (
                        <span key={a.agentName} className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                          @{a.agentName}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="mt-1 text-[10px] text-muted-foreground">No agents — add later</span>
                  )}
                </button>
              ))}
            </div>
            {create.error ? (
              <div className="text-xs text-destructive">{(create.error as Error).message}</div>
            ) : null}
          </TabsContent>

          {/* Solo */}
          <TabsContent value="solo" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Just you + every default agent (@assistant, @research, @writer) in @-mention mode.
            </p>
            <Field>
              <FieldLabel htmlFor="solo-title">Name</FieldLabel>
              <Input
                id="solo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. weekly-research"
              />
            </Field>
            {create.error ? (
              <div className="text-xs text-destructive">{(create.error as Error).message}</div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
                Cancel
              </Button>
              <Button onClick={submitSolo} disabled={!title.trim() || create.isPending}>
                {create.isPending ? <Spinner size="md" /> : 'Create solo workshop'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
