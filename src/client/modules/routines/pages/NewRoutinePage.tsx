/**
 * NewRoutinePage — single-page form to create a routine.
 *
 * Sections:
 *   1. Identity      — name + description
 *   2. Agent         — pick from registered AutonomousAgent classes
 *   3. Schedule      — base interval + adjust mode
 *   4. Behaviour     — instructions + skills + tools + SessionEnd hook
 *   5. Advanced      — instance name override (auto-derived by default)
 *
 * Pickers replace the old text inputs so users never have to know an
 * agent class name, skill id, or tool id from memory. The instance
 * name is auto-derived from the routine name; users only edit it from
 * the Advanced disclosure.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link } from 'react-router-dom'
import { useCreateRoutine } from '../hooks/useRoutines'
import { AgentPicker, SkillsPicker, SingleSkillPicker, ToolsPicker } from '../components/RoutinePickers'
import { useSession } from '@/client/lib/auth'
import { useBeforeUnload } from '@/client/hooks/useBeforeUnload'
import { deriveInstanceName } from '@/shared/format/agent'
import {
  ROUTINE_TEMPLATES,
  resolveAgentName,
  type RoutineTemplate,
} from '@/shared/config/routine-templates'

const ADJUST_MODES = ['suggested', 'direct', 'fixed'] as const

/**
 * P4-001 — Persist new-routine form state to sessionStorage so a
 * sidebar click + return doesn't blow away half-typed input. Cleared
 * after a successful create. Restored on mount before the template
 * effect fires, so a user with both `?template=` AND a stored draft
 * gets the draft (their in-progress edits) over the template default.
 */
const NEW_ROUTINE_DRAFT_KEY = 'vite-flare:new-routine-draft'

interface NewRoutineDraft {
  name: string
  description: string
  agentClass: string
  instanceName: string
  instanceTouched: boolean
  intervalSeconds: number
  adjustMode: typeof ADJUST_MODES[number]
  inputText: string
  skills: string[]
  tools: string[]
  sessionEndSkill: string
  enabled: boolean
  pickedTemplate: string | null
}

function loadDraft(): NewRoutineDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(NEW_ROUTINE_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as NewRoutineDraft
  } catch {
    return null
  }
}

function clearDraft(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(NEW_ROUTINE_DRAFT_KEY)
  } catch {
    /* sessionStorage unavailable — silent no-op */
  }
}

const PRESET_INTERVALS: { label: string; seconds: number }[] = [
  { label: 'Every 15 min', seconds: 15 * 60 },
  { label: 'Hourly', seconds: 60 * 60 },
  { label: 'Every 6 hours', seconds: 6 * 60 * 60 },
  { label: 'Daily', seconds: 24 * 60 * 60 },
]

