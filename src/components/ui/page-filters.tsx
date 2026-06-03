/**
 * PageFilters — the canonical "narrow this list" primitive.
 *
 * Used between PageHeader and a list/grid body. Wraps the tabs + chip
 * pattern Inbox invented so every filterable list looks the same.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  [Tab1] [Tab2] [Tab3]            label: [chip] [chip] clear  │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Compose:
 *   <PageFilters>
 *     <PageFilterTabs value={…} onValueChange={…}>…</PageFilterTabs>
 *     <PageFilterGroup label="Importance:">
 *       <PageFilterChip active={…} onClick={…}>High</PageFilterChip>
 *     </PageFilterGroup>
 *   </PageFilters>
 */
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface PageFiltersProps extends React.HTMLAttributes<HTMLDivElement> {}

export function PageFilters({ className, children, ...rest }: PageFiltersProps) {
  return (
    <div
      data-slot="page-filters"
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

interface PageFilterTabsProps {
  value: string
  onValueChange: (v: string) => void
  children: React.ReactNode
  className?: string
}

export function PageFilterTabs({ value, onValueChange, children, className }: PageFilterTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList className={className}>{children}</TabsList>
    </Tabs>
  )
}
PageFilterTabs.Trigger = TabsTrigger

interface PageFilterGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string
  onClear?: () => void
}

export function PageFilterGroup({
  label,
  onClear,
  className,
  children,
  ...rest
}: PageFilterGroupProps) {
  return (
    <div
      data-slot="page-filter-group"
      className={cn('flex items-center gap-1.5', className)}
      {...rest}
    >
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
      {children}
      {onClear && (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClear}>
          clear
        </Button>
      )}
    </div>
  )
}

interface PageFilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export function PageFilterChip({ active, className, children, ...rest }: PageFilterChipProps) {
  return (
    <button
      data-slot="page-filter-chip"
      data-active={active ? 'true' : undefined}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

PageFilters.displayName = 'PageFilters'
