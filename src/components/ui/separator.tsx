import * as React from 'react'
import { Separator as SeparatorPrimitive } from '@base-ui/react/separator'

import { cn } from '@/lib/utils'

// Base UI's Separator is always semantic (role="separator"); the radix
// `decorative` prop has no equivalent and was dropped.
function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive>) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className
      )}
      {...props}
    />
  )
}

export { Separator }
