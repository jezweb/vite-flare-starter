import * as React from 'react'

import { cn } from '@/lib/utils'

// Base UI has no AspectRatio primitive — the radix `ratio` prop maps
// directly to the CSS `aspect-ratio` property (via the `--ratio` var).
// Media children should carry `w-full h-full object-cover` themselves
// (radix absolutely-positioned the child; CSS aspect-ratio does not).
function AspectRatio({
  ratio = 1,
  className,
  style,
  ...props
}: React.ComponentProps<'div'> & { ratio?: number }) {
  return (
    <div
      data-slot="aspect-ratio"
      style={{ '--ratio': ratio, ...style } as React.CSSProperties}
      className={cn('aspect-(--ratio)', className)}
      {...props}
    />
  )
}

export { AspectRatio }
