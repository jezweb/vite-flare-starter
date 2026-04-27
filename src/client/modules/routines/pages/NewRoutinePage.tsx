/**
 * NewRoutinePage — single-page form to create a routine.
 *
 * Sections:
 *   1. Identity      — name + description
 *   2. Target agent  — agent class + instance name
 *   3. Schedule      — base interval + min/max + adjust mode
 *   4. Behaviour     — input template, skills, hooks, tools allow-list
 *
 * Slice 6 is intentionally a single page (not a multi-step wizard) so
 * fork-users can read all fields at once. The form scales with
 * collapsible advanced sections when the field set grows.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
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

const ADJUST_MODES = ['suggested', 'direct', 'fixed'] as const

const PRESET_INTERVALS: { label: string; seconds: number }[] = [
  { label: 'Every 15 min', seconds: 15 * 60 },
  { label: 'Every hour', seconds: 60 * 60 },
  { label: 'Every 6 hours', seconds: 6 * 60 * 60 },
  { label: 'Daily', seconds: 24 * 60 * 60 },
]

export function NewRoutinePage() {
  const navigate = useNavigate()
  const create = useCreateRoutine()

  // Form state — kept small + flat. Advanced fields go into collapsible
  // disclosures at the bottom.
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [agentClass, setAgentClass] = useState('AssistantAgent')
  const [agentName, setAgentName] = useState('')
  const [intervalSeconds, setIntervalSeconds] = useState<number>(60 * 60) // 1h
  const [adjustMode, setAdjustMode] = useState<typeof ADJUST_MODES[number]>('suggested')
  const [inputText, setInputText] = useState('')
  const [skillsCsv, setSkillsCsv] = useState('')
  const [toolsCsv, setToolsCsv] = useState('')
  const [sessionEndSkill, setSessionEndSkill] = useState('')
  const [enabled, setEnabled] = useState(true)

  const canSubmit = name.trim().length > 0 && agentClass.trim().length > 0 && agentName.trim().length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || create.isPending) return
    const payload = {
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      agentClass: agentClass.trim(),
      agentName: agentName.trim(),
      triggerKind: 'schedule' as const,
      baseInterval: intervalSeconds,
      adjustMode,
      enabled,
      ...(inputText.trim() ? { inputTemplate: { input: inputText.trim() } } : {}),
      ...(parseList(skillsCsv).length ? { skillsLoaded: parseList(skillsCsv) } : {}),
      ...(parseList(toolsCsv).length ? { toolsAllowed: parseList(toolsCsv) } : {}),
      ...(sessionEndSkill.trim() ? { hooks: { SessionEnd: sessionEndSkill.trim() } } : {}),
    }
    const result = await create.mutateAsync(payload)
    navigate(`/dashboard/routines/${result.id}`)
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2 text-muted-foreground">
          <Link to="/dashboard/routines">
            <ArrowLeft className="size-3.5" />
            Routines
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">New routine</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A routine fires its target agent on a schedule with a fixed tool
          allow-list and skills. Findings land in your Inbox.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
            <CardDescription>What is this routine for?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field id="name" label="Name">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Stuck-tickets sweeper"
                autoFocus
              />
            </Field>
            <Field id="description" label="Description (optional)">
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One paragraph: why this exists, what it does, what it produces."
                rows={3}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Target agent</CardTitle>
            <CardDescription>
              Which DO does this routine fire? <span className="font-mono">agentClass</span> must match a wrangler binding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="agentClass" label="Agent class">
                <Input
                  id="agentClass"
                  value={agentClass}
                  onChange={(e) => setAgentClass(e.target.value)}
                  placeholder="AssistantAgent"
                  className="font-mono"
                />
              </Field>
              <Field id="agentName" label="Instance name">
                <Input
                  id="agentName"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. nightly-sweeper"
                  className="font-mono"
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule</CardTitle>
            <CardDescription>
              How often should this fire? The cron sweep runs every 15 min, so
              intervals shorter than that round up.
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
                aria-label="Interval seconds"
              />
              <span className="text-xs text-muted-foreground">seconds</span>
            </div>
            <Field id="adjustMode" label="Cadence self-adjust">
              <Select value={adjustMode} onValueChange={(v) => setAdjustMode(v as typeof ADJUST_MODES[number])}>
                <SelectTrigger id="adjustMode" className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suggested">
                    Suggested — agent proposes, you review
                  </SelectItem>
                  <SelectItem value="direct">
                    Direct — agent applies its own changes (clamped)
                  </SelectItem>
                  <SelectItem value="fixed">
                    Fixed — agent has no influence
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Behaviour</CardTitle>
            <CardDescription>
              The agent's instructions for each fire — input template, skills,
              tools, and hooks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field id="inputText" label="Input template">
              <Textarea
                id="inputText"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder='What to tell the agent each fire. e.g. "Check the entities table for stuck items and emit findings via inbox_add."'
                rows={3}
              />
            </Field>
            <Field id="skillsCsv" label="Skills loaded (comma-separated names)">
              <Input
                id="skillsCsv"
                value={skillsCsv}
                onChange={(e) => setSkillsCsv(e.target.value)}
                placeholder="route-finding, score-importance"
                className="font-mono"
              />
            </Field>
            <Field id="toolsCsv" label="Tools allowed (comma-separated)">
              <Input
                id="toolsCsv"
                value={toolsCsv}
                onChange={(e) => setToolsCsv(e.target.value)}
                placeholder="inbox_add, notify, gmail_search"
                className="font-mono"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Empty = all available tools exposed. List names to restrict.
              </p>
            </Field>
            <Field id="sessionEnd" label="SessionEnd hook (skill name, optional)">
              <Input
                id="sessionEnd"
                value={sessionEndSkill}
                onChange={(e) => setSessionEndSkill(e.target.value)}
                placeholder="route-finding"
                className="font-mono"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Runs after the main loop. Output becomes the run summary.
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
                Enabled — fire on the schedule starting now
              </Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/dashboard/routines')}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || create.isPending}>
            {create.isPending ? (
              <>
                <Loader2 className="size-3 animate-spin" />
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

function parseList(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default NewRoutinePage
