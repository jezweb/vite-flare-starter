/**
 * Activity Page
 *
 * Displays user activity log with filtering and statistics.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useActivities, useActivityStats, type Activity } from '../hooks/useActivity'
import { EmptyState } from '@/client/components/EmptyState'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageFilters, PageFilterGroup } from '@/components/ui/page-filters'
import { StatGrid } from '@/components/ui/stat-grid'
import { PageLoading } from '@/client/components/PageState'
import {
  ListRow,
  ListRowIcon,
  ListRowBody,
  ListRowMeta,
  ListRowTrailing,
} from '@/components/ui/list-row'
import { VirtualActivityList } from '../components/VirtualActivityList'
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

// Server caps `limit` at 100; 100 + virtualization is smoother than
// previous 20-row pages because the user pages less often.
const PAGE_SIZE = 100

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
  create: 'bg-green-500/10 dark:bg-green-500/15 text-green-600 dark:text-green-400',
  update: 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400',
  delete: 'bg-red-500/10 dark:bg-red-500/15 text-red-600 dark:text-red-400',
  archive: 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400',
  restore: 'bg-purple-500/10 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400',
  import: 'bg-cyan-500/10 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  export: 'bg-orange-500/10 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400',
  assign: 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  unassign: 'bg-pink-500/10 dark:bg-pink-500/15 text-pink-600 dark:text-pink-400',
  view: 'bg-slate-500/10 dark:bg-slate-500/20 text-slate-600 dark:text-slate-300',
  convert: 'bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
}

function formatTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true })
  } catch {
    return 'recently'
  }
}

function formatActionVerb(action: Activity['action']): string {
  switch (action) {
    case 'create': return 'Created'
    case 'update': return 'Updated'
    case 'delete': return 'Deleted'
    case 'archive': return 'Archived'
    case 'restore': return 'Restored'
    case 'import': return 'Imported'
    case 'export': return 'Exported'
    case 'assign': return 'Assigned'
    case 'unassign': return 'Unassigned'
    case 'view': return 'Viewed'
    case 'convert': return 'Converted'
    default: return action
  }
}

function formatEntityType(type: string): string {
  if (!type) return ''
  return type.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

/**
 * Derive a deep-link for an activity row, when the entity is reachable
 * in-app. Returns null for entities that have no destination page (e.g.
 * `user` for signup events, or `session` for login events).
 */
function activityHref(activity: Activity): string | null {
  if (!activity.entityId) return null
  switch (activity.entityType) {
    case 'conversation':
      return `/dashboard/chat/${activity.entityId}`
    case 'project':
      return `/dashboard/projects/${activity.entityId}`
    case 'file':
      return `/dashboard/files?file=${activity.entityId}`
    default:
      return null
  }
}

function ActivityItem({ activity }: { activity: Activity }) {
  const Icon = ACTION_ICONS[activity.action] || ActivityIcon
  const colorClass = ACTION_COLORS[activity.action] || 'bg-muted text-muted-foreground'
  const href = activityHref(activity)

  const inner = (
    <>
      <ListRowIcon>
        <div className={`flex size-7 items-center justify-center rounded-full ${colorClass}`}>
          <Icon className="size-3.5" />
        </div>
      </ListRowIcon>
      <ListRowBody>
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium shrink-0">{formatActionVerb(activity.action)}</p>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 leading-3">
            {formatEntityType(activity.entityType)}
          </Badge>
          {/* Show entityName when the row has a real label. Falling
              through to the raw entityId surfaces meaningless hex
              ("xvIsfu0FYPuMG…") which adds zero info — the entity-type
              badge already tells the user what was created. */}
          {activity.entityName && (
            <span className="text-sm text-muted-foreground truncate">
              {activity.entityName}
            </span>
          )}
        </div>
        <ListRowMeta>
          <span>{formatTime(activity.createdAt)}</span>
        </ListRowMeta>
      </ListRowBody>
      {href && (
        <ListRowTrailing>
          <ChevronRight className="size-3.5 text-muted-foreground/50 group-hover/list-row:text-foreground transition-colors" />
        </ListRowTrailing>
      )}
    </>
  )

  if (href) {
    return (
      <ListRow asChild>
        <Link to={href}>{inner}</Link>
      </ListRow>
    )
  }

  return <ListRow variant="plain">{inner}</ListRow>
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
    <PageContainer type="queue">
      <PageHeader
        title="Activity"
        subtitle="Every action on your account — sign-ins, items created, updated, archived — with timestamps."
      />

      <StatGrid
        items={[
          { label: 'Total', value: statsLoading ? '—' : stats?.total ?? 0 },
          { label: 'Today', value: statsLoading ? '—' : stats?.today ?? 0 },
          { label: 'This week', value: statsLoading ? '—' : stats?.thisWeek ?? 0 },
        ]}
      />

      <PageFilters>
        <span />
        <PageFilterGroup>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-8 w-[170px]">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="create">Created</SelectItem>
              <SelectItem value="update">Updated</SelectItem>
              <SelectItem value="delete">Deleted</SelectItem>
              <SelectItem value="archive">Archived</SelectItem>
              <SelectItem value="restore">Restored</SelectItem>
              <SelectItem value="import">Imported</SelectItem>
              <SelectItem value="export">Exported</SelectItem>
              <SelectItem value="assign">Assigned</SelectItem>
              <SelectItem value="unassign">Unassigned</SelectItem>
              <SelectItem value="view">Viewed</SelectItem>
              <SelectItem value="convert">Converted</SelectItem>
            </SelectContent>
          </Select>
        </PageFilterGroup>
      </PageFilters>

      {activitiesLoading ? (
        <PageLoading variant="list" count={6} />
      ) : activities.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title={actionFilter !== 'all' ? `No ${actionFilter} actions yet` : 'No activity yet'}
          description={
            actionFilter !== 'all'
              ? 'Try a different filter, or come back after using the app.'
              : 'Creating, editing, or deleting anything in the app will show up here as an audit trail.'
          }
        />
      ) : (
        <VirtualActivityList
          activities={activities}
          renderRow={(activity) => <ActivityItem activity={activity} />}
        />
      )}

      {/* Pagination — hidden while loading so the "Page 1" label
          doesn't flash over skeleton rows on first mount. */}
      {!activitiesLoading && activities.length > 0 && (
        <div className="flex items-center justify-between">
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
    </PageContainer>
  )
}
