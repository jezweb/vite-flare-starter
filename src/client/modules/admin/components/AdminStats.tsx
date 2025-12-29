/**
 * Admin Stats Component
 *
 * Displays key metrics cards for the admin dashboard.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminStats } from '../hooks/useAdmin'
import { Users, Activity, TrendingUp, Calendar } from 'lucide-react'

export function AdminStats() {
  const { data: stats, isLoading, error } = useAdminStats()

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-1 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error || !stats) {
    return null
  }

  const cards = [
    {
      title: 'Total Users',
      value: stats.totalUsers,
      description: 'Registered accounts',
      icon: Users,
    },
    {
      title: 'Active Sessions',
      value: stats.activeSessionsCount,
      description: 'Currently logged in',
      icon: Activity,
    },
    {
      title: 'New (7 days)',
      value: stats.usersCreatedLast7Days,
      description: 'Users this week',
      icon: TrendingUp,
    },
    {
      title: 'New (30 days)',
      value: stats.usersCreatedLast30Days,
      description: 'Users this month',
      icon: Calendar,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
