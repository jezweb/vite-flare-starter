import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg'

const sizeClasses: Record<SpinnerSize, string> = {
  xs: 'size-3',     // inside compact rows
  sm: 'size-3.5',   // inside buttons + most metadata strips (default)
  md: 'size-4',     // page-level body loaders
  lg: 'size-5',     // page-blocking / hero
}

interface SpinnerProps extends React.ComponentProps<'svg'> {
  size?: SpinnerSize
}

/**
 * Spinner — the canonical loading indicator.
 *
 * Replaces hand-rolled `<Loader2 className="animate-spin" />` everywhere.
 * Pick the size that matches your context:
 *
 *   sm — inside buttons / metadata strips (default)
 *   md — page-level body loaders (replaced by `<PageLoading>` in most cases)
 *   lg — page-blocking / hero
 *   xs — extra-compact (table cells, inline status)
 *
 * Always announces itself as `role="status"` with an `aria-label`. Override
 * the label when the surrounding context isn't enough — e.g. `<Spinner
 * aria-label="Searching" />` on an autocomplete.
 */
function Spinner({ className, size = 'sm', ...props }: SpinnerProps) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn(sizeClasses[size], 'animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
