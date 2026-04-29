/**
 * SearchInput — icon + input + optional clear, in one component.
 *
 * The CSS recipe `relative` + `absolute left-3 top-1/2 -translate-y-1/2`
 * + `<Input className="pl-9">` was repeated 9 times across the
 * codebase with subtle drift (icon size 3.5 vs 4, padding pl-7 vs
 * pl-9, opacity variants). This primitive collapses them all.
 *
 *   <SearchInput value={search} onChange={setSearch} placeholder="Search projects…" />
 *   <SearchInput ... size="sm" />                   // h-7 height for compact rows
 *   <SearchInput ... showClearButton />             // adds × when value is non-empty
 *
 * Default size is `md` (matches the standard Input height). Use `sm`
 * for filter rows / sidebars where vertical space is tight.
 */
import * as React from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SearchInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'size' | 'value' | 'onChange' | 'type'> {
  value: string
  onChange: (next: string) => void
  /** `md` (default) matches the standard Input height. `sm` is h-7 for compact rows. */
  size?: 'sm' | 'md'
  /** Render an × button to clear the value when non-empty. */
  showClearButton?: boolean
}

export function SearchInput({
  value,
  onChange,
  size = 'md',
  showClearButton = false,
  placeholder = 'Search…',
  className,
  ...rest
}: SearchInputProps) {
  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'
  const inputClass =
    size === 'sm'
      ? 'h-7 pl-7 pr-7 text-xs'
      : 'pl-9 pr-9'

  return (
    <div data-slot="search-input" className={cn('relative', className)}>
      <Search
        aria-hidden="true"
        className={cn(
          'absolute top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none',
          iconSize,
          size === 'sm' ? 'left-2.5' : 'left-3',
        )}
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
        {...rest}
      />
      {showClearButton && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className={cn(
            'absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors',
            iconSize,
            size === 'sm' ? 'right-2.5' : 'right-3',
          )}
        >
          <X />
        </button>
      )}
    </div>
  )
}

SearchInput.displayName = 'SearchInput'
