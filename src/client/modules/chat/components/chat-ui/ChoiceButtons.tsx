/**
 * Quick-reply choice buttons. When clicked, the choice text becomes
 * the user's next message.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ChoiceItem {
  text: string
  icon?: string
}

interface Props {
  items: Array<string | ChoiceItem>
  layout?: 'horizontal' | 'vertical' | 'grid'
  onSelect: (text: string) => void
  disabled?: boolean
}

export function ChoiceButtons({ items, layout = 'horizontal', onSelect, disabled }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const isDisabled = disabled || selected !== null

  const handleClick = (text: string) => {
    if (isDisabled) return
    setSelected(text)
    onSelect(text)
  }

  const layoutClass =
    layout === 'vertical'
      ? 'flex flex-col gap-1.5'
      : layout === 'grid'
        ? 'grid grid-cols-2 gap-1.5'
        : 'flex flex-wrap gap-1.5'

  return (
    <div className={layoutClass}>
      {items.map((item, i) => {
        const text = typeof item === 'string' ? item : item.text
        const isSelected = selected === text
        return (
          <button
            key={i}
            onClick={() => handleClick(text)}
            disabled={isDisabled}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm text-left transition-colors',
              isSelected && 'border-primary bg-primary/10 text-primary',
              !isSelected && isDisabled && 'border-border/50 text-muted-foreground/50 cursor-not-allowed',
              !isSelected && !isDisabled && 'border-border text-foreground hover:border-primary hover:bg-primary/5 cursor-pointer'
            )}
          >
            {text}
          </button>
        )
      })}
    </div>
  )
}
