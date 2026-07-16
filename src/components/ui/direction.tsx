'use client'

import * as React from 'react'
import {
  DirectionProvider as DirectionProviderPrimitive,
  useDirection,
} from '@base-ui/react/direction-provider'

// Base UI's Direction Provider takes `direction` (radix took `dir`). This
// wrapper keeps accepting both spellings for call-site compatibility.
function DirectionProvider({
  dir,
  direction,
  children,
}: Omit<React.ComponentProps<typeof DirectionProviderPrimitive>, 'direction'> & {
  dir?: React.ComponentProps<typeof DirectionProviderPrimitive>['direction']
  direction?: React.ComponentProps<typeof DirectionProviderPrimitive>['direction']
}) {
  return (
    <DirectionProviderPrimitive direction={direction ?? dir}>
      {children}
    </DirectionProviderPrimitive>
  )
}

export { DirectionProvider, useDirection }
