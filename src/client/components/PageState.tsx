/**
 * PageState — the canonical loading / error / empty wrappers.
 *
 * Every async list, grid, table, or detail renders three states the
 * same way:
 *
 *   {query.isLoading && <PageLoading />}
 *   {query.isError && <PageError onRetry={query.refetch} />}
 *   {query.data && empty(query.data) && <PageEmpty … />}
 *   {query.data && !empty(query.data) && <Body data={query.data} />}
 *
 * The wrappers compose the existing EmptyState + Skeleton primitives
 * but lock in the visual language: skeleton matches body shape, error
 * has retry, empty has clear next action.
 */
import { AlertTriangle, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/client/components/EmptyState'
import { cn } from '@/lib/utils'

// ─── Loading ──────────────────────────────────────────────────────────

interface PageLoadingProps {
  /** Match the loaded shape — list rows or stat row or grid. */
  variant?: 'list' | 'grid' | 'detail' | 'spinner'
  /** Number of skeleton rows / cards (default: 5 for list, 6 for grid). */
  count?: number
  className?: string
}

export function PageLoading({ variant = 'list', count, className }: PageLoadingProps) {
  if (variant === 'spinner') {
    return (
      <div className={cn('flex h-32 items-center justify-center', className)}>
        <Spinner size="lg" className="text-muted-foreground" />
      </div>
    )
  }
  if (variant === 'list') {
    const n = count ?? 5
    return (
      <div className={cn('divide-y rounded-md border bg-card overflow-hidden', className)}>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-4 rounded" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3 rounded" />
              <Skeleton className="h-2.5 w-1/3 rounded" />
            </div>
            <Skeleton className="size-3.5 rounded" />
          </div>
        ))}
      </div>
    )
  }
  if (variant === 'grid') {
    const n = count ?? 6
    return (
      <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="rounded-md border bg-card p-4 space-y-2">
            <Skeleton className="h-4 w-2/3 rounded" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    )
  }
  // detail
  return (
    <div className={cn('space-y-4', className)}>
      <Skeleton className="h-6 w-1/3 rounded" />
      <Skeleton className="h-4 w-2/3 rounded" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-3/4 rounded" />
      </div>
    </div>
  )
}

// ─── Error ────────────────────────────────────────────────────────────

interface PageErrorProps {
  /** Title for the error state. Default: "Couldn't load this page." */
  title?: string
  /** Optional explanation to set expectations. */
  description?: string
  /** Callback to retry — wires into TanStack `refetch`. */
  onRetry?: () => void
  className?: string
}

export function PageError({
  title = "Couldn't load this page",
  description = 'Try again — usually a transient hiccup. If it keeps happening, the server may be slow or the network is dropping.',
  onRetry,
  className,
}: PageErrorProps) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={description}
      action={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
      className={className}
    />
  )
}

// ─── Empty (re-export for symmetry) ───────────────────────────────────

interface PageEmptyProps {
  icon: LucideIcon
  title: string
  description?: string
  tips?: string[]
  action?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
  className?: string
}

export function PageEmpty({
  icon,
  title,
  description,
  tips,
  action,
  secondaryAction,
  className,
}: PageEmptyProps) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      tips={tips}
      action={action}
      secondaryAction={secondaryAction}
      className={className}
    />
  )
}

PageLoading.displayName = 'PageLoading'
PageError.displayName = 'PageError'
PageEmpty.displayName = 'PageEmpty'

export { Button } // re-export so consumers don't have to add an extra import for retry buttons
