/**
 * Activity Page
 *
 * Displays user activity log with filtering and statistics.
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useActivities, useActivityStats, type Activity } from '../hooks/useActivity'
import {
  Activity as ActivityIcon,
  Plus,
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
  Upload,
  Download,
  UserPlus,
  UserMinus,
  Eye,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const PAGE_SIZE = 20

const ACTION_ICONS: Record<Activity['action'], React.ElementType> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  archive: Archive,
  restore: RotateCcw,
  import: Upload,
  export: Download,
  assign: UserPlus,
  unassign: UserMinus,
  view: Eye,
  convert: ArrowRightLeft,
}

const ACTION_COLORS: Record<Activity['action'], string> = {
  create: 'bg-green-500/10 text-green-600',
  update: 'bg-blue-500/10 text-blue-600',
  delete: 'bg-red-500/10 text-red-600',
  archive: 'bg-yellow-500/10 text-yellow-600',
  restore: 'bg-purple-500/10 text-purple-600',
  import: 'bg-cyan-500/10 text-cyan-600',
  export: 'bg-orange-500/10 text-orange-600',
  assign: 'bg-emerald-500/10 text-emerald-600',
  unassign: 'bg-pink-500/10 text-pink-600',
  view: 'bg-slate-500/10 text-slate-600',
  convert: 'bg-indigo-500/10 text-indigo-600',
}

function formatTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true })
  } catch {
    return 'recently'
  }
}

function ActivityItem({ activity }: { activity: Activity }) {
  const Icon = ACTION_ICONS[activity.action] || ActivityIcon
  const colorClass = ACTION_COLORS[activity.action] || 'bg-muted text-muted-foreground'

  return (
    <div className="flex items-start gap-4 rounded-lg border p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colorClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-medium capitalize">{activity.action}</p>
          <Badge variant="outline" className="text-xs">
            {activity.entityType}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {activity.entityName || activity.entityId}
        </p>
        <p className="text-xs text-muted-foreground">{formatTime(activity.createdAt)}</p>
      </div>
    </div>
  )
}

function StatsCard({ title, value, loading }: { title: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-bold">{value}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function ActivityPage() {
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState<string>('all')

  const { data: stats, isLoading: statsLoading } = useActivityStats()
  const { data: activitiesData, isLoading: activitiesLoading } = useActivities({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    action: actionFilter !== 'all' ? (actionFilter as Activity['action']) : undefined,
  })

  const activities = activitiesData?.activities ?? []
  const hasMore = activitiesData?.hasMore ?? false

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ActivityIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground">View your recent activity and actions</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard title="Total Activities" value={stats?.total ?? 0} loading={statsLoading} />
        <StatsCard title="Today" value={stats?.today ?? 0} loading={statsLoading} />
        <StatsCard title="This Week" value={stats?.thisWeek ?? 0} loading={statsLoading} />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>A record of your actions</CardDescription>
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="view">View</SelectItem>
                <SelectItem value="export">Export</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {activitiesLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ActivityIcon className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium">No Activity Yet</p>
              <p className="text-sm text-muted-foreground">
                Your actions will appear here as you use the application.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {activities.length > 0 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasMore}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
