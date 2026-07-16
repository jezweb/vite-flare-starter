import * as React from 'react'

import { cn } from '@/lib/utils'

// Base UI has no standalone Label primitive (Field.Label exists only inside
// Field.Root). Radix Label's sole behavioral extra — preventing text
// selection on double click — is covered by the existing `select-none`.
// `peer-data-disabled:*` variants sit alongside `peer-disabled:*` because
// Base UI checkbox/switch/radio render <span>s that surface disabled state
// as `data-disabled` instead of the :disabled pseudo-class.
function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Label }
