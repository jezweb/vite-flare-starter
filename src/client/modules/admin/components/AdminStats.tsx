/**
 * Admin Stats Component
 *
 * Displays key metrics for the admin dashboard via the shared StatGrid
 * primitive — same shape Files / Activity use, so all stat rows in the
 * app look the same.
 */

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatGrid } from '@/components/ui/stat-grid'
import { useAdminStats } from '../hooks/useAdmin'
import { AlertCircle } from 'lucide-react'

export function AdminStats() {
  const { data: stats, isLoading, error } = useAdminStats()

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-md border bg-card p-3 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    )
  }

  if (error || !stats) {
    // Silently returning null hides an actual API failure from the admin — surface it
    // so the page doesn't appear broken without an explanation.
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex items-start gap-3 py-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          <div className="space-y-0.5">
            <p className="font-medium text-destructive">Couldn't load stats</p>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : 'Check your connection and try again.'}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <StatGrid
      items={[
        {
          label: 'Total users',
          value: stats.totalUsers.toLocaleString(),
          sub: 'Registered accounts',
        },
        {
          label: 'Active sessions',
          value: stats.activeSessionsCount.toLocaleString(),
          sub: 'Currently logged in',
        },
        {
          label: 'New (7 days)',
          value: stats.usersCreatedLast7Days.toLocaleString(),
          sub: 'Users this week',
        },
        {
          label: 'New (30 days)',
          value: stats.usersCreatedLast30Days.toLocaleString(),
          sub: 'Users this month',
        },
      ]}
    />
  )
}
