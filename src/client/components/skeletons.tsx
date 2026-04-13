/**
 * Skeleton Loading Patterns
 *
 * Composite skeleton components for common layouts.
 * Use these instead of spinners for content that has a known shape.
 *
 * @example
 * {isLoading ? <CardSkeleton /> : <RealCard data={data} />}
 * {isLoading ? <TableSkeleton rows={5} /> : <DataTable data={data} />}
 */
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

/** Single stat card skeleton */
export function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
        <Skeleton className="mt-2 h-3 w-32" />
      </CardContent>
    </Card>
  )
}

/** Row of stat cards */
export function StatsRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  )
}

/** Content card with title and body text */
export function ContentCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64 mt-1" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </CardContent>
    </Card>
  )
}

/** Table row skeleton */
function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-border">
      {Array.from({ length: cols }, (_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: `${i === 0 ? 30 : 15 + Math.random() * 20}%` }}
        />
      ))}
    </div>
  )
}

/** Table with header and rows */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Card>
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-4">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className="h-3" style={{ width: `${15 + Math.random() * 15}%` }} />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <TableRowSkeleton key={i} cols={cols} />
      ))}
    </Card>
  )
}

/** Chart placeholder */
export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full rounded-lg" style={{ height }} />
      </CardContent>
    </Card>
  )
}

/** Full page skeleton (stats + table) */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <StatsRowSkeleton />
      <TableSkeleton />
    </div>
  )
}

/** List item skeleton */
export function ListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}

/** List of items */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: count }, (_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
  )
}
