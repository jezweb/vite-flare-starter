/**
 * ActionChips — claude.ai-style chip row with preset prompt expansion.
 *
 * Shows a row of labelled chips (Write, Research, Code, Plan). Clicking a
 * chip opens an inline list of preset prompts. Clicking a preset calls
 * onPick(promptText) so the parent can either insert the text into the
 * input (preferred — user can edit) or send it immediately.
 */
import { useState } from 'react'
import { X } from 'lucide-react'
import { CHAT_CHIPS, type ChatChip } from '@/shared/config/chat-chips'
import { cn } from '@/lib/utils'

interface Props {
  /** Called with the preset prompt text when the user picks one */
  onPick: (text: string) => void
  /** Called when the user hovers a preset — receives preview text, or null when
   *  the user leaves without clicking. Parent should show the preview in the
   *  textarea (remembering the prior value) and restore it on null. */
  onPreview?: (text: string | null) => void
  className?: string
}

export function ActionChips({ onPick, onPreview, className }: Props) {
  const [expanded, setExpanded] = useState<ChatChip | null>(null)

  if (CHAT_CHIPS.length === 0) return null

  return (
    <div className={cn('w-full max-w-2xl mx-auto', className)}>
      {/* Chip row */}
      <div className="flex flex-wrap justify-center gap-2">
        {CHAT_CHIPS.map((chip) => {
          const isActive = expanded?.label === chip.label
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => setExpanded(isActive ? null : chip)}
              className={cn(
                // Text-only chip (claude.ai convention). Icons are kept on the
                // expanded preset panel header instead, where they provide
                // useful context without competing with short chip labels.
                'inline-flex items-center rounded-full border px-4 py-1.5 text-sm transition-colors',
                isActive
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Expanded presets */}
      {expanded && (
        <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <expanded.icon className="size-3.5" />
              {expanded.label}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(null)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <ul className="divide-y divide-border/50">
            {expanded.presets.map((preset) => (
              <li key={preset.label}>
                <button
                  type="button"
                  onClick={() => {
                    onPreview?.(null)
                    onPick(preset.prompt)
                    setExpanded(null)
                  }}
                  onMouseEnter={() => onPreview?.(preset.prompt)}
                  onMouseLeave={() => onPreview?.(null)}
                  onFocus={() => onPreview?.(preset.prompt)}
                  onBlur={() => onPreview?.(null)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
                >
                  {preset.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
