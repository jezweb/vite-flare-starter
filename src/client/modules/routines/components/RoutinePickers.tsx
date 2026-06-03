/**
 * Routine setup pickers — Agent / Skills / Tools / Hook.
 *
 * Replaces the raw text inputs in NewRoutinePage. Each picker pulls
 * its options from a discovery endpoint so the user never has to
 * type a class name / skill id / tool id from memory.
 */
import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import {
  useAgentCatalog,
  useToolsCatalog,
  type RegisteredAgent,
  type CatalogTool,
} from '../hooks/useAgentCatalog'
import { useSkillSummary, type SkillSummary } from '@/client/modules/skills/hooks/useSkills'
import { formatSkillName } from '@/shared/format/skill'
import { cn } from '@/lib/utils'

// ─── Agent picker ─────────────────────────────────────────────────────

interface AgentPickerProps {
  value: string
  onChange: (className: string) => void
}

export function AgentPicker({ value, onChange }: AgentPickerProps) {
  const { data, isLoading } = useAgentCatalog()
  const [open, setOpen] = useState(false)
  const agents = data?.agents ?? []
  const selected = agents.find((a) => a.className === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="text-muted-foreground inline-flex items-center gap-2">
              <Spinner size="sm" /> Loading…
            </span>
          ) : selected ? (
            <span className="flex flex-col items-start text-left min-w-0">
              <span className="truncate">{selected.displayName}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {selected.description}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Pick an agent…</span>
          )}
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <ul className="max-h-80 overflow-auto p-1">
          {agents.map((a) => (
            <AgentOption
              key={a.className}
              agent={a}
              active={a.className === value}
              onPick={() => {
                onChange(a.className)
                setOpen(false)
              }}
            />
          ))}
          {agents.length === 0 && (
            <li className="p-3 text-xs text-muted-foreground">
              No registered agents found. Add a `static metadata` field to your AutonomousAgent
              subclass.
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function AgentOption({
  agent,
  active,
  onPick,
}: {
  agent: RegisteredAgent
  active: boolean
  onPick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          'w-full text-left rounded-md px-2 py-2 hover:bg-muted transition-colors flex items-start gap-2',
          active && 'bg-muted'
        )}
      >
        <Check
          className={cn('mt-0.5 size-4 shrink-0', active ? 'text-primary' : 'text-transparent')}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{agent.displayName}</span>
          <span className="block text-[11px] text-muted-foreground">{agent.description}</span>
        </span>
      </button>
    </li>
  )
}

// ─── Skills picker (multi-select) ─────────────────────────────────────

interface SkillsPickerProps {
  value: string[]
  onChange: (names: string[]) => void
  placeholder?: string
}

