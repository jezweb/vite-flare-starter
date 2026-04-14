/**
 * TagBadge — coloured pill displaying a tag label
 */
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  name: string
  colour: string
  onRemove?: () => void
  className?: string
}

export function TagBadge({ name, colour, onRemove, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        className
      )}
      style={{
        backgroundColor: `${colour}20`,
        color: colour,
        borderColor: `${colour}40`,
        borderWidth: 1,
      }}
    >
      {name}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70 -mr-0.5">
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}
