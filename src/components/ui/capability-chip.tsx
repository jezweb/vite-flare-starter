/**
 * CapabilityChip — small inline badge that says "Gmail connected" or
 * "Drive · Calendar · 22 skills". Used on the Chat empty state and on
 * the Dashboard hero so users can see what their AI can do at a glance.
 *
 * Three states:
 *   - active     → coloured ring + dot, "Connected"
 *   - inactive   → muted, "Connect Gmail"
 *   - count      → just a number + label ("22 skills")
 *
 * The chip is purely visual — to make a chip clickable, wrap it in a
 * `<Link>` or `<button>`. Don't try to use Radix `asChild` here: the
 * chip composes internal layout (dot + icon + label spans) which
 * violates Slot's single-child contract.
 *
 *   <Link to="/dashboard/connections" className="rounded-full">
 *     <CapabilityChip icon={Mail} label="Gmail" />
 *   </Link>
 */
import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CapabilityChipProps extends React.HTMLAttributes<HTMLElement> {
  icon?: LucideIcon
  label: React.ReactNode
  state?: 'active' | 'inactive' | 'count'
}

export function CapabilityChip({
  icon: Icon,
  label,
  state = 'active',
  className,
  ...rest
}: CapabilityChipProps) {
  return (
    <span
      data-slot="capability-chip"
      data-state={state}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        state === 'active' &&
          'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
        state === 'inactive' &&
          'border-dashed border-border text-muted-foreground hover:text-foreground hover:border-border',
        state === 'count' && 'border-border bg-muted/50 text-muted-foreground',
        className
      )}
      {...rest}
    >
      {state === 'active' && (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
      )}
      {Icon && <Icon className="size-3" />}
      <span>{label}</span>
    </span>
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
