/**
 * CreateProjectModal — three-tab create flow.
 *
 * Tabs:
 *   1. From template  — pick a bundled template (default)
 *   2. AI-assisted    — describe what you want, AI scaffolds a draft
 *   3. Blank          — manual name + description
 *
 * Templates-first: most users want a curated starting point. Power
 * users who want a blank canvas can still flip to the third tab.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ArrowLeft } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  useCreateProject,
  useProjectTemplates,
  useCreateFromTemplate,
  useScaffoldProject,
  useCreateFromScaffold,
  type ScaffoldDraft,
} from '../hooks/useProjects'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateProjectModal({ open, onOpenChange }: Props) {
  const [tab, setTab] = useState('template')
  const navigate = useNavigate()

  const close = () => {
    onOpenChange(false)
    setTab('template')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create a personal project</DialogTitle>
          <DialogDescription className="sr-only">
            Choose how to start: blank, with AI assistance, or from a template.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="template">From template</TabsTrigger>
            <TabsTrigger value="ai">
              <Sparkles className="size-3.5 mr-1.5" />
              AI-assisted
            </TabsTrigger>
            <TabsTrigger value="blank">Blank</TabsTrigger>
          </TabsList>

          <TabsContent value="template" className="mt-4">
            <TemplateTab onCreated={close} navigate={navigate} />
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <AiTab onCreated={close} navigate={navigate} />
          </TabsContent>

          <TabsContent value="blank" className="mt-4">
            <BlankTab onCreated={close} navigate={navigate} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// --- Blank tab -------------------------------------------------------------

function BlankTab({
  onCreated,
  navigate,
}: {
  onCreated: () => void
  navigate: (to: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const create = useCreateProject()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const result = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      onCreated()
      navigate(`/dashboard/projects/${result.id}`)
    } catch (err) {
      toast.error('Could not create project. Please try again.')
      console.error(err)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="blank-name">What are you working on?</FieldLabel>
          <Input
            id="blank-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name your project"
            maxLength={100}
            autoFocus
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="blank-description">What are you trying to achieve?</FieldLabel>
          <Textarea
            id="blank-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your project, goals, subject, etc..."
            rows={3}
            maxLength={500}
          />
        </Field>
      </FieldGroup>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCreated}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {create.isPending ? <Spinner size="sm" className="mr-1.5" /> : null}
          Create project
        </Button>
      </div>
    </form>
  )
}

// --- AI-assisted tab -------------------------------------------------------

function AiTab({ onCreated, navigate }: { onCreated: () => void; navigate: (to: string) => void }) {
  const [prompt, setPrompt] = useState('')
  const [draft, setDraft] = useState<ScaffoldDraft | null>(null)
  const scaffold = useScaffoldProject()
  const createFromScaffold = useCreateFromScaffold()

  // Editable mirror of the draft so the user can tweak before saving
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSystemPrompt, setEditSystemPrompt] = useState('')

  const generate = async () => {
    if (!prompt.trim()) return
    try {
      const result = await scaffold.mutateAsync({ prompt: prompt.trim() })
      if (result.success) {
        setDraft(result.draft)
        setEditName(result.draft.name)
        setEditDescription(result.draft.description)
        setEditSystemPrompt(result.draft.systemPrompt)
      } else {
        toast.error('Could not generate a draft. Try simpler wording, or use Blank/Template.')
      }
    } catch (err) {
      toast.error('Could not generate a draft. Try simpler wording, or use Blank/Template.')
      console.error(err)
    }
  }

  const create = async () => {
    if (!draft) return
    try {
      const result = await createFromScaffold.mutateAsync({
        name: editName,
        description: editDescription,
        systemPrompt: editSystemPrompt,
        starterMemories: draft.starterMemories,
      })
      onCreated()
      navigate(`/dashboard/projects/${result.id}`)
    } catch (err) {
      toast.error('Could not create project. Please try again.')
      console.error(err)
    }
  }

  if (!draft) {
    return (
      <div className="space-y-4">
        <Field>
          <FieldLabel htmlFor="ai-prompt">
            Describe what you want this project to help you with
          </FieldLabel>
          <Textarea
            id="ai-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. a project to write emails to clients"
            rows={4}
            maxLength={2000}
            autoFocus
          />
          <FieldDescription>
            Examples: <em>"help me plan and review fortnightly newsletters"</em>,{' '}
            <em>"researching new suppliers for a B2B parts business"</em>
          </FieldDescription>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onCreated}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={!prompt.trim() || scaffold.isPending}>
            {scaffold.isPending ? (
              <>
                <Spinner size="sm" className="mr-1.5" />
                Generating draft…
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 mr-1.5" />
                Generate project
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  // Preview + edit
  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
      <Card className="p-4 bg-muted/30">
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel
              htmlFor="ai-name"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Project name
            </FieldLabel>
            <Input
              id="ai-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={100}
              className="font-semibold"
            />
          </Field>
          <Field>
            <FieldLabel
              htmlFor="ai-description"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Description
            </FieldLabel>
            <Textarea
              id="ai-description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </Field>
          <Field>
            <FieldLabel
              htmlFor="ai-systemprompt"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Instructions (system prompt)
            </FieldLabel>
            <Textarea
              id="ai-systemprompt"
              value={editSystemPrompt}
              onChange={(e) => setEditSystemPrompt(e.target.value)}
              rows={6}
              maxLength={8000}
              className="font-mono text-xs md:text-xs"
            />
          </Field>
        </FieldGroup>
      </Card>

      {draft.starterMemories.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Starter memory entries ({draft.starterMemories.length})
          </div>
          <div className="space-y-2">
            {draft.starterMemories.map((m, i) => (
              <div key={i} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {m.type}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{m.description}</div>
                <div className="text-xs mt-1.5">{m.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {draft.suggestedFirstPrompts.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Suggested first prompts
          </div>
          <ul className="space-y-1 text-xs">
            {draft.suggestedFirstPrompts.map((p, i) => (
              <li key={i} className="rounded-md bg-muted/50 px-3 py-2">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-between gap-2 pt-2 sticky bottom-0 bg-background pb-1">
        <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
          <ArrowLeft className="size-3.5 mr-1.5" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCreated}>
            Cancel
          </Button>
          <Button onClick={create} disabled={createFromScaffold.isPending || !editName.trim()}>
            {createFromScaffold.isPending ? <Spinner size="sm" className="mr-1.5" /> : null}
            Create project
          </Button>
        </div>
      </div>
    </div>
  )
}

// --- Templates tab ---------------------------------------------------------

function TemplateTab({
  onCreated,
  navigate,
}: {
  onCreated: () => void
  navigate: (to: string) => void
}) {
  const { data, isLoading } = useProjectTemplates()
  const createFromTemplate = useCreateFromTemplate()
  const [creating, setCreating] = useState<string | null>(null)

  const pick = async (slug: string) => {
    setCreating(slug)
    try {
      const result = await createFromTemplate.mutateAsync({ templateSlug: slug })
      onCreated()
      navigate(`/dashboard/projects/${result.id}`)
    } catch (err) {
      toast.error('Could not create project from template. Please try again.')
      console.error(err)
    } finally {
      setCreating(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <Spinner size="lg" className="mr-2" />
        Loading templates…
      </div>
    )
  }

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
      <p className="text-sm text-muted-foreground">
        Pick a template to start a project pre-filled with instructions, starter memory, and
        suggested prompts.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data?.templates.map((t) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => pick(t.slug)}
            disabled={creating !== null}
            className="group relative text-left rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-muted/30 hover:shadow-sm transition-all disabled:opacity-60 disabled:cursor-progress"
          >
            <span className="absolute right-3 top-3 text-[10px] font-medium text-muted-foreground opacity-40 group-hover:opacity-100 transition-opacity">
              Use this →
            </span>
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                {t.emoji && <span className="text-base">{t.emoji}</span>}
                {t.name}
              </h3>
              {creating === t.slug && <Spinner size="sm" className="text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground mb-2">{t.description}</p>
            <div className="flex flex-wrap gap-1">
              {t.includes.map((inc, i) => (
                <span
                  key={i}
                  className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground rounded-full px-2 py-0.5"
                >
                  {inc}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCreated}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
