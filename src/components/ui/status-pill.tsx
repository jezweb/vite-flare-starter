/**
 * StatusPill — semantic status badge built on STATUS_SOFT_BG tokens.
 *
 * Replaces:
 *   - Two private `StatusBadge` impls (Connectors + Approvals)
 *   - ~20 inline `<Badge variant="outline" className="text-[10px] px-1.5 py-0 ...">`
 *     pills sprinkled across modules
 *
 * Pick the kind that matches your meaning, not the colour:
 *
 *   <StatusPill kind="success" label="Connected" />
 *   <StatusPill kind="warning" label="Pending" />
 *   <StatusPill kind="danger" label="Failed" />
 *   <StatusPill kind="info" label="Approved" />
 *   <StatusPill kind="neutral" label="Disabled" />
 *
 * Supports an optional leading icon and a `dense` variant for tight
 * row metadata (default size matches the inline `text-[10px] px-1.5
 * py-0` pattern that's already most-common).
 */
import * as React from 'react'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'
import { STATUS_SOFT_BG, type StatusKind } from '@/client/lib/status-colors'

type Kind = StatusKind | 'neutral'

interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  kind?: Kind
  label: React.ReactNode
  /** Optional Lucide icon component or inline SVG. */
  icon?: React.ReactNode
  /** `default` — text-[10px], inline metadata. `lg` — text-xs, page-level chips. */
  size?: 'default' | 'lg'
  /** Render as a child (e.g. asChild → Link) via Radix Slot. */
  asChild?: boolean
}

const neutralClasses = 'bg-muted text-muted-foreground border-border'

export function StatusPill({
  kind = 'neutral',
  label,
  icon,
  size = 'default',
  asChild,
  className,
  ...rest
}: StatusPillProps) {
  const Comp = asChild ? Slot.Slot : 'span'
  const palette = kind === 'neutral' ? neutralClasses : STATUS_SOFT_BG[kind]
  return (
    <Comp
      data-slot="status-pill"
      data-status-kind={kind}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border whitespace-nowrap',
        palette,
        size === 'default' && 'px-1.5 py-0 h-4 text-[10px] leading-none',
        size === 'lg' && 'px-2.5 py-0.5 text-xs leading-none',
        className
      )}
      {...rest}
    >
      {icon && <span className="[&>svg]:size-3 inline-flex">{icon}</span>}
      <span>{label}</span>
    </Comp>
  )
}

StatusPill.displayName = 'StatusPill'
