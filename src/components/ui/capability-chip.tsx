/**
 * CapabilityChip — small inline badge that says "Gmail connected" or
 * "Drive · Calendar · 22 skills". Used on the Chat empty state and on
 * the Dashboard hero so users can see what their AI can do at a glance.
 *
 * Three states:
 *   - active     → coloured ring + dot, "Connected"
 *   - inactive   → muted, "Connect Gmail" (link variant)
 *   - count      → just a number + label ("22 skills")
 */
import * as React from 'react'
import { Slot } from 'radix-ui'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CapabilityChipProps extends React.HTMLAttributes<HTMLElement> {
  icon?: LucideIcon
  label: React.ReactNode
  state?: 'active' | 'inactive' | 'count'
  asChild?: boolean
}

export function CapabilityChip({
  icon: Icon,
  label,
  state = 'active',
  asChild,
  className,
  ...rest
}: CapabilityChipProps) {
  const Comp = asChild ? Slot.Slot : 'span'
  return (
    <Comp
      data-slot="capability-chip"
      data-state={state}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        state === 'active' && 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
        state === 'inactive' && 'border-dashed border-border text-muted-foreground hover:text-foreground hover:border-border',
        state === 'count' && 'border-border bg-muted/50 text-muted-foreground',
        asChild && 'cursor-pointer',
        className,
      )}
      {...rest}
    >
      {state === 'active' && (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-emerald-500"
        />
      )}
      {Icon && <Icon className="size-3" />}
      <span>{label}</span>
    </Comp>
  )
}

interface CapabilityRowProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CapabilityRow({ className, ...rest }: CapabilityRowProps) {
  return (
    <div
      data-slot="capability-row"
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      {...rest}
    />
  )
}

CapabilityChip.displayName = 'CapabilityChip'
CapabilityRow.displayName = 'CapabilityRow'
