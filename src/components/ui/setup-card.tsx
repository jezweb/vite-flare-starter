/**
 * SetupCard — a single step in a first-run setup checklist.
 *
 * Used on Dashboard Home in the "Get set up" panel. Each card represents
 * one onboarding action: connect Gmail, try a chat, create a routine.
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  [icon]  Connect Gmail                          [→]      │
 *   │          One click — your AI will be able to read mail. │
 *   └─────────────────────────────────────────────────────────┘
 *
 * State:
 *   - default → bordered, hover lifts
 *   - completed → muted with a green check and strikethrough title
 *   - active   → primary tint to draw the eye to the next step
 */
import * as React from 'react'
import { Slot } from 'radix-ui'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SetupCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  icon: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  state?: 'default' | 'active' | 'completed'
  /** Render as a Link / button (Radix Slot pattern). */
  asChild?: boolean
}

export function SetupCard({
  icon: Icon,
  title,
  description,
  state = 'default',
  asChild,
  className,
  children,
  ...rest
}: SetupCardProps) {
  const Comp = asChild ? Slot.Slot : 'div'
  return (
    <Comp
      data-slot="setup-card"
      data-state={state}
      className={cn(
        'group/setup flex items-center gap-3 rounded-md border p-3 transition-colors',
        state === 'default' && 'bg-card hover:bg-muted/50',
        state === 'active' && 'border-primary/40 bg-primary/5 hover:bg-primary/10',
        state === 'completed' && 'bg-muted/40 opacity-80',
        asChild && 'cursor-pointer',
        className
      )}
      {...rest}
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md',
          state === 'completed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-foreground'
        )}
      >
        {state === 'completed' ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-medium',
            state === 'completed' && 'line-through text-muted-foreground'
          )}
        >
          {title}
        </p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{description}</p>
        )}
      </div>
      {asChild && state !== 'completed' && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/setup:translate-x-0.5" />
      )}
      {/* Children render on the right when not asChild — useful for badges. */}
      {!asChild && children && <div className="shrink-0 flex items-center gap-2">{children}</div>}
    </Comp>
  )
}

interface SetupCardListProps extends React.HTMLAttributes<HTMLDivElement> {}

export function SetupCardList({ className, ...rest }: SetupCardListProps) {
  return <div data-slot="setup-card-list" className={cn('grid gap-2', className)} {...rest} />
}

SetupCard.displayName = 'SetupCard'
SetupCardList.displayName = 'SetupCardList'
