/**
 * ListRow — the canonical "queue row" pattern.
 *
 * Used wherever we render a list of things the user scans top-to-bottom
 * (Inbox, Approvals, Activity, Notifications, Routines). The shape is:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  [icon]  Primary text · metadata strip            [chevron]  │
 *   │          secondary metadata · timestamps                     │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Compose three slots:
 *   - `<ListRow.Icon>` — leading status / type indicator
 *   - `<ListRow.Body>` — primary text + metadata children
 *   - `<ListRow.Trailing>` — chevron / action / badge
 *
 * Wrap rows in `<ListRowGroup>` for the divide-y border treatment.
 *
 * Variants:
 *   - `unread` — subtle primary tint + bold text
 *   - `urgent` — amber tint + amber border-left accent
 *   - `disabled` — muted + reduced opacity
 *
 * Use `asChild` to render the row as a Link or button while keeping
 * the layout (Radix Slot pattern, same as Button + DropdownMenuItem).
 */
import * as React from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const listRowVariants = cva(
  'group/list-row flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
  {
    variants: {
      variant: {
        default: 'hover:bg-muted/30',
        plain: '',
      },
      state: {
        default: '',
        unread: 'bg-primary/5 hover:bg-primary/10',
        urgent: 'bg-amber-500/5 hover:bg-amber-500/10',
        disabled: 'opacity-60',
      },
      interactive: {
        true: 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      state: 'default',
      interactive: false,
    },
  }
)

interface ListRowProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof listRowVariants> {
  asChild?: boolean
}

const ListRow = React.forwardRef<HTMLElement, ListRowProps>(
  ({ className, variant, state, interactive, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot.Slot : 'div'
    return (
      <Comp
        ref={ref as React.Ref<HTMLDivElement>}
        data-slot="list-row"
        className={cn(
          listRowVariants({
            variant,
            state,
            interactive: interactive ?? asChild,
            className,
          })
        )}
        {...props}
      />
    )
  }
)
ListRow.displayName = 'ListRow'

const ListRowIcon = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="list-row-icon"
      className={cn('shrink-0 [&>svg]:size-4', className)}
      {...props}
    />
  )
)
ListRowIcon.displayName = 'ListRow.Icon'

const ListRowBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="list-row-body"
      className={cn('min-w-0 flex-1', className)}
      {...props}
    />
  )
)
ListRowBody.displayName = 'ListRow.Body'

/** Primary text — bold when state is "unread". */
const ListRowTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement> & { unread?: boolean }
>(({ className, unread, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="list-row-title"
    className={cn('truncate text-sm', unread && 'font-medium', className)}
    {...props}
  />
))
ListRowTitle.displayName = 'ListRow.Title'

/**
 * Metadata strip — small text, separated by middle-dot. Use this for
 * the secondary "timestamp · author · status" line.
 *
 * Children separated by a · automatically via flex-gap; pass siblings
 * directly. For multiple sections, repeat ListRow.Meta blocks.
 */
const ListRowMeta = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="list-row-meta"
      className={cn(
        'mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground truncate',
        '[&>span]:truncate',
        className
      )}
      {...props}
    />
  )
)
ListRowMeta.displayName = 'ListRow.Meta'

const ListRowTrailing = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="list-row-trailing"
      className={cn('shrink-0 flex items-center gap-2', className)}
      {...props}
    />
  )
)
ListRowTrailing.displayName = 'ListRow.Trailing'

const ListRowGroup = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-slot="list-row-group"
      className={cn('divide-y rounded-md border bg-card overflow-hidden', className)}
      {...props}
    />
  )
)
ListRowGroup.displayName = 'ListRowGroup'

export {
  ListRow,
  ListRowIcon,
  ListRowBody,
  ListRowTitle,
  ListRowMeta,
  ListRowTrailing,
  ListRowGroup,
}
