/**
 * CreateSpaceModal — three options: Blank, Solo workshop, From template (Phase 2).
 *
 * Phase 1 ships only Blank and Solo workshop. Solo is a shortcut: just
 * the creator + a few default agents in mention mode. Both surfaces
 * call the same POST /api/spaces under the hood.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Hash, Sparkles, FolderKanban } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateSpace } from '../hooks/useSpaces'

interface Props {
  open: boolean
  onClose: () => void
}

export function CreateSpaceModal({ open, onClose }: Props) {
  const navigate = useNavigate()
  const create = useCreateSpace()
  const [tab, setTab] = useState<'blank' | 'solo' | 'template'>('blank')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!open) {
      setTitle('')
      setDescription('')
      setTab('blank')
    }
  }, [open])

  const submit = async (mode: 'blank' | 'solo') => {
    if (!title.trim()) return
    const agents =
      mode === 'solo'
        ? [
            { agentClass: 'AssistantAgent', agentName: 'assistant', replyMode: 'mention' as const },
            { agentClass: 'ResearcherAgent', agentName: 'research', replyMode: 'mention' as const },
            { agentClass: 'WriterAgent', agentName: 'writer', replyMode: 'mention' as const },
          ]
        : [{ agentClass: 'AssistantAgent', agentName: 'assistant', replyMode: 'mention' as const }]
    try {
      const result = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        spaceMode: 'invite',
        defaultReplyMode: 'mention',
        agents,
      })
      onClose()
      navigate(`/dashboard/spaces/${result.id}`)
    } catch (err) {
      // Surface the error inline. The mutation tracks state via create.error.
      console.error(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New space</DialogTitle>
          <DialogDescription>
            A space is a multi-participant room — you, teammates, and AI agents.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="blank">
              <Hash className="mr-1.5 size-3.5" />
              Blank
            </TabsTrigger>
            <TabsTrigger value="solo">
              <Sparkles className="mr-1.5 size-3.5" />
              Solo workshop
            </TabsTrigger>
            <TabsTrigger value="template" disabled>
              <FolderKanban className="mr-1.5 size-3.5" />
              Templates
            </TabsTrigger>
          </TabsList>
          <TabsContent value="blank" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="space-title">Name</Label>
              <Input
                id="space-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. marketing-pod"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="space-desc">Description (optional)</Label>
              <Textarea
                id="space-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this space for?"
                rows={3}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Default: agents reply only when @-mentioned. You can change this in space settings.
            </div>
            {create.error ? (
              <div className="text-xs text-destructive">{(create.error as Error).message}</div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
                Cancel
              </Button>
              <Button onClick={() => submit('blank')} disabled={!title.trim() || create.isPending}>
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Create'}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="solo" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Just you + AssistantAgent, ResearcherAgent, and WriterAgent. All in @-mention mode —
              they only reply when you call them by name.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="solo-title">Name</Label>
              <Input
                id="solo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. weekly-research"
              />
            </div>
            {create.error ? (
              <div className="text-xs text-destructive">{(create.error as Error).message}</div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
                Cancel
              </Button>
              <Button onClick={() => submit('solo')} disabled={!title.trim() || create.isPending}>
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Create solo workshop'}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="template" className="pt-3 text-sm text-muted-foreground">
            Templates land in Phase 2 — Marketing pod, Solo workshop, Customer support war room.
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