export function SkillsPicker({ value, onChange, placeholder = 'Pick skills…' }: SkillsPickerProps) {
  const { data, isLoading } = useSkillSummary()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const skills = data?.skills ?? []
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return skills
    return skills.filter(
      (s: SkillSummary) =>
        s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    )
  }, [skills, filter])

  const toggle = (name: string) => {
    if (value.includes(name)) onChange(value.filter((n) => n !== name))
    else onChange([...value, name])
  }

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            disabled={isLoading}
          >
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              <span>
                {value.length} skill{value.length === 1 ? '' : 's'} selected
              </span>
            )}
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search skills…"
                className="pl-7 h-8 text-sm"
              />
            </div>
          </div>
          <ul className="max-h-80 overflow-auto p-1">
            {visible.map((s: SkillSummary) => (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => toggle(s.name)}
                  className={cn(
                    'w-full text-left rounded-md px-2 py-2 hover:bg-muted transition-colors flex items-start gap-2',
                    value.includes(s.name) && 'bg-muted'
                  )}
                >
                  <Check
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      value.includes(s.name) ? 'text-primary' : 'text-transparent'
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-sm font-medium truncate">
                        {formatSkillName(s.name)}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                        /{s.name}
                      </span>
                    </span>
                    <span className="block text-[11px] text-muted-foreground line-clamp-2">
                      {s.description}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="p-3 text-xs text-muted-foreground">No skills match.</li>
            )}
          </ul>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((name) => (
            <Badge
              key={name}
              variant="outline"
              className="text-[11px] cursor-pointer hover:bg-destructive/10 hover:border-destructive/40"
              onClick={() => onChange(value.filter((n) => n !== name))}
              title="Click to remove"
            >
              {formatSkillName(name)} ×
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Single-skill picker (for SessionEnd hook) ────────────────────────

interface SingleSkillPickerProps {
  value: string
  onChange: (name: string) => void
}

export function SingleSkillPicker({ value, onChange }: SingleSkillPickerProps) {
  const { data, isLoading } = useSkillSummary()
  const [open, setOpen] = useState(false)
  const skills = data?.skills ?? []
  const selected = skills.find((s: SkillSummary) => s.name === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          disabled={isLoading}
        >
          {selected ? (
            <span className="flex items-baseline gap-1.5 truncate">
              <span className="truncate">{formatSkillName(selected.name)}</span>
              <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                /{selected.name}
              </span>
            </span>
          ) : value ? (
            <span className="font-mono truncate">{value}</span>
          ) : (
            <span className="text-muted-foreground">None — skip this hook</span>
          )}
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <ul className="max-h-80 overflow-auto p-1">
          <li>
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className={cn(
                'w-full text-left rounded-md px-2 py-2 hover:bg-muted text-sm',
                !value && 'bg-muted'
              )}
            >
              <span className="text-muted-foreground italic">None — skip this hook</span>
            </button>
          </li>
          {skills.map((s: SkillSummary) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => {
                  onChange(s.name)
                  setOpen(false)
                }}
                className={cn(
                  'w-full text-left rounded-md px-2 py-2 hover:bg-muted flex items-start gap-2',
                  s.name === value && 'bg-muted'
                )}
              >
                <Check
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    s.name === value ? 'text-primary' : 'text-transparent'
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-sm font-medium truncate">{formatSkillName(s.name)}</span>
                    <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                      /{s.name}
                    </span>
                  </span>
                  <span className="block text-[11px] text-muted-foreground line-clamp-1">
                    {s.description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

// ─── Tools picker (multi-select, grouped by category) ────────────────

interface ToolsPickerProps {
  value: string[]
  onChange: (names: string[]) => void
}

export function ToolsPicker({ value, onChange }: ToolsPickerProps) {
  const { data, isLoading } = useToolsCatalog()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const tools = data?.tools ?? []

  // Filter + group by category
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const filtered = q
      ? tools.filter(
          (t: CatalogTool) =>
            t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
        )
      : tools
    const byCategory = new Map<string, CatalogTool[]>()
    for (const t of filtered) {
      const arr = byCategory.get(t.category) ?? []
      arr.push(t)
      byCategory.set(t.category, arr)
    }
    return [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [tools, filter])

  const toggle = (name: string) => {
    if (value.includes(name)) onChange(value.filter((n) => n !== name))
    else onChange([...value, name])
  }

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            disabled={isLoading}
          >
            {value.length === 0 ? (
              <span className="text-muted-foreground">All tools available — click to restrict</span>
            ) : (
              <span>
                {value.length} tool{value.length === 1 ? '' : 's'} allowed
              </span>
            )}
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] max-w-2xl p-0"
          align="start"
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search tools…"
                className="pl-7 h-8 text-sm"
              />
            </div>
          </div>
          <div className="max-h-96 overflow-auto p-1">
            {groups.map(([category, list]) => (
              <div key={category} className="py-1">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold sticky top-0 bg-popover">
                  {category}
                </div>
                <ul>
                  {list.map((t) => (
                    <li key={t.name}>
                      <button
                        type="button"
                        onClick={() => toggle(t.name)}
                        className={cn(
                          'w-full text-left rounded-md px-2 py-1.5 hover:bg-muted transition-colors flex items-start gap-2',
                          value.includes(t.name) && 'bg-muted'
                        )}
                      >
                        <Check
                          className={cn(
                            'mt-0.5 size-3.5 shrink-0',
                            value.includes(t.name) ? 'text-primary' : 'text-transparent'
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-mono">{t.name}</span>
                          <span className="block text-[11px] text-muted-foreground line-clamp-1">
                            {t.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {groups.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">No tools match.</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((name) => (
            <Badge
              key={name}
              variant="outline"
              className="font-mono text-[11px] cursor-pointer hover:bg-destructive/10 hover:border-destructive/40"
              onClick={() => onChange(value.filter((n) => n !== name))}
              title="Click to remove"
            >
              {name} ×
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
