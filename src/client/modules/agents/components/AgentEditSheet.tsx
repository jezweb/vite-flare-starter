/**
 * AgentEditSheet — slide-in side panel to edit one agent instance.
 *
 * Editable fields: persona, modelId, dailyBudgetUsd. State updates
 * persist via PATCH /api/agent-instances/:class/:name and the agent
 * is "owned" on first edit (idempotent setOwner).
 *
 * Shape mirrors the spaces SpaceSettingsModal (Sheet for edit-in-place).
 */
import { useEffect, useState } from 'react'
import { Bot, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  NativeSelect,
  NativeSelectOption,
  NativeSelectOptGroup,
} from '@/components/ui/native-select'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { formatRelative } from '@/client/lib/format-time'
import { WORKERS_AI_MODELS, OPENROUTER_MODELS } from '@/shared/config/models'
import { useAgentInstance, useUpdateAgentInstance } from '../hooks/useAgentInstances'
import { useAgentCatalog } from '@/client/modules/routines/hooks/useAgentCatalog'
import { formatAgentClass, formatModelId } from '@/shared/format/agent'
import { useMemo } from 'react'
import { useBuilderMode } from '@/client/lib/builder-mode'

interface Props {
  agentClass: string | null
  agentName: string | null
  open: boolean
  onClose: () => void
}

export function AgentEditSheet({ agentClass, agentName, open, onClose }: Props) {
  const { data, isLoading, error } = useAgentInstance(agentClass, agentName)
  const update = useUpdateAgentInstance(agentClass ?? '', agentName ?? '')
  const { data: catalog } = useAgentCatalog()
  const agentRegistry = useMemo(
    () => new Map((catalog?.agents ?? []).map((a) => [a.className, a])),
    [catalog]
  )
  const friendlyClass = agentClass ? formatAgentClass(agentClass, agentRegistry) : ''
  // Hide the slug when it equals the class name — that means it's the
  // default seed instance (e.g. agentName === 'AutonomousAgent') rather
  // than a user-chosen slug. Also hide non-slug-shaped values; only show
  // when the user gave us a real slug.
  const showSlug = agentName ? /^[a-z][a-z0-9-]*$/.test(agentName) : false
  const { isBuilder } = useBuilderMode()

  const [persona, setPersona] = useState('')
  const [modelId, setModelId] = useState('')
  const [budgetText, setBudgetText] = useState('')

  // Sync local state when the loaded agent changes — only when the
  // detail actually loads (data?.state) so we don't blow away in-flight
  // edits the user is making while a refetch lands.
  useEffect(() => {
    if (data?.state && open) {
      setPersona(data.state.persona)
      setModelId(data.state.modelId)
      setBudgetText(data.state.dailyBudgetUsd != null ? String(data.state.dailyBudgetUsd) : '')
    }
  }, [data?.state, agentClass, agentName, open])

  const submit = async () => {
    if (!agentClass || !agentName) return
    const patch: Parameters<typeof update.mutateAsync>[0] = {}
    const initial = data?.state
    if (initial?.persona !== persona) patch.persona = persona
    if (initial?.modelId !== modelId) patch.modelId = modelId
    const budgetVal = budgetText.trim() === '' ? null : Number(budgetText)
    if (budgetText.trim() !== '' && (isNaN(budgetVal!) || budgetVal! <= 0)) {
      toast.error('Daily budget must be a positive number or blank')
      return
    }
    if ((initial?.dailyBudgetUsd ?? null) !== budgetVal) {
      patch.dailyBudgetUsd = budgetVal
    }
    if (Object.keys(patch).length === 0) {
      toast.info('No changes to save')
      return
    }
    try {
      await update.mutateAsync(patch)
      toast.success('Agent updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <span title={`${agentClass} · ${agentName}`}>{friendlyClass}</span>
            {showSlug && (
              <span className="font-mono text-sm text-muted-foreground">/{agentName}</span>
            )}
          </SheetTitle>
          <SheetDescription>
            {data?.metadata?.description ?? "Edit this agent's persona, model, and daily budget."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner size="lg" className="text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{(error as Error).message}</span>
            </div>
          ) : (
            <>
              {data?.state && (
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded border bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground" title="Invocations">
                      Times run
                    </p>
                    <p className="font-mono tabular-nums">{data.state.invocations}</p>
                  </div>
                  <div className="rounded border bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground">Last active</p>
                    <p className="font-mono tabular-nums">
                      {data.state.lastActiveAt
                        ? formatRelative(new Date(data.state.lastActiveAt * 1000).toISOString())
                        : 'never'}
                    </p>
                  </div>
                  <div className="rounded border bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground" title="Memory blocks">
                      Saved memories
                    </p>
                    <p className="font-mono tabular-nums">{data.state.blockCount}</p>
                  </div>
                  <div className="rounded border bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground" title="History rows">
                      Past messages
                    </p>
                    <p className="font-mono tabular-nums">{data.state.historyCount}</p>
                  </div>
                </div>
              )}

              <Field>
                <FieldLabel htmlFor="agent-model">Model</FieldLabel>
                <NativeSelect
                  id="agent-model"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="text-xs w-full"
                  title={modelId}
                >
                  {/* Allow the current value even if it's not in our enabled
                      list — covers older agents whose modelId predates a
                      catalogue trim, and custom models users have set via
                      the API. We render it as the first option so the
                      select reflects the live state. */}
                  {modelId &&
                    !([...WORKERS_AI_MODELS, ...OPENROUTER_MODELS] as readonly string[]).includes(
                      modelId
                    ) && (
                      <NativeSelectOption value={modelId}>
                        {formatModelId(modelId)} (custom)
                      </NativeSelectOption>
                    )}
                  <NativeSelectOptGroup label="Workers AI (free)">
                    {WORKERS_AI_MODELS.map((m) => (
                      <NativeSelectOption key={m} value={m}>
                        {formatModelId(m)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelectOptGroup>
                  <NativeSelectOptGroup label="OpenRouter">
                    {OPENROUTER_MODELS.map((m) => (
                      <NativeSelectOption key={m} value={m}>
                        {formatModelId(m)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelectOptGroup>
                </NativeSelect>
                <FieldDescription>
                  {isBuilder ? (
                    <>
                      Pick from the curated list, or paste a custom id via the API. See{' '}
                      <a href="https://models.flared.au" target="_blank" rel="noopener noreferrer">
                        models.flared.au
                      </a>{' '}
                      for the catalogue.
                    </>
                  ) : (
                    <>Pick the AI model that handles requests. Free options work out of the box.</>
                  )}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="agent-budget">Daily budget (USD)</FieldLabel>
                <Input
                  id="agent-budget"
                  type="number"
                  step="0.01"
                  min="0"
                  value={budgetText}
                  onChange={(e) => setBudgetText(e.target.value)}
                  placeholder="leave blank for no cap"
                />
                <FieldDescription>
                  Rolling 24-hour spend cap. Agent stops + logs at 80%. Blank = no cap.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="agent-persona">Persona (system prompt)</FieldLabel>
                <Textarea
                  id="agent-persona"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  rows={14}
                  className="font-mono text-xs md:text-xs"
                />
                <FieldDescription>
                  Replaces the agent's identity prompt. Persists in DO storage. Edits take effect on
                  the agent's next turn.
                </FieldDescription>
              </Field>
            </>
          )}
        </div>

        <SheetFooter className="border-t">
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isLoading || update.isPending}>
            {update.isPending ? <Spinner size="sm" className="mr-1.5" /> : null}
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