export function NewRoutinePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const create = useCreateRoutine()
  const { data: session } = useSession()
  const userId = session?.user?.id
  // One-shot pre-fill from `?template=<id>` query param. The ref guards
  // against re-application on render — once applied, the form is the
  // user's to edit.
  const templateApplied = useRef(false)
  // P4-001 — restore-from-sessionStorage runs once on mount BEFORE the
  // template effect; a stored draft means the user is mid-edit, so it
  // takes precedence over a re-applied template default.
  const initialDraft = useRef<NewRoutineDraft | null>(loadDraft())

  const [name, setName] = useState(initialDraft.current?.name ?? '')
  const [description, setDescription] = useState(initialDraft.current?.description ?? '')
  const [agentClass, setAgentClass] = useState(initialDraft.current?.agentClass ?? 'AssistantAgent')
  const [instanceName, setInstanceName] = useState(initialDraft.current?.instanceName ?? '')
  const [instanceTouched, setInstanceTouched] = useState(initialDraft.current?.instanceTouched ?? false)
  const [intervalSeconds, setIntervalSeconds] = useState<number>(initialDraft.current?.intervalSeconds ?? 60 * 60)
  const [adjustMode, setAdjustMode] = useState<typeof ADJUST_MODES[number]>(
    initialDraft.current?.adjustMode ?? 'suggested',
  )
  const [inputText, setInputText] = useState(initialDraft.current?.inputText ?? '')
  const [skills, setSkills] = useState<string[]>(initialDraft.current?.skills ?? [])
  const [tools, setTools] = useState<string[]>(initialDraft.current?.tools ?? [])
  const [sessionEndSkill, setSessionEndSkill] = useState(initialDraft.current?.sessionEndSkill ?? '')
  const [enabled, setEnabled] = useState(initialDraft.current?.enabled ?? true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // Track which template (if any) seeded the form. Lets us highlight
  // the picked card and show a "starting from {template}" hint.
  const [pickedTemplate, setPickedTemplate] = useState<string | null>(
    initialDraft.current?.pickedTemplate ?? null,
  )
  // If we restored from a draft, the template effect must skip — the
  // user's in-flight edits win over the URL's template default.
  const restoredFromDraft = useRef(initialDraft.current !== null)

  /**
   * Pre-fill the form from a template. The user can still edit
   * everything before saving — this is "templates as starting points",
   * not "templates as auto-creation". We touch instanceName so the
   * derive-from-name effect doesn't overwrite the slug back to the
   * generic one, and we mark `pickedTemplate` so the card highlights.
   */
  const applyTemplate = (tpl: RoutineTemplate) => {
    setName(tpl.name)
    setDescription(tpl.description)
    setAgentClass(tpl.agentClass)
    setIntervalSeconds(tpl.baseInterval)
    setAdjustMode(tpl.adjustMode)
    setInputText(tpl.inputText)
    setSkills(tpl.skillsLoaded)
    setTools(tpl.toolsAllowed)
    setSessionEndSkill(tpl.sessionEndSkill ?? '')
    setEnabled(tpl.defaultEnabled)
    if (userId) {
      setInstanceName(resolveAgentName(tpl, userId))
      setInstanceTouched(true)
    }
    setPickedTemplate(tpl.id)
  }

  // Apply ?template=<id> on mount — wait for userId so resolveAgentName
  // gets the suffix right. Effect fires once via the ref guard.
  useEffect(() => {
    if (templateApplied.current) return
    if (!userId) return
    // P4-001 — if we restored a draft, the user is mid-edit; don't
    // overwrite their work with template defaults even if the URL
    // still says `?template=`. Mark as applied so future renders skip.
    if (restoredFromDraft.current) {
      templateApplied.current = true
      return
    }
    const tplId = searchParams.get('template')
    if (!tplId) return
    const tpl = ROUTINE_TEMPLATES.find((t) => t.id === tplId)
    if (!tpl) return
    applyTemplate(tpl)
    templateApplied.current = true
    // applyTemplate is referentially stable in the closure; no exhaustive-deps
    // needed since we explicitly want a one-shot mount-time effect gated on userId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, searchParams])

  /**
   * P4-001 — anything-typed-or-pasted check. If true, persist the draft
   * to sessionStorage on every change, fire `useBeforeUnload`, and warn
   * before destructive in-app navigation (Cancel / back).
   */
  const isDirty =
    name.trim().length > 0 ||
    description.trim().length > 0 ||
    inputText.trim().length > 0 ||
    skills.length > 0 ||
    tools.length > 0 ||
    sessionEndSkill.trim().length > 0 ||
    pickedTemplate !== null ||
    instanceTouched

  // Persist on every meaningful change so a sidebar click + return
  // restores the in-flight form. Debouncing isn't worth the complexity
  // — sessionStorage writes are sync and small.
  useEffect(() => {
    if (!isDirty) {
      // No edits → clear any stored draft so a fresh visit starts blank.
      clearDraft()
      return
    }
    const draft: NewRoutineDraft = {
      name,
      description,
      agentClass,
      instanceName,
      instanceTouched,
      intervalSeconds,
      adjustMode,
      inputText,
      skills,
      tools,
      sessionEndSkill,
      enabled,
      pickedTemplate,
    }
    try {
      window.sessionStorage.setItem(NEW_ROUTINE_DRAFT_KEY, JSON.stringify(draft))
    } catch {
      /* sessionStorage unavailable / quota exceeded — silent no-op */
    }
  }, [
    isDirty,
    name,
    description,
    agentClass,
    instanceName,
    instanceTouched,
    intervalSeconds,
    adjustMode,
    inputText,
    skills,
    tools,
    sessionEndSkill,
    enabled,
    pickedTemplate,
  ])

  // Warn on close-tab / hard-reload while dirty.
  useBeforeUnload(isDirty)

  const startFromBlank = () => {
    setName('')
    setDescription('')
    setAgentClass('AssistantAgent')
    setIntervalSeconds(60 * 60)
    setAdjustMode('suggested')
    setInputText('')
    setSkills([])
    setTools([])
    setSessionEndSkill('')
    setEnabled(true)
    setInstanceTouched(false)
    setPickedTemplate(null)
  }

  // Auto-derive instance name from the routine name unless the user
  // has manually edited it. Stops the "what's a slug?" question.
  useEffect(() => {
    if (instanceTouched) return
    setInstanceName(deriveInstanceName(name || 'routine', userId))
  }, [name, userId, instanceTouched])

  const canSubmit = name.trim().length > 0 && agentClass.trim().length > 0 && instanceName.trim().length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || create.isPending) return
    const payload = {
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      agentClass: agentClass.trim(),
      agentName: instanceName.trim(),
      triggerKind: 'schedule' as const,
      baseInterval: intervalSeconds,
      adjustMode,
      enabled,
      ...(inputText.trim() ? { inputTemplate: { input: inputText.trim() } } : {}),
      ...(skills.length > 0 ? { skillsLoaded: skills } : {}),
      ...(tools.length > 0 ? { toolsAllowed: tools } : {}),
      ...(sessionEndSkill.trim() ? { hooks: { SessionEnd: sessionEndSkill.trim() } } : {}),
    }
    const result = await create.mutateAsync(payload)
    // P4-001 — drop the persisted draft once the routine actually exists;
    // a follow-up "New routine" should start blank.
    clearDraft()
    navigate(`/dashboard/routines/${result.id}`)
  }

  // P4-001 — Cancel discards the draft after a confirm prompt; a bare
  // navigate would leave the persisted draft and silently restore on
  // the next visit, which is surprising.
  const handleCancel = () => {
    if (isDirty) {
      const ok = window.confirm('Discard this draft routine?')
      if (!ok) return
    }
    clearDraft()
    navigate('/dashboard/routines')
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2 text-muted-foreground">
          <Link to="/dashboard/routines">
            <ArrowLeft className="size-3.5" />
            Routines
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">New routine</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A routine fires an AI agent on a schedule with the skills, tools,
          and instructions you set. Findings land in your Inbox.
        </p>
      </div>

      {/* 0. Templates — quick-start cards above the form. Picking one
          pre-fills every field below; the user reviews and saves. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Start from a template
          </CardTitle>
          <CardDescription>
            Or scroll down to fill the form yourself. Templates pre-fill
            every section — you can edit anything before creating.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ROUTINE_TEMPLATES.map((tpl) => {
              const picked = pickedTemplate === tpl.id
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className={`group relative text-left rounded-md border p-3 transition-all ${
                    picked
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                      : 'border-border hover:border-foreground/30 hover:bg-muted/40 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base leading-none">{tpl.emoji}</span>
                    <span className="text-sm font-medium">{tpl.name}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{tpl.tagline}</p>
                  {/* Affordance — touch-visible at low opacity so the card
                      reads as a button on every device, brightens on hover. */}
                  <span className={`absolute right-2 top-2 text-[10px] font-medium transition-opacity ${
                    picked
                      ? 'text-primary opacity-100'
                      : 'text-muted-foreground opacity-40 group-hover:opacity-100'
                  }`}>
                    {picked ? '✓ Selected' : 'Use this →'}
                  </span>
                </button>
              )
            })}
          </div>
          {pickedTemplate && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>Form pre-filled from template — edit anything below.</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={startFromBlank}
              >
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What's this for?</CardTitle>
            <CardDescription>Name it so future-you knows what it does.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field id="name" label="Name">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Stuck-tickets sweeper · Daily news digest"
                autoFocus
              />
            </Field>
            <Field id="description" label="Description (optional)">
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Why this exists, what it produces, who reads it."
                rows={2}
              />
            </Field>
          </CardContent>
        </Card>

        {/* 2. Agent */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Which AI agent runs this?</CardTitle>
            <CardDescription>
              Each agent has a different toolkit + persona. Pick the one that
              fits the work you're describing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AgentPicker value={agentClass} onChange={setAgentClass} />
          </CardContent>
        </Card>

        {/* 3. Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">When should it run?</CardTitle>
            <CardDescription>
              The cron sweep runs every 15 min, so intervals shorter than
              that round up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_INTERVALS.map((p) => (
                <Button
                  key={p.seconds}
                  type="button"
                  size="sm"
                  variant={intervalSeconds === p.seconds ? 'default' : 'outline'}
                  onClick={() => setIntervalSeconds(p.seconds)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {/* Custom seconds is a power-user escape hatch (e.g. "every 7
                minutes" for a stress test). Hidden behind a disclosure
                so the simple pill picker is the primary affordance — the
                seconds input is the same control as the pills, which
                read as confusing if both compete for attention. */}
            <details className="group">
              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground select-none">
                Custom interval (seconds)
              </summary>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  min={60}
                  max={86400 * 7}
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(Math.max(60, Number(e.target.value) || 60))}
                  className="w-32 font-mono"
                  aria-label="Custom interval (seconds)"
                />
                <span className="text-xs text-muted-foreground">seconds</span>
              </div>
            </details>
            <Field id="adjustMode" label="Can the agent change its own cadence?">
              <Select value={adjustMode} onValueChange={(v) => setAdjustMode(v as typeof ADJUST_MODES[number])}>
                <SelectTrigger id="adjustMode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suggested">
                    <span className="flex flex-col items-start gap-0.5">
                      <span>Suggested</span>
                      <span className="text-[11px] text-muted-foreground">Agent proposes, you review changes</span>
                    </span>
                  </SelectItem>
                  <SelectItem value="direct">
                    <span className="flex flex-col items-start gap-0.5">
                      <span>Auto-tune</span>
                      <span className="text-[11px] text-muted-foreground">Agent applies its own changes (within bounds)</span>
                    </span>
                  </SelectItem>
                  <SelectItem value="fixed">
                    <span className="flex flex-col items-start gap-0.5">
                      <span>Locked</span>
                      <span className="text-[11px] text-muted-foreground">Agent has no influence — runs on the cadence you set</span>
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>

        {/* 4. Behaviour */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What should the agent do each time it runs?</CardTitle>
            <CardDescription>
              Instructions, skills (markdown procedures), and tools the agent
              can call. All optional — leave blank for sensible defaults.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="inputText" label="Instructions">
              <Textarea
                id="inputText"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder='Tell the agent what you want each time it runs. e.g. "Each morning, summarise unread emails from the past 24 hours into 5 bullet points."'
                rows={3}
              />
            </Field>
            <Field id="skills" label="Skills">
              <SkillsPicker value={skills} onChange={setSkills} placeholder="Add skills the agent should follow…" />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Skills are markdown procedures (in /skills) — recipes the agent reads on each fire.
              </p>
            </Field>
            <Field id="tools" label="Tools the agent can use">
              <ToolsPicker value={tools} onChange={setTools} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Empty = all available tools exposed. Picking a few keeps the agent focused.
              </p>
            </Field>
            <Field id="sessionEnd" label="When the agent finishes a run, run this skill">
              <SingleSkillPicker value={sessionEndSkill} onChange={setSessionEndSkill} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Optional. The skill's output becomes the run's summary, shown in the run history.
              </p>
            </Field>
            <div className="flex items-center gap-2 pt-2">
              <input
                id="enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4"
              />
              <Label htmlFor="enabled" className="cursor-pointer">
                Start running on the schedule now
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* 5. Advanced (collapsed by default) */}
        <Card>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center justify-between p-4 text-sm font-medium hover:bg-muted/30 rounded-lg transition-colors"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {advancedOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              Advanced — instance ID
            </span>
            <span className="font-mono text-[11px] text-muted-foreground truncate">{instanceName || '(auto)'}</span>
          </button>
          {advancedOpen && (
            <CardContent className="pt-0 space-y-2">
              <Field id="instanceName" label="Instance ID (slug)">
                <Input
                  id="instanceName"
                  value={instanceName}
                  onChange={(e) => {
                    setInstanceName(e.target.value)
                    setInstanceTouched(true)
                  }}
                  className="font-mono"
                />
              </Field>
              <p className="text-[11px] text-muted-foreground">
                Stable identifier for this routine's data. Auto-derived from
                the name; only edit if you know what you're doing.
              </p>
            </CardContent>
          )}
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || create.isPending}>
            {create.isPending ? (
              <>
                <Spinner size="xs" />
                Creating…
              </>
            ) : (
              'Create routine'
            )}
          </Button>
        </div>

        {create.isError && (
          <p className="text-xs text-destructive">
            {(create.error as Error)?.message ?? 'Failed to create routine'}
          </p>
        )}
      </form>
    </div>
  )
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

export default NewRoutinePage
