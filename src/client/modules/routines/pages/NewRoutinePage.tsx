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
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
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
import { deriveInstanceName } from '@/shared/format/agent'

const ADJUST_MODES = ['suggested', 'direct', 'fixed'] as const

const PRESET_INTERVALS: { label: string; seconds: number }[] = [
  { label: 'Every 15 min', seconds: 15 * 60 },
  { label: 'Hourly', seconds: 60 * 60 },
  { label: 'Every 6 hours', seconds: 6 * 60 * 60 },
  { label: 'Daily', seconds: 24 * 60 * 60 },
]

export function NewRoutinePage() {
  const navigate = useNavigate()
  const create = useCreateRoutine()
  const { data: session } = useSession()
  const userId = session?.user?.id

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [agentClass, setAgentClass] = useState('AssistantAgent')
  const [instanceName, setInstanceName] = useState('')
  const [instanceTouched, setInstanceTouched] = useState(false)
  const [intervalSeconds, setIntervalSeconds] = useState<number>(60 * 60)
  const [adjustMode, setAdjustMode] = useState<typeof ADJUST_MODES[number]>('suggested')
  const [inputText, setInputText] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [tools, setTools] = useState<string[]>([])
  const [sessionEndSkill, setSessionEndSkill] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)

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
    navigate(`/dashboard/routines/${result.id}`)
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
            <CardTitle className="text-base">What should the agent do each fire?</CardTitle>
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
                placeholder='What to tell the agent each fire. e.g. "Look at the entities table for stuck items and emit findings via inbox_add."'
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
          <Button type="button" variant="ghost" onClick={() => navigate('/dashboard/routines')}>
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
