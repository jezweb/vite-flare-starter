/**
 * SkillsSlashMenu — typeahead picker that appears when the user types `/`
 * at the start of the chat input. Arrow keys navigate, Enter/Tab selects,
 * Esc dismisses. Listed skills come from `useSkillSummary`.
 */
import { useMemo, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useSkillSummary, type SkillSummary } from '@/client/modules/skills/hooks/useSkills'
import { formatSkillName } from '@/shared/format/skill'

interface SkillsSlashMenuProps {
  /** The text currently in the input. Menu shows when this starts with `/`. */
  input: string
  /** Active highlight index (managed by parent to allow keyboard nav). */
  activeIndex: number
  setActiveIndex: (i: number) => void
  /** Called when the user selects a skill (by click or keyboard). */
  onSelect: (skill: SkillSummary) => void
  /** Optional className for the wrapper. */
  className?: string
}

/**
 * Parse an input like `/web-res foo bar` into a query (`web-res`) plus any
 * trailing text (`foo bar`). Only triggers when input starts with `/`.
 */
export function parseSlashQuery(input: string): { query: string; rest: string } | null {
  if (!input.startsWith('/')) return null
  const firstSpace = input.indexOf(' ')
  if (firstSpace === -1) {
    return { query: input.slice(1), rest: '' }
  }
  return { query: input.slice(1, firstSpace), rest: input.slice(firstSpace + 1) }
}

export function SkillsSlashMenu({
  input,
  activeIndex,
  setActiveIndex,
  onSelect,
  className,
}: SkillsSlashMenuProps) {
  const { data } = useSkillSummary()
  const parsed = parseSlashQuery(input)

  const filtered = useMemo<SkillSummary[]>(() => {
    if (!parsed || !data) return []
    const q = parsed.query.toLowerCase()
    if (!q) return data.skills.slice(0, 8)
    return data.skills
      .filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      .slice(0, 8)
  }, [parsed, data])

  // Clamp activeIndex when the list shrinks
  useEffect(() => {
    if (activeIndex >= filtered.length && filtered.length > 0) {
      setActiveIndex(0)
    }
  }, [filtered.length, activeIndex, setActiveIndex])

  if (!parsed || filtered.length === 0) return null

  return (
    <div
      className={cn(
        'absolute bottom-full left-0 right-0 mb-2 mx-4 max-h-[300px] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md z-20',
        className,
      )}
      role="listbox"
    >
      <div className="px-3 py-2 text-xs text-muted-foreground border-b">
        Skills — Enter or Tab to insert, Esc to dismiss
      </div>
      {filtered.map((skill, i) => (
        <button
          key={skill.name}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          onClick={() => onSelect(skill)}
          onMouseEnter={() => setActiveIndex(i)}
          className={cn(
            'w-full text-left px-3 py-2 border-b last:border-b-0 cursor-pointer focus:outline-none',
            i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
          )}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{formatSkillName(skill.name)}</span>
            <span className="text-[10px] font-mono text-muted-foreground/70">
              /{skill.name}
            </span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {skill.source}
            </span>
          </div>
          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {skill.description}
          </div>
        </button>
      ))}
    </div>
  )
}

export default SkillsSlashMenu
