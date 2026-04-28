/**
 * KeyValueRow — the canonical row inside a HelpDisclosure / technical
 * detail panel. Two columns: label (uppercase eyebrow) + value (mono
 * for IDs, plain for human text). Stacks on mobile.
 *
 * Use only inside HelpDisclosure or a Section labelled "Technical
 * details". For user-facing key-value pairs, prefer ListRow.Meta or
 * a regular description list.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

interface KeyValueRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode
  value: React.ReactNode
  /** Render value as monospace (IDs, slugs, JSON snippets). */
  mono?: boolean
}

export function KeyValueRow({
  label,
  value,
  mono = false,
  className,
  ...rest
}: KeyValueRowProps) {
  return (
    <div
      data-slot="key-value-row"
      className={cn(
        'grid gap-1 py-1.5 sm:grid-cols-[8rem_1fr] sm:gap-3',
        className,
      )}
      {...rest}
    >
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          'text-xs',
          mono ? 'font-mono break-all' : 'leading-relaxed',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

interface KeyValueListProps extends React.HTMLAttributes<HTMLElement> {}

export function KeyValueList({ className, ...rest }: KeyValueListProps) {
  return (
    <dl
      data-slot="key-value-list"
      className={cn('divide-y rounded-md border bg-muted/30', className)}
      {...rest}
    />
  )
}

KeyValueRow.displayName = 'KeyValueRow'
KeyValueList.displayName = 'KeyValueList'
