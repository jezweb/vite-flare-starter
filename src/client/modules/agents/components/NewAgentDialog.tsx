/**
 * NewAgentDialog — pick class + slug for a new agent instance.
 *
 * Submits by handing (class, slug) up to the parent, which opens the
 * normal AgentEditSheet pre-filled with that target. The actual DO
 * creation happens when the user clicks Save in the edit sheet
 * (PATCH /api/agent-instances/:class/:name calls setOwner first).
 *
 * Slug defaults to lowercase class name minus the `Agent` suffix —
 * matches existing call-site conventions (`assistant`, `researcher`,
 * `writer`, `sweeper`, `admin`). User overrides for second instances
 * (e.g. `researcher-cf-workers` alongside the default `researcher`).
 */
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { useRegisteredAgents } from '../hooks/useAgentInstances'

interface Props {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** Called when the user clicks Continue. Parent opens the edit sheet. */
  onCreate: (agentClass: string, agentName: string) => void
}

const SLUG_RE = /^[a-z0-9_-]{1,60}$/

function defaultSlugForClass(className: string): string {
  return className.replace(/Agent$/, '').toLowerCase()
}

export function NewAgentDialog({ open, onOpenChange, onCreate }: Props) {
  const registered = useRegisteredAgents()
  const classes = registered.data?.agents ?? []

  const [agentClass, setAgentClass] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  // First load — pick the first registered class so the user has a sensible
  // default rather than an empty dropdown.
  useEffect(() => {
    if (!agentClass && classes.length > 0 && classes[0]) {
      setAgentClass(classes[0].className)
    }
  }, [classes, agentClass])

  // Auto-update slug to match the class default UNTIL the user has typed a
  // custom slug — then we leave their input alone.
  useEffect(() => {
    if (!slugTouched && agentClass) {
      setSlug(defaultSlugForClass(agentClass))
    }
  }, [agentClass, slugTouched])

  const slugValid = SLUG_RE.test(slug)
  const canSubmit = agentClass && slugValid

  const handleSubmit = () => {
    if (!canSubmit) return
    onCreate(agentClass, slug)
    // Reset so the next open isn't pre-populated with stale state.
    setAgentClass('')
    setSlug('')
    setSlugTouched(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New agent</DialogTitle>
          <DialogDescription>
            Pick a type and a name. On the next screen you'll set persona, model, and budget.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="new-agent-class">Type</FieldLabel>
            <NativeSelect
              id="new-agent-class"
              value={agentClass}
              onChange={(e) => setAgentClass(e.target.value)}
              className="w-full"
            >
              {classes.map((c) => (
                <NativeSelectOption key={c.className} value={c.className}>
                  {c.displayName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {agentClass ? (
              <FieldDescription>
                {classes.find((c) => c.className === agentClass)?.description}
              </FieldDescription>
            ) : (
              <FieldDescription>
                Unsure? Pick <strong>AI assistant</strong> — it's the most general type.
              </FieldDescription>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="new-agent-slug">Name</FieldLabel>
            <Input
              id="new-agent-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value)
                setSlugTouched(true)
              }}
              placeholder="e.g. research-cf-workers"
              className="font-mono text-sm"
              maxLength={60}
            />
            <FieldDescription>
              A short identifier for this specific agent. Useful when you have several of the same
              type (e.g. one researcher for "cf-workers" and another for "startups"). Lowercase
              letters, numbers, hyphens, underscores.
            </FieldDescription>
            {/* Rename is genuinely impossible — the slug is baked into
                the Durable Object id. Promote that warning out of the
                paragraph above so it can't be skimmed past. */}
            <p className="mt-1 inline-flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0 mt-px" />
              <span>
                <strong>Pick carefully — this name is permanent.</strong> It identifies your agent
                across sessions and can't be changed later.
              </span>
            </p>
            {slug && !slugValid && (
              <p className="text-xs text-destructive">
                Name must be 1–60 chars: lowercase letters, numbers, hyphens, underscores.
              </p>
            )}
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
