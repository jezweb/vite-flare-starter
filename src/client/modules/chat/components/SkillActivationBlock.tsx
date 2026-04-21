/**
 * SkillActivationBlock — renders a `<skill_content …>` user message as a
 * compact pill instead of the raw skill body. Users see `/skill-name`
 * (collapsed), their actual question, and can click the pill to expand
 * the skill body if they want to see what the model saw.
 *
 * Parsing is lenient: if the markers don't match, we fall back to rendering
 * the text as-is so nothing ever disappears.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { MessageResponse } from '@/components/ai-elements/message'
import { cn } from '@/lib/utils'

interface SkillActivationBlockProps {
  skillName: string
  skillBody: string
  userText: string
}

/**
 * Detect and parse a `<skill_content name="…" …>…</skill_content>` wrapper
 * at the start of a text part. Returns null if no wrapper is found.
 */
export function parseSkillActivation(text: string): SkillActivationBlockProps | null {
  if (!text.startsWith('<skill_content')) return null
  const openMatch = text.match(/^<skill_content\s+name="([a-z0-9-]+)"[^>]*>\n?/)
  if (!openMatch) return null
  const closeIdx = text.indexOf('</skill_content>')
  if (closeIdx === -1) return null
  const body = text.slice(openMatch[0].length, closeIdx).trim()
  const rest = text.slice(closeIdx + '</skill_content>'.length).trim()
  return {
    skillName: openMatch[1]!,
    skillBody: body,
    userText: rest,
  }
}

export function SkillActivationBlock({ skillName, skillBody, userText }: SkillActivationBlockProps) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 self-start rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          expanded && 'bg-muted text-foreground',
        )}
        aria-expanded={expanded}
        aria-label={expanded ? 'Hide skill instructions' : 'Show skill instructions'}
      >
        <Zap className="size-3" />
        <span className="font-mono">/{skillName}</span>
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      </button>

      {expanded && (
        <div className="rounded-md border border-dashed bg-muted/20 p-3 text-xs">
          <p className="mb-2 font-medium text-muted-foreground">
            Skill instructions sent to the model:
          </p>
          <pre className="whitespace-pre-wrap font-mono leading-relaxed text-muted-foreground">
            {skillBody}
          </pre>
        </div>
      )}

      {userText && <MessageResponse>{userText}</MessageResponse>}
    </div>
  )
}

export default SkillActivationBlock
