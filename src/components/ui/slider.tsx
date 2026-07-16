import * as React from 'react'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'

import { cn } from '@/lib/utils'

// Base UI anatomy: Root > Control > Track > (Indicator, Thumb). The new
// Control part is the pointer surface (radix Root handled that itself), so
// the interactive layout classes moved from Root onto Control.
// `thumbAlignment="edge"` keeps thumbs inside the track bounds, matching
// radix's geometry (Base UI defaults to "center").
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      className={cn(
        'relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="flex w-full touch-none items-center select-none data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            'relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5'
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={cn(
              'absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full'
            )}
          />
          {Array.from({ length: _values.length }, (_, index) => (
            <SliderPrimitive.Thumb
              data-slot="slider-thumb"
              key={index}
              index={index}
              className="block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 has-[input:focus-visible]:ring-4 data-disabled:pointer-events-none data-disabled:opacity-50"
            />
          ))}
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
